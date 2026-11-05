import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupGerenteTestUser,
  createGerenteAdminClient,
  createGerenteTestUser,
  signInAsGerente,
  type GerenteTestUser,
} from "./fixtures/gerente-user";
import {
  createPayable,
  createReceivable,
  openPayables,
  openReceivables,
  payInFull,
  readOperationalBalance,
  rowWithAmount,
  uniqueMarker,
} from "./fixtures/contas-a-pagar";

test.setTimeout(150_000);

let admin: SupabaseClient | undefined;
let gerente: GerenteTestUser | undefined;

test.beforeEach(async ({ page }) => {
  admin = createGerenteAdminClient();
  gerente = await createGerenteTestUser(admin);
  await signInAsGerente(page, gerente);
});

test.afterEach(async () => {
  if (admin && gerente) await cleanupGerenteTestUser(admin, gerente.id);
  admin = undefined;
  gerente = undefined;
});

test("Gerente dá baixa em Contas a Pagar dispensando o comprovante", async ({ page }) => {
  await openPayables(page);
  const marcador = uniqueMarker("BAIXA GERENTE");
  const { bankName } = await createPayable(page, { amountDigits: "312100", observacoes: marcador });

  const row = rowWithAmount(page, "3.121,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const saldoAntes = await readOperationalBalance(page, bankName);

  // payInFull marca "Dispensar comprovante": sem essa opção o Gerente não consegue
  // concluir a baixa sem anexo.
  await payInFull(page, row);

  // A baixa move o saldo operacional e tira o título da fila de Contas a Pagar.
  await expect(row).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(
    async () => Math.round((await readOperationalBalance(page, bankName)) * 100) / 100,
    { timeout: 30_000 },
  ).toBe(Math.round((saldoAntes - 3121) * 100) / 100);

  // O título segue aguardando a aprovação do Master para entrar no saldo confirmado.
  const { data: titulos, error } = await admin!
    .from("lancamentos_financeiros")
    .select("status_aprovacao, valor_recebido")
    .like("observacoes", `%${marcador}%`);
  if (error) throw error;
  expect(titulos).toHaveLength(1);
  expect(titulos![0].status_aprovacao).toBe("digital");
  expect(Number(titulos![0].valor_recebido)).toBe(3121);
});

test("Gerente recebe um título em Contas a Receber dispensando o comprovante", async ({ page }) => {
  await openReceivables(page);
  const { bankName } = await createReceivable(page, { amountDigits: "99303" });

  const row = rowWithAmount(page, "993,03").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const saldoAntes = await readOperationalBalance(page, bankName);

  await payInFull(page, row);

  await expect(row).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(
    async () => Math.round((await readOperationalBalance(page, bankName)) * 100) / 100,
    { timeout: 30_000 },
  ).toBe(Math.round((saldoAntes + 993.03) * 100) / 100);
});

test("Gerente exclui um título pelo menu de ações e não vê Estornar", async ({ page }) => {
  await openPayables(page);
  await createPayable(page, { amountDigits: "177100" });

  const row = rowWithAmount(page, "1.771,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  await row.getByTestId("lancamento-action-menu").click();
  // Contas a Pagar oferece AVR e Excluir; Estornar é ação do Financeiro.
  await expect(page.getByTestId("action-avr")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("action-excluir")).toBeVisible();
  await expect(page.getByTestId("action-estornar")).toHaveCount(0);

  page.on("dialog", dialog => dialog.accept());
  await page.getByTestId("action-excluir").click();

  await expect(row).toHaveCount(0, { timeout: 30_000 });
});
