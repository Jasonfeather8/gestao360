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
  aprovarPeloFinanceiro,
  baixarPorInatividade,
  createPayable,
  estornarPelaLinha,
  openExtratoBpi,
  openFinanceiro,
  openPayables,
  payInFull,
  rowWithAmount,
  searchField,
  selecionarContaDoExtrato,
  uniqueMarker,
} from "./fixtures/contas-a-pagar";

test.setTimeout(240_000);

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

test("Estorno no Financeiro devolve o título aberto para Contas a Pagar", async ({ page }) => {
  await openPayables(page);
  const marcador = uniqueMarker("ESTORNO FINANCEIRO");
  await createPayable(page, { amountDigits: "331100", observacoes: marcador });

  const linhaPagar = rowWithAmount(page, "3.311,00").first();
  await expect(linhaPagar).toBeVisible({ timeout: 30_000 });

  await payInFull(page, linhaPagar);
  await expect(linhaPagar).toHaveCount(0, { timeout: 30_000 });

  await openFinanceiro(page);
  await searchField(page).fill(marcador);
  const linha = rowWithAmount(page, "3.311,00").first();
  await expect(linha.getByText("Pend. Gestor", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Estorno na fila do Financeiro: desfaz a baixa e devolve o título à tela de origem.
  await estornarPelaLinha(page, linha);
  await expect(linha).toHaveCount(0, { timeout: 30_000 });

  await openPayables(page);
  await searchField(page).fill(marcador);
  const linhaVolta = rowWithAmount(page, "3.311,00").first();
  await expect(linhaVolta).toBeVisible({ timeout: 30_000 });
  await expect(linhaVolta.getByRole("button", { name: /dar baixa/i })).toBeVisible();
});

test("Estorno no Extrato mantém a baixa e devolve o título para a fila do Financeiro", async ({ page }) => {
  await openPayables(page);
  const marcador = uniqueMarker("ESTORNO EXTRATO");
  const { bankName } = await createPayable(page, { amountDigits: "442200", observacoes: marcador });

  const linhaPagar = rowWithAmount(page, "4.422,00").first();
  await expect(linhaPagar).toBeVisible({ timeout: 30_000 });

  await baixarPorInatividade(page, linhaPagar);
  await expect(linhaPagar).toHaveCount(0, { timeout: 30_000 });

  // Confirmado pelo Master, o BPI passa para o Extrato sem precisar de conciliação.
  await openFinanceiro(page);
  await searchField(page).fill(marcador);
  const linha = rowWithAmount(page, "4.422,00").first();
  await expect(linha.getByText("BPI", { exact: true })).toBeVisible({ timeout: 30_000 });
  await aprovarPeloFinanceiro(page, linha);
  await expect(linha).toHaveCount(0, { timeout: 30_000 });

  await openExtratoBpi(page);
  await selecionarContaDoExtrato(page, bankName);
  const linhaExtrato = rowWithAmount(page, "4.422,00").first();
  await expect(linhaExtrato).toBeVisible({ timeout: 30_000 });

  // Estorno na aba Extrato: preserva a baixa e remove a confirmação do Master.
  await estornarPelaLinha(page, linhaExtrato);
  await expect(linhaExtrato).toHaveCount(0, { timeout: 30_000 });

  await openFinanceiro(page);
  await searchField(page).fill(marcador);
  await page.getByTestId("financeiro-status-bpi").click();
  const linhaFila = rowWithAmount(page, "4.422,00").first();
  await expect(linhaFila).toBeVisible({ timeout: 30_000 });
  await expect(linhaFila.getByText("BPI", { exact: true })).toBeVisible();
});
