import { test, expect, type Locator, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupMasterTestUser,
  createMasterAdminClient,
  createMasterTestUser,
  signInAsMaster,
  type MasterTestUser,
} from "./fixtures/master-user";
import { createPayable, openPayables, rowWithAmount, rowWithParcela } from "./fixtures/contas-a-pagar";

test.setTimeout(120_000);

let admin: SupabaseClient | undefined;
let master: MasterTestUser | undefined;

test.beforeEach(async ({ page }) => {
  admin = createMasterAdminClient();
  master = await createMasterTestUser(admin);
  await signInAsMaster(page, master);
});

test.afterEach(async () => {
  if (admin && master) await cleanupMasterTestUser(admin, master.id);
  admin = undefined;
  master = undefined;
});

/** O item "AVR" do menu de ações abre o painel de lançamento em modo de ajuste de valor. */
async function openAvr(page: Page, row: Locator): Promise<void> {
  await row.getByTestId("lancamento-action-menu").click();
  await page.getByTestId("action-avr").click();
  await expect(page.getByRole("heading", { name: "Editar Lançamento" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("avr-panel")).toBeVisible({ timeout: 15_000 });
}

/** Os motivos de AVR vêm do banco; espera a lista carregar antes de escolher. */
async function selectAvrReason(page: Page): Promise<void> {
  const motivo = page.getByTestId("avr-motivo");
  await expect.poll(() => motivo.locator("option").count(), { timeout: 15_000 }).toBeGreaterThan(1);
  await motivo.selectOption({ index: 1 });
}

test("Master corrige o valor de um título com AVR sem gerar movimentação de caixa", async ({ page }) => {
  await openPayables(page);
  await createPayable(page, { amountDigits: "88422" });

  const original = rowWithAmount(page, "884,22").first();
  await expect(original).toBeVisible({ timeout: 30_000 });

  await openAvr(page, original);
  await selectAvrReason(page);
  await page.locator("#avr-valor-parcela").fill("90533");
  await expect(page.locator("#avr-valor-parcela")).toHaveValue("905,33");

  await page.getByRole("button", { name: "Salvar Registro" }).click();
  await expect(page.getByRole("heading", { name: "Confirmar ajuste AVR?" })).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("avr-confirmar").click();

  await expect(page.getByTestId("toast").last()).toContainText("AVR atualizado com sucesso!", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Editar Lançamento" })).toBeHidden({ timeout: 15_000 });

  const ajustado = rowWithAmount(page, "905,33").first();
  await expect(ajustado).toBeVisible({ timeout: 30_000 });
  await expect(rowWithAmount(page, "884,22")).toHaveCount(0);
  // Continua em aberto: a ação de baixa segue disponível e o título não virou liquidado.
  await expect(ajustado.getByRole("button", { name: /dar baixa/i })).toBeVisible();
  await expect(ajustado.getByText("A Vencer")).toBeVisible();

  // O ajuste fica registrado no histórico do título.
  await ajustado.getByText("Ver logs completo").click();
  await expect(page.getByRole("heading", { name: "Logs completos" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/\[AVR - Ajuste Realizado em/).first()).toBeVisible();

  // Nenhum valor pago: o ajuste não mexeu no caixa.
  await expect(ajustado.getByText("R$ 0,00").first()).toBeVisible();
});

test("AVR não salva sem motivo selecionado", async ({ page }) => {
  await openPayables(page);
  await createPayable(page, { amountDigits: "88423" });

  const row = rowWithAmount(page, "884,23").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  await openAvr(page, row);
  await page.getByRole("button", { name: "Salvar Registro" }).click();

  await expect(page.getByTestId("toast").last()).toContainText("Selecione um motivo para o AVR.", { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Editar Lançamento" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Confirmar ajuste AVR?" })).toBeHidden();
});

test("AVR em título a prazo propaga o novo valor para as parcelas em aberto", async ({ page }) => {
  await openPayables(page);
  // R$ 1.234,56 em 2 parcelas: R$ 617,28 cada.
  await createPayable(page, { amountDigits: "123456", condicao: "A Prazo", installments: 2 });

  const primeira = rowWithParcela(page, "1/2").filter({ hasText: "617,28" }).first();
  const segunda = rowWithParcela(page, "2/2").filter({ hasText: "617,28" }).first();
  await expect(primeira).toBeVisible({ timeout: 30_000 });
  await expect(segunda).toBeVisible({ timeout: 30_000 });

  await openAvr(page, primeira);
  await selectAvrReason(page);

  const grade = page.getByTestId("avr-parcelas");
  await expect(grade).toBeVisible({ timeout: 15_000 });
  const valorPrimeiraParcela = grade.locator("tbody tr").nth(0).locator('input[type="text"]');
  await valorPrimeiraParcela.fill("60000");
  await expect(valorPrimeiraParcela).toHaveValue("600,00");

  await page.getByRole("button", { name: "Salvar Registro" }).click();
  await expect(page.getByRole("heading", { name: "Confirmar ajuste AVR?" })).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("avr-propagar-todas-abertas").click();

  await expect(page.getByTestId("toast").last()).toContainText("AVR atualizado com sucesso!", { timeout: 30_000 });
  await expect(rowWithParcela(page, "1/2").filter({ hasText: "600,00" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(rowWithParcela(page, "2/2").filter({ hasText: "600,00" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("row").filter({ hasText: "617,28" })).toHaveCount(0);
});
