import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupMasterTestUser,
  createMasterAdminClient,
  createMasterTestUser,
  signInAsMaster,
  type MasterTestUser,
} from "./fixtures/master-user";

test.setTimeout(120_000);

let admin: SupabaseClient | undefined;
let master: MasterTestUser | undefined;

function futureDate(daysAhead = 2): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

async function openNewLaunch(page: Page): Promise<void> {
  await page.goto("/pagar", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Contas a Pagar" }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /novo lançamento/i }).first().click();
  await expect(page.getByRole("heading", { name: "Novo Lançamento" })).toBeVisible({ timeout: 15_000 });
}

async function pickSearchableOption(page: Page, triggerName: string | RegExp): Promise<void> {
  await page.getByRole("button", { name: triggerName }).first().click();
  const options = page.locator(".max-h-60 button");
  await expect(options.first()).toBeVisible({ timeout: 15_000 });
  await options.first().click();
}

async function dateInputFor(page: Page, labelText: string) {
  return page.getByText(labelText, { exact: false }).first().locator("xpath=..").locator("input[type=date]");
}

async function fillLaunch(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Despesa / Saída" }).click();
  await pickSearchableOption(page, "Selecione um cliente / fornecedor");
  await page.getByPlaceholder("0,00").first().fill("50123");
  await page.getByRole("button", { name: "À Vista", exact: true }).click();
  await (await dateInputFor(page, "Data de Vencimento")).fill(futureDate());
  await pickSearchableOption(page, /^Selecione\.\.\.$/);

  const bankAccounts = page.getByRole("button").filter({ hasText: "Saldo Real:" });
  await expect(bankAccounts.first()).toBeVisible({ timeout: 15_000 });
  await bankAccounts.first().click();
}

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

test("Master anexa um documento ao criar o lançamento", async ({ page }) => {
  await openNewLaunch(page);
  await fillLaunch(page);

  const fileInput = page
    .getByText("Nota Fiscal / Produto")
    .locator("xpath=..")
    .locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "nota-fiscal.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("teste"),
  });
  await expect(page.getByText("1 Anexo(s)", { exact: true })).toBeVisible();
  await expect(page.getByText("nota-fiscal.pdf", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Salvar Registro" }).click();
  const outcome = page.getByText(/Lançamento cadastrado com sucesso!|Ocorreu um problema:/).last();
  await expect(outcome).toBeVisible({ timeout: 30_000 });
  const observedMessage = (await outcome.textContent())?.trim() ?? "";
  test.info().annotations.push({ type: "Desfecho observado (anexo)", description: observedMessage });
  await expect(page.getByText("Lançamento cadastrado com sucesso!", { exact: true })).toBeVisible();
});
