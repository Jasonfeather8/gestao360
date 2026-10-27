import { test, expect, type Locator, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupMasterTestUser,
  createMasterAdminClient,
  createMasterTestUser,
  signInAsMaster,
  type MasterTestUser,
} from "./fixtures/master-user";
import { createReceivable, openReceivables, rowWithAmount, uniqueMarker } from "./fixtures/contas-a-pagar";

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

/** Painel aberto pelo clipe da coluna "Recibo" (ou pelo clique na linha). */
function detailsPanel(page: Page): Locator {
  return page.locator(
    "xpath=//h2[normalize-space()='Detalhes da operação']/ancestor::div[contains(@class,'max-w-[1180px]')][1]",
  );
}

/** Diálogo "Impressão e pré-visualização" aberto pelo botão Gerar PDF do painel. */
function printDialog(page: Page): Locator {
  return page.locator(
    "xpath=//h2[normalize-space()='Impressão e pré-visualização']/ancestor::div[contains(@class,'max-w-[980px]')][1]",
  );
}

test("Master gera o recibo e o comprovante de um título a receber pela coluna Recibo", async ({ page }) => {
  await openReceivables(page);
  const marcador = uniqueMarker("COMPROVANTE");
  const { entityName } = await createReceivable(page, { amountDigits: "99101", observacoes: marcador });

  const row = rowWithAmount(page, "991,01").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  await row.getByTitle("Ver Comprovante e Recibo").click();

  const painel = detailsPanel(page);
  await expect(painel.getByRole("heading", { name: "Detalhes da operação" })).toBeVisible({ timeout: 15_000 });
  await expect(painel).toContainText("Resumo financeiro");
  await expect(painel).toContainText("Anexos e comprovantes");
  await expect(painel).toContainText("Nenhum anexo ou comprovante registrado.");
  // Textos próprios de um título a receber.
  await expect(painel).toContainText("Total previsto / recebido");
  await expect(painel).toContainText("Receita / Entrada");
  await expect(painel.getByText(entityName).first()).toBeVisible();
  await expect(painel.getByText(marcador)).toBeVisible();

  await painel.getByRole("button", { name: "Gerar PDF" }).click();

  const dialogo = printDialog(page);
  await expect(dialogo.getByRole("heading", { name: "Impressão e pré-visualização" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Tipo de documento")).toHaveValue("recibo");
  await expect(page.getByLabel("Tipo de documento").locator("option")).toHaveText([
    "Recibo",
    "Carnê",
    "Comprovante",
    "Provisória",
  ]);
  await expect(page.getByLabel("Tamanho do papel")).toHaveValue("a4");

  // Pré-visualização do recibo: destinatário, valor e a marcação de entrada.
  const previa = page.locator("article.new-print-preview");
  await expect(previa.locator(".new-print-title strong")).toHaveText("Recibo");
  await expect(previa.locator(".new-print-recipient")).toContainText(entityName);
  await expect(previa).toContainText("Recebemos o valor de");
  await expect(previa).toContainText("Entrada / Receita");
  await expect(previa).toContainText("991,01");

  // Trocando o tipo de documento, a pré-visualização acompanha.
  await page.getByLabel("Tipo de documento").selectOption("comprovante");
  await expect(previa.locator(".new-print-title strong")).toHaveText("Comprovante");
  await expect(previa).toContainText("Valor do lançamento");

  // "Gerar PDF" dispara a impressão do documento (a janela do navegador é interceptada).
  await page.evaluate(() => {
    (window as unknown as { impressaoChamada: boolean }).impressaoChamada = false;
    window.print = () => {
      (window as unknown as { impressaoChamada: boolean }).impressaoChamada = true;
    };
  });
  await dialogo.getByRole("button", { name: "Gerar PDF" }).click();
  expect(await page.evaluate(() => (window as unknown as { impressaoChamada: boolean }).impressaoChamada)).toBe(true);
  await expect(page.locator("body.printing-new-document")).toHaveCount(1);

  await page.getByRole("button", { name: "Fechar impressão" }).click();
  await expect(dialogo.getByRole("heading", { name: "Impressão e pré-visualização" })).toBeHidden({ timeout: 15_000 });

  await page.getByRole("button", { name: "Fechar detalhes" }).click();
  await expect(painel.getByRole("heading", { name: "Detalhes da operação" })).toBeHidden({ timeout: 15_000 });
  await expect(row).toBeVisible();
});

test("Comprovante de um título a receber com anexo lista o arquivo enviado", async ({ page }) => {
  await openReceivables(page);
  await createReceivable(page, { amountDigits: "99202", comAnexo: true });

  // Recarrega a tela: os anexos são carregados junto com a página.
  await openReceivables(page);

  const row = rowWithAmount(page, "992,02").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  await row.getByTitle("Ver Comprovante e Recibo").click();

  const painel = detailsPanel(page);
  await expect(painel.getByText("comprovante-e2e.pdf")).toBeVisible({ timeout: 30_000 });
  await expect(painel.getByText("1 arquivo", { exact: true })).toBeVisible();

  const abrir = painel.getByRole("link", { name: "Abrir" }).first();
  await expect(abrir).toHaveAttribute("href", /documents\/lancamentos\//);
});
