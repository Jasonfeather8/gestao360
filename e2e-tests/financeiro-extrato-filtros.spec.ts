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

/**
 * A visão padrão do Extrato exige título confirmado E conciliado. O único caminho para
 * conciliar pela interface é importar o PDF do extrato (leitura por IA), então este spec
 * cobre o que a tela oferece sem conciliação: o filtro de BPI da aba Extrato, que mostra os
 * títulos confirmados por inatividade, e a conta do extrato.
 */
test("Extrato filtra por conta e separa os títulos confirmados por inatividade (BPI)", async ({ page }) => {
  await openPayables(page);
  const marcador = uniqueMarker("extrato");
  const { bankName } = await createPayable(page, { amountDigits: "97979", observacoes: marcador });

  const linhaPagar = rowWithAmount(page, "979,79").first();
  await expect(linhaPagar).toBeVisible({ timeout: 30_000 });

  // A baixa por inatividade tira o título de Contas a Pagar.
  await baixarPorInatividade(page, linhaPagar);
  await expect(linhaPagar).toHaveCount(0, { timeout: 30_000 });

  // O Master confirma o BPI na fila do Financeiro.
  await openFinanceiro(page);
  await searchField(page).fill(marcador);
  const linhaFinanceiro = rowWithAmount(page, "979,79").first();
  await expect(linhaFinanceiro.getByText("BPI", { exact: true })).toBeVisible({ timeout: 30_000 });
  await aprovarPeloFinanceiro(page, linhaFinanceiro);
  await expect(linhaFinanceiro).toHaveCount(0, { timeout: 30_000 });

  // No Extrato o título aparece na conta dele, com o filtro de BPI ligado.
  await openExtratoBpi(page);
  await selecionarContaDoExtrato(page, bankName);
  const linha = rowWithAmount(page, "979,79").first();
  await expect(linha).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("A baixa por inatividade (BPI) não entra no saldo do banco.")).toBeVisible();

  // Sem o filtro de BPI o título não aparece: a visão padrão do Extrato exige conciliação.
  await page.getByTestId("extrato-filtro-bpi").click();
  await expect(linha).toHaveCount(0, { timeout: 30_000 });
});
