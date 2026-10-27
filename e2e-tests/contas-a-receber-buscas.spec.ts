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
  docCodeField,
  emptyListMessage,
  openReceivables,
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

test("Master encontra o título a receber pelo nome da entidade", async ({ page }) => {
  await openReceivables(page);
  const { entityName } = await createReceivable(page, { amountDigits: "41101" });

  const row = rowWithAmount(page, "411,01").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  // Uma busca sem resultado tira o título da lista...
  await searchField(page).fill(NO_RESULT_TERM);
  await expect(row).toHaveCount(0, { timeout: 30_000 });

  // ...e a busca pelo nome da entidade traz o título de volta.
  await searchField(page).fill(entityName);
  await expect(row).toBeVisible({ timeout: 30_000 });
});

test("Master encontra o título a receber pelo texto das observações", async ({ page }) => {
  await openReceivables(page);
  const marker = uniqueMarker("obs");
  await createReceivable(page, { amountDigits: "41212", observacoes: marker });

  await searchField(page).fill(marker);
  await expect(shownCounter(page)).toHaveText("Exibindo 1 de 1 registros", { timeout: 30_000 });
  await expect(rowWithAmount(page, "412,12").first()).toBeVisible({ timeout: 30_000 });
});

test("Busca em Contas a Receber ignora termos com menos de 3 caracteres", async ({ page }) => {
  await openReceivables(page);
  const marker = uniqueMarker("curto");
  await createReceivable(page, { amountDigits: "41313", observacoes: marker });
  await createReceivable(page, { amountDigits: "42323", observacoes: uniqueMarker("outro") });

  const row = rowWithAmount(page, "413,13").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  // Com 3 ou mais caracteres a busca filtra: só o título marcado aparece.
  await searchField(page).fill(marker);
  await expect(shownCounter(page)).toHaveText("Exibindo 1 de 1 registros", { timeout: 30_000 });

  // Com 2 caracteres a tela deixa de filtrar e volta a listar os títulos criados.
  await searchField(page).fill("zz");
  await expect(shownCounter(page)).not.toHaveText("Exibindo 1 de 1 registros", { timeout: 30_000 });
  await expect(row).toBeVisible({ timeout: 30_000 });
});

test("Busca sem resultado em Contas a Receber mostra a lista vazia", async ({ page }) => {
  await openReceivables(page);
  await createReceivable(page, { amountDigits: "41414" });

  const row = rowWithAmount(page, "414,14").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  await searchField(page).fill(NO_RESULT_TERM);
  await expect(emptyListMessage(page)).toBeVisible({ timeout: 30_000 });
  await expect(shownCounter(page)).toHaveText("Exibindo 0 de 0 registros", { timeout: 30_000 });
  await expect(row).toHaveCount(0, { timeout: 30_000 });
});

test("Master encontra o título a receber pelo Cód. Doc", async ({ page }) => {
  await openReceivables(page);
  await createReceivable(page, { amountDigits: "41515" });

  const row = rowWithAmount(page, "415,15").first();
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
  await openReceivables(page);
  // R$ 416,16 em 2 parcelas: R$ 208,08 cada.
  await createReceivable(page, { amountDigits: "41616", condicao: "A Prazo", installments: 2 });

  const primeira = rowWithParcela(page, "1/2").filter({ hasText: "208,08" }).first();
  await expect(primeira).toBeVisible({ timeout: 30_000 });
  const codigo = await readDocumentCode(primeira);

  await docCodeField(page).fill(`${codigo}-1`);
  await expect(shownCounter(page)).toHaveText("Exibindo 1 de 1 registros", { timeout: 30_000 });
  await expect(primeira).toBeVisible({ timeout: 30_000 });
  await expect(rowWithParcela(page, "2/2")).toHaveCount(0, { timeout: 30_000 });
});
