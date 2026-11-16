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

/** Lê um valor em reais do texto da célula ("R$ 1.234,56" ou "-R$ 1.234,56"). */
function lerValor(texto: string): number {
  const negativo = texto.includes("-");
  const numero = Number(texto.replace(/[^\d,]/g, "").replace(/\./g, "").replace(",", "."));
  return negativo ? -numero : numero;
}

test("Saldo por linha do Extrato acumula na ordem cronológica", async ({ page }) => {
  await openPayables(page);
  const marcadorA = uniqueMarker("SALDO A");
  const marcadorB = uniqueMarker("SALDO B");
  const { bankName } = await createPayable(page, { amountDigits: "221100", observacoes: marcadorA });
  await createPayable(page, { amountDigits: "332200", observacoes: marcadorB });

  const linhaA = rowWithAmount(page, "2.211,00").first();
  const linhaB = rowWithAmount(page, "3.322,00").first();
  await expect(linhaA).toBeVisible({ timeout: 30_000 });
  await expect(linhaB).toBeVisible({ timeout: 30_000 });

  // As duas baixas ficam no mesmo dia e em sequência: A antes de B.
  await payInFull(page, linhaA);
  await payInFull(page, linhaB);

  // O Master confirma os dois títulos para que eles cheguem ao Extrato.
  for (const marcador of [marcadorA, marcadorB]) {
    await openFinanceiro(page);
    await searchField(page).fill(marcador);
    const linha = marcador === marcadorA
      ? rowWithAmount(page, "2.211,00").first()
      : rowWithAmount(page, "3.322,00").first();
    const selo = linha.getByText("Pend. Gestor", { exact: true });
    await expect(selo).toBeVisible({ timeout: 30_000 });
    await selo.click();
    await expect(page.getByRole("heading", { name: "Aprovar Título" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Confirmar Aprovação" }).click();
    await expect(page.getByRole("heading", { name: "Aprovar Título" })).toBeHidden({ timeout: 30_000 });
  }

  const tituloA = await buscarTitulo(admin!, { userId: master!.id, marcador: marcadorA });
  const tituloB = await buscarTitulo(admin!, { userId: master!.id, marcador: marcadorB });
  await conciliarTitulo(page, admin!, tituloA);
  await conciliarTitulo(page, admin!, tituloB);

  await openExtrato(page);
  await selecionarContaDoExtrato(page, bankName);

  const linhaExtratoA = rowWithAmount(page, "2.211,00").first();
  const linhaExtratoB = rowWithAmount(page, "3.322,00").first();
  await expect(linhaExtratoA).toBeVisible({ timeout: 30_000 });
  await expect(linhaExtratoB).toBeVisible({ timeout: 30_000 });

  // A coluna "Total dia" é o saldo do ERP depois de cada movimentação: a linha de B parte
  // do saldo acumulado em A e desconta a saída de B.
  const saldoA = lerValor(await linhaExtratoA.locator("td").nth(4).innerText());
  const saldoB = lerValor(await linhaExtratoB.locator("td").nth(4).innerText());

  expect(saldoB).toBeCloseTo(saldoA - 3322, 2);
});
