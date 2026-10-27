import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupMasterTestUser,
  createMasterAdminClient,
  createMasterTestUser,
  signInAsMaster,
  type MasterTestUser,
} from "./fixtures/master-user";
import { createPayable, openPayables, rowWithAmount } from "./fixtures/contas-a-pagar";

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

test("Gerar PDF do Filtro monta o relatório apenas com os títulos selecionados", async ({ page }) => {
  await openPayables(page);
  await createPayable(page, { amountDigits: "121100" });
  await createPayable(page, { amountDigits: "232200" });
  await createPayable(page, { amountDigits: "787700" });

  const primeira = rowWithAmount(page, "1.211,00").first();
  const segunda = rowWithAmount(page, "2.322,00").first();
  await expect(primeira).toBeVisible({ timeout: 30_000 });
  await expect(segunda).toBeVisible({ timeout: 30_000 });

  await primeira.getByRole("checkbox").check();
  await segunda.getByRole("checkbox").check();
  await expect(page.getByText(/^2 selecionados$/)).toBeVisible({ timeout: 30_000 });

  // A janela de impressão não é aberta: só registramos que o relatório foi disparado.
  await page.evaluate(() => {
    (window as unknown as { impressaoChamada: boolean }).impressaoChamada = false;
    window.print = () => {
      (window as unknown as { impressaoChamada: boolean }).impressaoChamada = true;
    };
  });

  await page.getByRole("button", { name: "Gerar PDF do Filtro" }).click();

  expect(await page.evaluate(() => (window as unknown as { impressaoChamada: boolean }).impressaoChamada)).toBe(true);
  await expect(page.locator("body.printing-lancamentos-report")).toHaveCount(1);

  const relatorio = page.locator(".lancamentos-print-report");
  const itens = relatorio.locator(".lancamentos-print-report__item");
  const resumo = relatorio.locator(".lancamentos-print-report__summary");
  const totalDoResumo = (rotulo: string) =>
    resumo.locator(".lancamentos-print-report__cell").filter({ hasText: rotulo }).locator(".lancamentos-print-report__value");

  // Cabeçalho do relatório.
  await expect(relatorio.locator(".lancamentos-print-report__header h1")).toHaveText("Contas a Pagar");
  await expect(relatorio.locator(".lancamentos-print-report__header")).toContainText("Relatório dos lançamentos selecionados");
  await expect(relatorio.locator(".lancamentos-print-report__meta")).toContainText("2 lançamentos");
  await expect(relatorio.locator(".lancamentos-print-report__meta")).toContainText(
    await page.evaluate(() => new Date().toLocaleDateString("pt-BR")),
  );

  // Só os títulos marcados entram no relatório.
  await expect(itens).toHaveCount(2);
  await expect(relatorio.locator(".lancamentos-print-report__items")).toContainText("1.211,00");
  await expect(relatorio.locator(".lancamentos-print-report__items")).toContainText("2.322,00");
  await expect(relatorio.locator(".lancamentos-print-report__items")).not.toContainText("7.877,00");

  // Totais do cálculo somam os dois títulos marcados.
  await expect(totalDoResumo("Valor parcela original")).toContainText("3.533,00");
  await expect(totalDoResumo("A pagar")).toContainText("3.533,00");

  // Desmarcando um título, o relatório passa a trazer apenas o que continua selecionado.
  await segunda.getByRole("checkbox").uncheck();
  await expect(page.getByText(/^1 selecionado$/)).toBeVisible({ timeout: 30_000 });

  await expect(itens).toHaveCount(1);
  await expect(relatorio.locator(".lancamentos-print-report__meta")).toContainText("1 lançamento");
  await expect(relatorio.locator(".lancamentos-print-report__items")).toContainText("1.211,00");
  await expect(relatorio.locator(".lancamentos-print-report__items")).not.toContainText("2.322,00");
  await expect(totalDoResumo("Valor parcela original")).toContainText("1.211,00");
});
