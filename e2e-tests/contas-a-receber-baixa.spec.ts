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
  createReceivable,
  openBaixa,
  openReceivables,
  payInFull,
  payPartially,
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

/** Saldo operacional da conta, arredondado para centavos. */
const saldo = (valor: number) => Math.round(valor * 100) / 100;

test("Master recebe o título integralmente e o saldo da conta aumenta", async ({ page }) => {
  await openReceivables(page);
  const { bankName } = await createReceivable(page, { amountDigits: "161600" });

  const row = rowWithAmount(page, "1.616,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const saldoAntes = await readOperationalBalance(page, bankName);

  await payInFull(page, row);

  // Título recebido sai da lista e o valor entra no saldo operacional da conta.
  await expect(row).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(
    async () => saldo(await readOperationalBalance(page, bankName)),
    { timeout: 30_000 },
  ).toBe(saldo(saldoAntes + 1616));
});

test("Master recebe parcialmente e o título fica como Pago Parcial", async ({ page }) => {
  await openReceivables(page);
  const { bankName } = await createReceivable(page, { amountDigits: "171700" });

  const row = rowWithAmount(page, "1.717,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const saldoAntes = await readOperationalBalance(page, bankName);

  await payPartially(page, row, "70000", "Recebimento parcial acertado com o cliente.");

  // O título continua na lista, com o valor recebido e o status de baixa parcial.
  await expect(row.getByText("Pago Parcial").first()).toBeVisible({ timeout: 30_000 });
  await expect(row.getByText("R$ 700,00").first()).toBeVisible();
  await expect.poll(
    async () => saldo(await readOperationalBalance(page, bankName)),
    { timeout: 30_000 },
  ).toBe(saldo(saldoAntes + 700));
});

test("Título a receber não é bloqueado pelo saldo da conta", async ({ page }) => {
  await openReceivables(page);
  await createReceivable(page, { amountDigits: "8888800" });

  const row = rowWithAmount(page, "88.888,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  await openBaixa(page, row);
  await page.locator("#baixa-valor-pago").fill("8888800");
  await allowBaixaWithoutReceipt(page);

  // Em Contas a Receber não existe trava de saldo: o valor entra na conta.
  await expect(page.getByText("Saldo Insuficiente", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Quitação Integral", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Baixar Título" })).toBeEnabled();
});

test("Recebimento acima do valor do título fica bloqueado", async ({ page }) => {
  await openReceivables(page);
  await createReceivable(page, { amountDigits: "181800" });

  const row = rowWithAmount(page, "1.818,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  await openBaixa(page, row);
  await page.locator("#baixa-valor-pago").fill("200000");
  await allowBaixaWithoutReceipt(page);

  await expect(page.getByText("Excede o Subtotal!", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Baixar Título" })).toBeDisabled();
});

test("Master estorna um recebimento parcial e o saldo da conta volta", async ({ page }) => {
  await openReceivables(page);
  const { bankName } = await createReceivable(page, { amountDigits: "191900" });

  const row = rowWithAmount(page, "1.919,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const saldoAntes = await readOperationalBalance(page, bankName);

  await payPartially(page, row, "60000", "Recebimento parcial acertado com o cliente.");
  await expect(row.getByText("Pago Parcial").first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(
    async () => saldo(await readOperationalBalance(page, bankName)),
    { timeout: 30_000 },
  ).toBe(saldo(saldoAntes + 600));

  page.on("dialog", dialog => dialog.accept());
  await row.getByTestId("lancamento-action-menu").click();
  await page.getByTestId("action-estornar").click();

  // O título volta aberto, com o valor inteiro e o saldo da conta restaurado.
  await expect(row.getByText("Pago Parcial")).toHaveCount(0, { timeout: 30_000 });
  await expect(row.getByRole("button", { name: /dar baixa/i })).toBeVisible();
  await expect.poll(
    async () => saldo(await readOperationalBalance(page, bankName)),
    { timeout: 30_000 },
  ).toBe(saldo(saldoAntes));
});

test("Master dá baixa por inatividade em um título a receber", async ({ page }) => {
  await openReceivables(page);
  const { bankName } = await createReceivable(page, { amountDigits: "212100" });

  const row = rowWithAmount(page, "2.121,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const saldoAntes = await readOperationalBalance(page, bankName);

  await openBaixa(page, row);
  await page.getByRole("button", { name: /^BPI/ }).click();
  await page.getByPlaceholder(/Explique o motivo/).fill("Título cancelado por inatividade, sem entrada de caixa.");
  await allowBaixaWithoutReceipt(page);

  await page.getByRole("button", { name: "Baixar Título" }).click();
  await expect(page.getByRole("heading", { name: "Confirmar Baixa por Inatividade?" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Confirmar e Baixar" }).click();
  await expect(page.getByRole("heading", { name: "Operações de Baixa de Título" })).toBeHidden({ timeout: 30_000 });

  // A baixa por inatividade tira o título da lista sem mexer no saldo da conta.
  await expect(row).toHaveCount(0, { timeout: 30_000 });
  expect(await readOperationalBalance(page, bankName)).toBe(saldoAntes);
});
