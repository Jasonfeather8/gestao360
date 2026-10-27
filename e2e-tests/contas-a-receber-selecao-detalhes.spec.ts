import { test, expect, type Locator, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupMasterTestUser,
  createMasterAdminClient,
  createMasterTestUser,
  signInAsMaster,
  type MasterTestUser,
} from "./fixtures/master-user";
import { createReceivable, openReceivables, rowWithAmount } from "./fixtures/contas-a-pagar";

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

test("Selecionar um título a receber mostra o contador, o total e libera o PDF", async ({ page }) => {
  await openReceivables(page);
  await createReceivable(page, { amountDigits: "81101" });

  const row = rowWithAmount(page, "811,01").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(pdfButton(page)).toBeDisabled();

  await row.getByRole("checkbox").check();

  await expect(selectionCounter(page)).toHaveText("1 selecionado", { timeout: 30_000 });
  await expect(totalRow(page)).toBeVisible({ timeout: 30_000 });
  await expect(totalRow(page)).toContainText("R$ 811,01");
  await expect(pdfButton(page)).toBeEnabled();
});

test("Selecionar dois títulos a receber soma os valores no total", async ({ page }) => {
  await openReceivables(page);
  await createReceivable(page, { amountDigits: "82202" });
  await createReceivable(page, { amountDigits: "83303" });

  const primeira = rowWithAmount(page, "822,02").first();
  const segunda = rowWithAmount(page, "833,03").first();
  await expect(primeira).toBeVisible({ timeout: 30_000 });
  await expect(segunda).toBeVisible({ timeout: 30_000 });

  await primeira.getByRole("checkbox").check();
  await segunda.getByRole("checkbox").check();

  await expect(selectionCounter(page)).toHaveText("2 selecionados", { timeout: 30_000 });
  await expect(totalRow(page)).toContainText("R$ 1.655,05");
});

test("Selecionar todos pelo cabeçalho e limpar a seleção em Contas a Receber", async ({ page }) => {
  await openReceivables(page);
  await createReceivable(page, { amountDigits: "84404" });
  await createReceivable(page, { amountDigits: "85505" });

  const primeira = rowWithAmount(page, "844,04").first();
  const segunda = rowWithAmount(page, "855,05").first();
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

test("Abrir os detalhes de um título a receber pela linha", async ({ page }) => {
  await openReceivables(page);
  const { entityName } = await createReceivable(page, { amountDigits: "86606" });

  const row = rowWithAmount(page, "866,06").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  await row.getByText(entityName).first().click();

  await expect(page.getByRole("heading", { name: "Detalhes da operação" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Resumo financeiro", { exact: true })).toBeVisible();
  await expect(page.getByText("Informações do lançamento", { exact: true })).toBeVisible();
  await expect(page.getByText("Anexos e comprovantes", { exact: true })).toBeVisible();

  // Textos próprios de um título a receber (escopados ao painel visível).
  const painel = page.locator(
    "xpath=//h2[normalize-space()='Detalhes da operação']/ancestor::div[contains(@class,'max-w-[1180px]')][1]",
  );
  await expect(painel).toContainText("Total previsto / recebido");
  await expect(painel).toContainText("Receita / Entrada");
  await expect(painel).toContainText("Entidade / cliente");
  await expect(painel).toContainText(entityName);

  await page.getByRole("button", { name: "Fechar detalhes" }).click();
  await expect(page.getByRole("heading", { name: "Detalhes da operação" })).toBeHidden({ timeout: 15_000 });
  await expect(row).toBeVisible();
});
