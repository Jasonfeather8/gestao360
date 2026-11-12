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
  createReceivable,
  futureDate,
  openReceivables,
  readFilterOptions,
  rowWithAmount,
  searchField,
  shownCounter,
  toggleFilterOption,
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

test("Filtro pelos cards de conta mostra só os títulos a receber daquela conta", async ({ page }) => {
  await openReceivables(page);
  const primeiraConta = await createReceivable(page, { amountDigits: "61101", bankAccountIndex: 0 });
  await createReceivable(page, { amountDigits: "62202", bankAccountIndex: 1 });

  const daPrimeira = rowWithAmount(page, "611,01").first();
  const daSegunda = rowWithAmount(page, "622,02").first();
  await expect(daPrimeira).toBeVisible({ timeout: 30_000 });
  await expect(daSegunda).toBeVisible({ timeout: 30_000 });

  await page.getByText(primeiraConta.bankName, { exact: true }).click();
  await expect(daPrimeira).toBeVisible({ timeout: 30_000 });
  await expect(daSegunda).toHaveCount(0, { timeout: 30_000 });

  await page.getByRole("button", { name: "Limpar Filtro", exact: true }).click();
  await expect(daSegunda).toBeVisible({ timeout: 30_000 });
});

test("Filtro de conta bancária mostra só os títulos a receber da conta escolhida", async ({ page }) => {
  await openReceivables(page);
  const primeiraConta = await createReceivable(page, { amountDigits: "63303", bankAccountIndex: 0 });
  await createReceivable(page, { amountDigits: "64404", bankAccountIndex: 1 });

  const daPrimeira = rowWithAmount(page, "633,03").first();
  const daSegunda = rowWithAmount(page, "644,04").first();
  await expect(daPrimeira).toBeVisible({ timeout: 30_000 });
  await expect(daSegunda).toBeVisible({ timeout: 30_000 });

  await toggleFilterOption(page, "filter-conta", primeiraConta.bankName);
  await expect(daPrimeira).toBeVisible({ timeout: 30_000 });
  await expect(daSegunda).toHaveCount(0, { timeout: 30_000 });

  await toggleFilterOption(page, "filter-conta", "Todas as Contas");
  await expect(daSegunda).toBeVisible({ timeout: 30_000 });
});

test("Filtro Atrasadas mostra só os títulos a receber vencidos", async ({ page }) => {
  await openReceivables(page);
  await createReceivable(page, { amountDigits: "65505", dueDate: futureDate(-5) });
  await createReceivable(page, { amountDigits: "66606", dueDate: futureDate(3) });

  const vencido = rowWithAmount(page, "655,05").first();
  const aVencer = rowWithAmount(page, "666,06").first();
  await expect(vencido).toBeVisible({ timeout: 30_000 });
  await expect(aVencer).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("status-filter-atrasadas").click();
  await expect(vencido).toBeVisible({ timeout: 30_000 });
  await expect(aVencer).toHaveCount(0, { timeout: 30_000 });
});

test("Filtro À Vencer mostra só os títulos a receber que ainda não venceram", async ({ page }) => {
  await openReceivables(page);
  await createReceivable(page, { amountDigits: "67707", dueDate: futureDate(-5) });
  await createReceivable(page, { amountDigits: "68808", dueDate: futureDate(3) });

  const vencido = rowWithAmount(page, "677,07").first();
  const aVencer = rowWithAmount(page, "688,08").first();
  await expect(vencido).toBeVisible({ timeout: 30_000 });
  await expect(aVencer).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("status-filter-aberto").click();
  await expect(aVencer).toBeVisible({ timeout: 30_000 });
  await expect(vencido).toHaveCount(0, { timeout: 30_000 });
});

test("Filtro de categoria mostra só os títulos a receber da categoria escolhida", async ({ page }) => {
  await openReceivables(page);
  const primeiraCategoria = await createReceivable(page, { amountDigits: "69909", categoryIndex: 0 });
  await createReceivable(page, { amountDigits: "71111", categoryIndex: 1 });

  const daPrimeira = rowWithAmount(page, "699,09").first();
  const daSegunda = rowWithAmount(page, "711,11").first();
  await expect(daPrimeira).toBeVisible({ timeout: 30_000 });
  await expect(daSegunda).toBeVisible({ timeout: 30_000 });

  await toggleFilterOption(page, "filter-categoria", primeiraCategoria.categoryName);
  await expect(daPrimeira).toBeVisible({ timeout: 30_000 });
  await expect(daSegunda).toHaveCount(0, { timeout: 30_000 });
});

