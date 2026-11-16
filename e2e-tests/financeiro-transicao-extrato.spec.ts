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
  createPayable,
  openExtrato,
  openFinanceiro,
  openPayables,
  payInFull,
  rowWithAmount,
  searchField,
  selecionarContaDoExtrato,
  uniqueMarker,
} from "./fixtures/contas-a-pagar";
import { buscarTitulo, conciliarTitulo, estornarTitulosConciliados, prepararConciliacao } from "./fixtures/conciliacao";

test.setTimeout(240_000);

let admin: SupabaseClient | undefined;
let master: MasterTestUser | undefined;

test.beforeEach(async ({ page }) => {
  prepararConciliacao(page);
  admin = createMasterAdminClient();
  master = await createMasterTestUser(admin);
  await signInAsMaster(page, master);
});

test.afterEach(async ({ page }) => {
  if (admin && master) {
    await estornarTitulosConciliados(page, admin, master.id);
    await cleanupMasterTestUser(admin, master.id);
  }
  admin = undefined;
  master = undefined;
});

test("Título confirmado e conciliado sai do Financeiro e passa a compor o Extrato", async ({ page }) => {
  await openPayables(page);
  const marcador = uniqueMarker("TRANSICAO EXTRATO");
  const { bankName } = await createPayable(page, { amountDigits: "777700", observacoes: marcador });

  const linhaPagar = rowWithAmount(page, "7.777,00").first();
  await expect(linhaPagar).toBeVisible({ timeout: 30_000 });

  // Com a baixa registrada o título sai de Contas a Pagar e entra na fila do Financeiro.
  await payInFull(page, linhaPagar);
  await expect(linhaPagar).toHaveCount(0, { timeout: 30_000 });

  await openFinanceiro(page);
  await searchField(page).fill(marcador);
  const linha = rowWithAmount(page, "7.777,00").first();
  await expect(linha).toBeVisible({ timeout: 30_000 });
  await expect(linha.getByText("Pend. Gestor", { exact: true })).toBeVisible();

  // Confirmado ainda não basta: sem conciliação o título continua fora do Extrato.
  await openExtrato(page);
  await selecionarContaDoExtrato(page, bankName);
  await expect(rowWithAmount(page, "7.777,00")).toHaveCount(0);

  await openFinanceiro(page);
  await searchField(page).fill(marcador);
  const linhaFila = rowWithAmount(page, "7.777,00").first();
  await linhaFila.getByText("Pend. Gestor", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aprovar Título" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Confirmar Aprovação" }).click();
  await expect(rowWithAmount(page, "7.777,00").first().getByText("Confirmado", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Confirmado, o título permanece no Financeiro aguardando a conciliação.
  await openExtrato(page);
  await selecionarContaDoExtrato(page, bankName);
  await expect(rowWithAmount(page, "7.777,00")).toHaveCount(0);

  // A conciliação bancária é o último passo: ela tira o título do Financeiro e o traz ao Extrato.
  const titulo = await buscarTitulo(admin!, { userId: master!.id, marcador });
  await conciliarTitulo(page, admin!, titulo);

  await openExtrato(page);
  await selecionarContaDoExtrato(page, bankName);
  const linhaExtrato = rowWithAmount(page, "7.777,00").first();
  await expect(linhaExtrato).toBeVisible({ timeout: 30_000 });
  await expect(linhaExtrato.getByRole("img", { name: /Conciliado com o extrato/ })).toBeVisible();

  await openFinanceiro(page);
  await searchField(page).fill(marcador);
  await expect(rowWithAmount(page, "7.777,00")).toHaveCount(0, { timeout: 30_000 });
});
