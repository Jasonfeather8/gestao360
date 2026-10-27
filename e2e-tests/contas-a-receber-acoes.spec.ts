import { test, expect } from "@playwright/test";
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

test("Master exclui um título a receber pelo menu de ações", async ({ page }) => {
  await openReceivables(page);
  await createReceivable(page, { amountDigits: "97701" });

  const row = rowWithAmount(page, "977,01").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  page.on("dialog", dialog => dialog.accept());
  await row.getByTestId("lancamento-action-menu").click();
  await page.getByTestId("action-excluir").click();

  await expect(row).toHaveCount(0, { timeout: 30_000 });
});

test("Master baixa o arquivo anexado a um título a receber pelo menu de ações", async ({ page }) => {
  await openReceivables(page);
  await createReceivable(page, { amountDigits: "98802", comAnexo: true });

  // Recarrega a tela: a lista de anexos é carregada com a página.
  await openReceivables(page);

  const row = rowWithAmount(page, "988,02").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  await row.getByTestId("lancamento-action-menu").click();
  const linkArquivo = page.getByTestId("action-baixar-arquivo");
  await expect(linkArquivo).toBeVisible({ timeout: 15_000 });
  await expect(linkArquivo).toHaveAttribute("href", /documents\/lancamentos\//);

  // O clique abre o arquivo em uma nova aba (o link aponta para o armazenamento de documentos).
  const novaAba = page.waitForEvent("popup", { timeout: 60_000 }).catch(() => null);
  const arquivoBaixado = page.waitForEvent("download", { timeout: 60_000 }).catch(() => null);
  await linkArquivo.click();

  const [popup, arquivo] = await Promise.all([novaAba, arquivoBaixado]);
  if (popup) {
    await expect(popup).toHaveURL(/\/storage\/v1\/object\/public\/documents\/lancamentos\//);
  } else {
    expect(arquivo?.suggestedFilename()).toContain("comprovante-e2e");
  }
});
