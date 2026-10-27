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
  docCodeField,
  emptyListMessage,
  openPayables,
  readDocumentCode,
  rowWithAmount,
  rowWithParcela,
  searchField,
  shownCounter,
  uniqueMarker,
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

const NO_RESULT_TERM = "zzzz busca sem resultado";

test("Master encontra o título pelo nome da entidade", async ({ page }) => {
  await openPayables(page);
  const { entityName } = await createPayable(page, { amountDigits: "71101" });

  const row = rowWithAmount(page, "711,01").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  // Uma busca sem resultado tira o título da lista...
  await searchField(page).fill(NO_RESULT_TERM);
  await expect(row).toHaveCount(0, { timeout: 30_000 });

  // ...e a busca pelo nome da entidade traz o título de volta.
  await searchField(page).fill(entityName);
  await expect(row).toBeVisible({ timeout: 30_000 });
});

test("Master encontra o título pelo texto das observações", async ({ page }) => {
  await openPayables(page);
  const marker = uniqueMarker("obs");
  await createPayable(page, { amountDigits: "71212", observacoes: marker });

  await searchField(page).fill(marker);
  await expect(shownCounter(page)).toHaveText("Exibindo 1 de 1 registros", { timeout: 30_000 });
  await expect(rowWithAmount(page, "712,12").first()).toBeVisible({ timeout: 30_000 });
});

test("Busca ignora termos com menos de 3 caracteres", async ({ page }) => {
  await openPayables(page);
  const marker = uniqueMarker("curto");
  await createPayable(page, { amountDigits: "71313", observacoes: marker });
  await createPayable(page, { amountDigits: "72323", observacoes: uniqueMarker("outro") });

  const row = rowWithAmount(page, "713,13").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  // Com 3 ou mais caracteres a busca filtra: só o título marcado aparece.
  await searchField(page).fill(marker);
  await expect(shownCounter(page)).toHaveText("Exibindo 1 de 1 registros", { timeout: 30_000 });

  // Com 2 caracteres a tela deixa de filtrar e volta a listar os títulos criados.
  await searchField(page).fill("zz");
  await expect(shownCounter(page)).not.toHaveText("Exibindo 1 de 1 registros", { timeout: 30_000 });
  await expect(row).toBeVisible({ timeout: 30_000 });
});

test("Busca sem resultado mostra a lista vazia", async ({ page }) => {
  await openPayables(page);
  await createPayable(page, { amountDigits: "71414" });

  const row = rowWithAmount(page, "714,14").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  await searchField(page).fill(NO_RESULT_TERM);
  await expect(emptyListMessage(page)).toBeVisible({ timeout: 30_000 });
  await expect(shownCounter(page)).toHaveText("Exibindo 0 de 0 registros", { timeout: 30_000 });
  await expect(row).toHaveCount(0, { timeout: 30_000 });
});

test("Master encontra o título pelo Cód. Doc", async ({ page }) => {
  await openPayables(page);
  await createPayable(page, { amountDigits: "71515" });

  const row = rowWithAmount(page, "715,15").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const codigo = await readDocumentCode(row);

  // Um documento inexistente esvazia a lista...
  await docCodeField(page).fill("999999999");
  await expect(row).toHaveCount(0, { timeout: 30_000 });

  // ...e o código do título criado traz ele de volta, sozinho.
  await docCodeField(page).fill(codigo);
  await expect(shownCounter(page)).toHaveText("Exibindo 1 de 1 registros", { timeout: 30_000 });
  await expect(row).toBeVisible({ timeout: 30_000 });
});

test("Busca pelo Cód. Doc com a parcela mostra só a parcela pesquisada", async ({ page }) => {
  await openPayables(page);
  // R$ 716,16 em 2 parcelas: R$ 358,08 cada.
  await createPayable(page, { amountDigits: "71616", condicao: "A Prazo", installments: 2 });

  const primeira = rowWithParcela(page, "1/2").filter({ hasText: "358,08" }).first();
  await expect(primeira).toBeVisible({ timeout: 30_000 });
  const codigo = await readDocumentCode(primeira);

  await docCodeField(page).fill(`${codigo}-1`);
  await expect(shownCounter(page)).toHaveText("Exibindo 1 de 1 registros", { timeout: 30_000 });
  await expect(primeira).toBeVisible({ timeout: 30_000 });
  await expect(rowWithParcela(page, "2/2")).toHaveCount(0, { timeout: 30_000 });
});
