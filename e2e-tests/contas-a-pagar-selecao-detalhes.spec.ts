import { test, expect, type Locator, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupMasterTestUser,
  createMasterAdminClient,
  createMasterTestUser,
  signInAsMaster,
  type MasterTestUser,
} from "./fixtures/master-user";
import { createPayable, openPayables, rowWithAmount } from "./fixtures/contas-a-pagar";

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

/** Contador "N selecionado(s)" do cabeçalho da lista. */
function selectionCounter(page: Page): Locator {
  return page.getByText(/^\d+ selecionado/);
}

/** Linha TOTAL que aparece no rodapé da tabela quando há títulos selecionados. */
function totalRow(page: Page): Locator {
  return page.getByText("TOTAL", { exact: true }).locator("xpath=..");
}

function pdfButton(page: Page): Locator {
  return page.getByRole("button", { name: "Gerar PDF do Filtro" });
}

test("Selecionar um título mostra o contador, o total e libera o PDF", async ({ page }) => {
  await openPayables(page);
  await createPayable(page, { amountDigits: "111100" });

  const row = rowWithAmount(page, "1.111,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(pdfButton(page)).toBeDisabled();

  await row.getByRole("checkbox").check();

  await expect(selectionCounter(page)).toHaveText("1 selecionado", { timeout: 30_000 });
  await expect(totalRow(page)).toBeVisible({ timeout: 30_000 });
  await expect(totalRow(page)).toContainText("R$ 1.111,00");
  await expect(pdfButton(page)).toBeEnabled();
});

test("Selecionar dois títulos soma os valores no total", async ({ page }) => {
  await openPayables(page);
  await createPayable(page, { amountDigits: "222200" });
  await createPayable(page, { amountDigits: "333300" });

  const primeira = rowWithAmount(page, "2.222,00").first();
  const segunda = rowWithAmount(page, "3.333,00").first();
  await expect(primeira).toBeVisible({ timeout: 30_000 });
  await expect(segunda).toBeVisible({ timeout: 30_000 });

  await primeira.getByRole("checkbox").check();
  await segunda.getByRole("checkbox").check();

  await expect(selectionCounter(page)).toHaveText("2 selecionados", { timeout: 30_000 });
  await expect(totalRow(page)).toContainText("R$ 5.555,00");
});

test("Selecionar todos pelo cabeçalho e limpar a seleção", async ({ page }) => {
  await openPayables(page);
  await createPayable(page, { amountDigits: "444400" });
  await createPayable(page, { amountDigits: "555500" });

  const primeira = rowWithAmount(page, "4.444,00").first();
  const segunda = rowWithAmount(page, "5.555,00").first();
  await expect(primeira).toBeVisible({ timeout: 30_000 });
  await expect(segunda).toBeVisible({ timeout: 30_000 });

  const cabecalho = page.locator("thead").getByRole("checkbox");
  await cabecalho.check();
  await expect(primeira.getByRole("checkbox")).toBeChecked();
  await expect(segunda.getByRole("checkbox")).toBeChecked();
  await expect(selectionCounter(page)).toBeVisible({ timeout: 30_000 });
  await expect(pdfButton(page)).toBeEnabled();

  await cabecalho.uncheck();
  await expect(primeira.getByRole("checkbox")).not.toBeChecked();
  await expect(segunda.getByRole("checkbox")).not.toBeChecked();
  await expect(selectionCounter(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(totalRow(page)).toHaveCount(0);
  await expect(pdfButton(page)).toBeDisabled();
});

test("Abrir os detalhes de um título pela linha", async ({ page }) => {
  await openPayables(page);
  const { entityName } = await createPayable(page, { amountDigits: "666600" });

  const row = rowWithAmount(page, "6.666,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  await row.getByText(entityName).first().click();

  await expect(page.getByRole("heading", { name: "Detalhes da operação" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Resumo financeiro", { exact: true })).toBeVisible();
  await expect(page.getByText("Informações do lançamento", { exact: true })).toBeVisible();
  await expect(page.getByText("Anexos e comprovantes", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Fechar detalhes" }).click();
  await expect(page.getByRole("heading", { name: "Detalhes da operação" })).toBeHidden({ timeout: 15_000 });
  await expect(row).toBeVisible();
});
