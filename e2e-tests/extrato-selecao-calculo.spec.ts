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
  createPayable,
  createReceivable,
  openExtrato,
  openFinanceiro,
  openPayables,
  openReceivables,
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

test("Extrato seleciona títulos pelas caixinhas e mostra o cálculo do fluxo", async ({ page }) => {
  const base = uniqueMarker("EXTRATO CALCULO");
  const marcadorEntrada = `${base} ENTRADA`;
  const marcadorSaida = `${base} SAIDA`;
  const valorEntrada = "1.234,00";
  const valorSaida = "2.211,00";

  // Uma entrada e uma saída na mesma conta: o cálculo precisa somar uma e subtrair a outra.
  await openReceivables(page);
  const { bankName } = await createReceivable(page, { amountDigits: "123400", observacoes: marcadorEntrada });
  await payInFull(page, rowWithAmount(page, valorEntrada).first());
  await createPayable(page, { amountDigits: "221100", observacoes: marcadorSaida });

  await openPayables(page);
  await payInFull(page, rowWithAmount(page, valorSaida).first());

  // O Master confirma os dois títulos e a conciliação bancária os traz para o Extrato.
  for (const [marcador, valor] of [[marcadorEntrada, valorEntrada], [marcadorSaida, valorSaida]] as const) {
    await openFinanceiro(page);
    await searchField(page).fill(marcador);
    const linha = rowWithAmount(page, valor).first();
    await expect(linha).toBeVisible({ timeout: 30_000 });
    await aprovarPeloFinanceiro(page, linha);
  }

  await conciliarTitulo(page, admin!, await buscarTitulo(admin!, { userId: master!.id, marcador: marcadorEntrada }));
  await conciliarTitulo(page, admin!, await buscarTitulo(admin!, { userId: master!.id, marcador: marcadorSaida }));

  await openExtrato(page);
  await selecionarContaDoExtrato(page, bankName);
  await searchField(page).fill(base);

  const linhaEntrada = rowWithAmount(page, valorEntrada).first();
  const linhaSaida = rowWithAmount(page, valorSaida).first();
  await expect(linhaEntrada).toBeVisible({ timeout: 30_000 });
  await expect(linhaSaida).toBeVisible({ timeout: 30_000 });

  // A coluna Fluxo é a mesma do Financeiro: seta verde de entrada e vermelha de saída.
  await expect(page.getByRole("columnheader", { name: "Fluxo" })).toBeVisible();
  await expect(linhaEntrada.getByRole("img", { name: "Entrada" })).toBeVisible();
  await expect(linhaSaida.getByRole("img", { name: "Saída" })).toBeVisible();

  // O valor segue a natureza do fluxo: entrada em verde e saída em vermelho.
  await expect(linhaEntrada.locator("td").nth(5)).toHaveClass(/text-bank-truth-green/);
  await expect(linhaSaida.locator("td").nth(5)).toHaveClass(/text-alert-red/);

  // Sem caixinha marcada não existe cálculo na tela.
  await expect(page.getByTestId("extrato-total-selecao")).toHaveCount(0);

  // As caixinhas alimentam o cálculo: entradas somam e saídas subtraem.
  await linhaEntrada.getByRole("checkbox").check();
  await linhaSaida.getByRole("checkbox").check();

  const barraCalculo = page.getByTestId("extrato-total-selecao");
  await expect(barraCalculo).toBeVisible();
  await expect(barraCalculo).toContainText("Total (2 selecionados)");
  await expect(barraCalculo).toContainText("977,00");

  // Desmarcar um título recalcula o total da seleção.
  await linhaSaida.getByRole("checkbox").uncheck();
  await expect(barraCalculo).toContainText("Total (1 selecionado)");
  await expect(barraCalculo).toContainText("1.234,00");

  // O link de logs da coluna Entidade, que existe no Financeiro, também abre no Extrato.
  await linhaEntrada.getByRole("button", { name: "Ver logs completo" }).click();
  await expect(page.getByRole("heading", { name: "Logs completos" })).toBeVisible();
  await expect(page.getByText(marcadorEntrada)).toBeVisible();
  await page.getByRole("button", { name: "Fechar logs" }).click();
  await expect(page.getByRole("heading", { name: "Logs completos" })).toBeHidden();
});