test("Filtro de centro de custo mostra só os títulos a receber do centro escolhido", async ({ page }) => {
  await openReceivables(page);
  const primeiroCentro = await createReceivable(page, { amountDigits: "72222", costCenterIndex: 0 });
  await createReceivable(page, { amountDigits: "73333", costCenterIndex: 1 });

  const doPrimeiro = rowWithAmount(page, "722,22").first();
  const doSegundo = rowWithAmount(page, "733,33").first();
  await expect(doPrimeiro).toBeVisible({ timeout: 30_000 });
  await expect(doSegundo).toBeVisible({ timeout: 30_000 });

  await toggleFilterOption(page, "filter-centro-custo", primeiroCentro.costCenterName);
  await expect(doPrimeiro).toBeVisible({ timeout: 30_000 });
  await expect(doSegundo).toHaveCount(0, { timeout: 30_000 });
});

test("Filtro de responsável mostra só os títulos a receber do usuário escolhido", async ({ page }) => {
  await openReceivables(page);
  await createReceivable(page, { amountDigits: "74444" });

  const row = rowWithAmount(page, "744,44").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  // O nome do Master de teste pode se repetir em outros cadastros; usa um usuário com nome único.
  const rotulos = await readFilterOptions(page, "filter-responsavel");
  const outroUsuario = rotulos
    .filter(label => label !== "Todos os Usuários" && label !== "Teste Master")
    .find(label => rotulos.filter(item => item === label).length === 1);
  if (!outroUsuario) throw new Error("É preciso um usuário com nome único para testar o filtro de responsável.");

  // Filtrando por outro usuário o título do Master sai da lista...
  await toggleFilterOption(page, "filter-responsavel", outroUsuario);
  await expect(row).toHaveCount(0, { timeout: 30_000 });

  // ...e volta quando o filtro de responsável é desmarcado.
  await toggleFilterOption(page, "filter-responsavel", outroUsuario);
  await expect(row).toBeVisible({ timeout: 30_000 });
});

test("Aviso de filtros ativos some ao limpar os filtros em Contas a Receber", async ({ page }) => {
  await openReceivables(page);
  await createReceivable(page, { amountDigits: "75555" });

  const row = rowWithAmount(page, "755,55").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("status-filter-atrasadas").click();
  await expect(page.getByText("Filtros ativos")).toBeVisible({ timeout: 30_000 });
  await expect(row).toHaveCount(0, { timeout: 30_000 });

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.getByText("Filtros ativos")).toBeHidden({ timeout: 30_000 });
  await expect(row).toBeVisible({ timeout: 30_000 });
});

test("O botão de filtros oculta e mostra o painel de filtros em Contas a Receber", async ({ page }) => {
  await openReceivables(page);
  const painel = page.getByRole("heading", { name: "Filtros adicionais" });
  await expect(painel).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("toggle-filters").click();
  await expect(painel).toBeHidden({ timeout: 15_000 });

  await page.getByTestId("toggle-filters").click();
  await expect(painel).toBeVisible({ timeout: 15_000 });
});

test("Período personalizado limita a lista de recebimentos pelo vencimento", async ({ page }) => {
  await openReceivables(page);
  await createReceivable(page, { amountDigits: "76666", dueDate: futureDate(5) });

  const row = rowWithAmount(page, "766,66").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  // A janela padrão do período personalizado termina hoje.
  await page.getByTestId("date-preset").selectOption("custom");
  await expect(row).toHaveCount(0, { timeout: 30_000 });

  // Estendendo a data final, o título volta para a lista.
  await page.getByTestId("date-end").fill(futureDate(10));
  await expect(row).toBeVisible({ timeout: 30_000 });
});

test("Page size e paginação acompanham a lista filtrada de recebimentos", async ({ page }) => {
  await openReceivables(page);
  const marker = uniqueMarker("pagina");
  await createReceivable(page, { amountDigits: "77777", observacoes: marker });
  await createReceivable(page, { amountDigits: "78888", observacoes: marker });
  await createReceivable(page, { amountDigits: "79999", observacoes: marker });

  await searchField(page).fill(marker);
  await expect(shownCounter(page)).toHaveText("Exibindo 3 de 3 registros", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Anterior" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Próximo" })).toBeDisabled();

  // Com "Todos" os controles de página saem de cena e a lista continua igual.
  await page.getByTestId("page-size").selectOption("all");
  await expect(shownCounter(page)).toHaveText("Exibindo 3 de 3 registros", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Anterior" })).toHaveCount(0);
});
