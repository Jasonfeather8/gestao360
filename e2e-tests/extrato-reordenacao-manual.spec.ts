import { test, expect, type Page } from "@playwright/test";
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

/** Posição da linha do valor na ordem exibida pelo Extrato (-1 quando a linha não está na tela). */
async function posicaoDaLinha(page: Page, valor: string): Promise<number> {
  const textos = await page.getByRole("row").allInnerTexts();
  return textos.findIndex(texto => texto.includes(valor));
}

/** Célula "Total dia" (saldo do ERP depois da movimentação) da linha do valor informado. */
async function totalDiaDaLinha(page: Page, valor: string): Promise<string> {
  return (await rowWithAmount(page, valor).first().locator("td").nth(6).innerText()).trim();
}

test("Master reordena manualmente dois títulos do mesmo dia no Extrato", async ({ page }) => {
  await openPayables(page);
  const base = uniqueMarker("REORDENAR EXTRATO");
  const marcadorA = `${base} ALFA`;
  const marcadorB = `${base} BRAVO`;
  const valorA = "4.411,00";
  const valorB = "5.522,00";

  const { bankName } = await createPayable(page, { amountDigits: "441100", observacoes: marcadorA });
  await createPayable(page, { amountDigits: "552200", observacoes: marcadorB });

  const linhaA = rowWithAmount(page, valorA).first();
  const linhaB = rowWithAmount(page, valorB).first();
  await expect(linhaA).toBeVisible({ timeout: 30_000 });
  await expect(linhaB).toBeVisible({ timeout: 30_000 });

  // As duas baixas ficam no mesmo dia e em sequência: é o bloco que a reordenação move.
  await payInFull(page, linhaA);
  await payInFull(page, linhaB);

  // O Master confirma os dois títulos e a conciliação bancária os traz para o Extrato.
  for (const [marcador, valor] of [[marcadorA, valorA], [marcadorB, valorB]] as const) {
    await openFinanceiro(page);
    await searchField(page).fill(marcador);
    const linha = rowWithAmount(page, valor).first();
    const selo = linha.getByText("Pend. Gestor", { exact: true });
    await expect(selo).toBeVisible({ timeout: 30_000 });
    await selo.click();
    await expect(page.getByRole("heading", { name: "Aprovar Título" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Confirmar Aprovação" }).click();
    await expect(page.getByRole("heading", { name: "Aprovar Título" })).toBeHidden({ timeout: 30_000 });
  }

  await conciliarTitulo(page, admin!, await buscarTitulo(admin!, { userId: master!.id, marcador: marcadorA }));
  await conciliarTitulo(page, admin!, await buscarTitulo(admin!, { userId: master!.id, marcador: marcadorB }));

  await openExtrato(page);
  await selecionarContaDoExtrato(page, bankName);
  // A busca isola os dois títulos do teste: o bloco do dia que se move é só o deles.
  await searchField(page).fill(base);

  await expect(rowWithAmount(page, valorA).first()).toBeVisible({ timeout: 30_000 });
  await expect(rowWithAmount(page, valorB).first()).toBeVisible({ timeout: 30_000 });

  // A coluna Ordem é do Extrato e aparece para o Master.
  await expect(page.getByRole("columnheader", { name: "Ordem" })).toBeVisible();
  // A Conciliação é coluna só do Extrato: o Financeiro não a exibe.
  await expect(page.getByRole("columnheader", { name: "Conciliação" })).toBeVisible();

  const saldoA = await totalDiaDaLinha(page, valorA);
  const saldoB = await totalDiaDaLinha(page, valorB);

  const posicaoInicialA = await posicaoDaLinha(page, valorA);
  const posicaoInicialB = await posicaoDaLinha(page, valorB);
  expect(posicaoInicialA).toBeGreaterThanOrEqual(0);
  expect(posicaoInicialB).toBeGreaterThanOrEqual(0);
  expect(posicaoInicialA).not.toBe(posicaoInicialB);

  // Move para baixo o título que está por cima: os dois trocam de lugar dentro do mesmo dia.
  const valorDeCima = posicaoInicialA < posicaoInicialB ? valorA : valorB;
  const valorDeBaixo = valorDeCima === valorA ? valorB : valorA;
  await rowWithAmount(page, valorDeCima).first().getByRole("button", { name: "Mover para baixo dentro do dia" }).click();

  await expect
    .poll(async () => (await posicaoDaLinha(page, valorDeCima)) > (await posicaoDaLinha(page, valorDeBaixo)), { timeout: 30_000 })
    .toBe(true);

  // A ordem manual é só de exibição: o saldo de cada título continua o mesmo.
  expect(await totalDiaDaLinha(page, valorA)).toBe(saldoA);
  expect(await totalDiaDaLinha(page, valorB)).toBe(saldoB);

  // A nova ordem está gravada: sobrevive ao recarregamento da tela.
  await openExtrato(page);
  await selecionarContaDoExtrato(page, bankName);
  await searchField(page).fill(base);
  await expect(rowWithAmount(page, valorDeCima).first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await posicaoDaLinha(page, valorDeCima)) > (await posicaoDaLinha(page, valorDeBaixo)), { timeout: 30_000 })
    .toBe(true);

  // A reordenação existe só no Extrato: a listagem do Financeiro não tem a coluna Ordem,
  // nem a coluna de Conciliação, que ficou restrita ao Extrato.
  await openFinanceiro(page);
  await expect(page.getByRole("columnheader", { name: "Ordem" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Conciliação" })).toHaveCount(0);
});
