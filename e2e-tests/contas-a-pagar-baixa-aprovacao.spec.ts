import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupMasterTestUser,
  createMasterAdminClient,
  createMasterTestUser,
  signInAsMaster,
  type MasterTestUser,
} from "./fixtures/master-user";
import {
  allowBaixaWithoutReceipt,
  createPayable,
  openBaixa,
  openPayables,
  payInFull,
  readOperationalBalance,
  rowWithAmount,
} from "./fixtures/contas-a-pagar";

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

test("Master baixa o título integralmente e ele sai de Contas a Pagar", async ({ page }) => {
  await openPayables(page);
  const { bankName } = await createPayable(page, { amountDigits: "111100" });

  const row = rowWithAmount(page, "1.111,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const saldoAntes = await readOperationalBalance(page, bankName);

  await payInFull(page, row);

  // O título deixa a lista e o valor sai do saldo operacional da conta.
  await expect(row).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(
    async () => Math.round((await readOperationalBalance(page, bankName)) * 100) / 100,
    { timeout: 30_000 },
  ).toBe(Math.round((saldoAntes - 1111) * 100) / 100);
});

test("Master baixa parcialmente e o título fica como Pago Parcial", async ({ page }) => {
  await openPayables(page);
  await createPayable(page, { amountDigits: "222200" });

  const row = rowWithAmount(page, "2.222,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  await openBaixa(page, row);
  await page.locator("#baixa-valor-pago").fill("80000");
  await expect(page.locator("#baixa-valor-pago")).toHaveValue("800,00");
  await page.getByPlaceholder(/Explique o motivo/).fill("Pagamento parcial acertado com o fornecedor.");
  await allowBaixaWithoutReceipt(page);

  await page.getByRole("button", { name: "Confirmar Parcial" }).click();
  await expect(page.getByRole("heading", { name: "Confirmar Baixa de Título?" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Confirmar e Baixar" }).click();
  await expect(page.getByRole("heading", { name: "Operações de Baixa de Título" })).toBeHidden({ timeout: 30_000 });

  // O título continua em Contas a Pagar, com o valor pago e o status de baixa parcial.
  await expect(row.getByText("Pago Parcial").first()).toBeVisible({ timeout: 30_000 });
  await expect(row.getByText("R$ 800,00").first()).toBeVisible();
});

test("Master dá baixa por inatividade e o título sai de Contas a Pagar", async ({ page }) => {
  await openPayables(page);
  const { bankName } = await createPayable(page, { amountDigits: "333300" });

  const row = rowWithAmount(page, "3.333,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const saldoAntes = await readOperationalBalance(page, bankName);

  await openBaixa(page, row);
  await page.getByRole("button", { name: /^BPI/ }).click();
  await page.getByPlaceholder(/Explique o motivo/).fill("Título cancelado por inatividade, sem saída de caixa.");
  await allowBaixaWithoutReceipt(page);

  await page.getByRole("button", { name: "Baixar Título" }).click();
  await expect(page.getByRole("heading", { name: "Confirmar Baixa por Inatividade?" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Confirmar e Baixar" }).click();
  await expect(page.getByRole("heading", { name: "Operações de Baixa de Título" })).toBeHidden({ timeout: 30_000 });

  // A baixa por inatividade tira o título da lista sem mexer no saldo da conta.
  await expect(row).toHaveCount(0, { timeout: 30_000 });
  expect(await readOperationalBalance(page, bankName)).toBe(saldoAntes);
});

test("Baixa maior que o saldo da conta fica bloqueada", async ({ page }) => {
  await openPayables(page);
  await createPayable(page, { amountDigits: "9999900" });

  const row = rowWithAmount(page, "99.999,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  await openBaixa(page, row);
  await expect(page.getByText("Saldo Insuficiente", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Baixar Título" })).toBeDisabled();
});
