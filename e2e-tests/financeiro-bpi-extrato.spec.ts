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
  openExtratoBpi,
  openFinanceiro,
  openPayables,
  rowWithAmount,
  searchField,
  selecionarContaDoExtrato,
  uniqueMarker,
} from "./fixtures/contas-a-pagar";

test.setTimeout(180_000);

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

test("BPI tem selo próprio no Financeiro e, confirmado, entra no Extrato sem conciliação", async ({ page }) => {
  await openPayables(page);
  const marcador = uniqueMarker("BPI EXTRATO");
  const { bankName } = await createPayable(page, { amountDigits: "979700", observacoes: marcador });

  const linhaPagar = rowWithAmount(page, "9.797,00").first();
  await expect(linhaPagar).toBeVisible({ timeout: 30_000 });

  // A baixa por inatividade tira o título de Contas a Pagar sem mexer no saldo da conta.
  await baixarPorInatividade(page, linhaPagar);
  await expect(linhaPagar).toHaveCount(0, { timeout: 30_000 });

  await openFinanceiro(page);
  await searchField(page).fill(marcador);
  const linha = rowWithAmount(page, "9.797,00").first();
  await expect(linha).toBeVisible({ timeout: 30_000 });
  await expect(linha.getByText("BPI", { exact: true })).toBeVisible();

  // O BPI não entra em "Confirmado" nem em "Pend. Gestor": só no filtro próprio.
  const chipPendGestor = page.getByTestId("financeiro-status-pendente");
  const chipConfirmado = page.getByTestId("financeiro-status-confirmado");
  const chipBpi = page.getByTestId("financeiro-status-bpi");

  await chipPendGestor.click();
  await expect(linha).toHaveCount(0, { timeout: 30_000 });
  await chipPendGestor.click();

  await chipConfirmado.click();
  await expect(linha).toHaveCount(0, { timeout: 30_000 });
  await chipConfirmado.click();

  await chipBpi.click();
  await expect(linha).toBeVisible({ timeout: 30_000 });

  // Confirmado pelo Master, o BPI sai da fila do Financeiro e passa a compor o Extrato.
  await aprovarPeloFinanceiro(page, linha);
  await expect(linha).toHaveCount(0, { timeout: 30_000 });

  await openExtratoBpi(page);
  await selecionarContaDoExtrato(page, bankName);
  const linhaExtrato = rowWithAmount(page, "9.797,00").first();
  await expect(linhaExtrato).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("A baixa por inatividade (BPI) não entra no saldo do banco.")).toBeVisible();

  // Sem o filtro de BPI o título não aparece: a visão padrão do Extrato exige conciliação.
  await page.getByTestId("extrato-filtro-bpi").click();
  await expect(linhaExtrato).toHaveCount(0, { timeout: 30_000 });
});
