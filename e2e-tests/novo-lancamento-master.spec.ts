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

async function pickFirstOption(page: Page): Promise<void> {
  const options = page.locator(".max-h-60 button");
  await expect(options.first()).toBeVisible({ timeout: 15_000 });
  await options.first().click();
}

async function pickSearchableSelect(page: Page, triggerName: string | RegExp): Promise<void> {
  await page.getByRole("button", { name: triggerName }).first().click();
  await pickFirstOption(page);
}

// O botão de abertura de cada campo é o filho direto do bloco do rótulo.
async function pickFieldOption(page: Page, label: string): Promise<void> {
  await page.locator("label", { hasText: label }).locator("xpath=../..").locator("xpath=./button").click();
  await pickFirstOption(page);
}

async function dateInputFor(page: Page, labelText: string): Promise<ReturnType<Page["locator"]>> {
  return page.getByText(labelText, { exact: false }).first().locator("xpath=..").locator("input[type=date]");
}

async function fillRequiredLaunchFields(
  page: Page,
  amountDigits: string,
  condition: "À Vista" | "A Prazo",
): Promise<void> {
  await page.getByRole("button", { name: "Despesa / Saída" }).click();
  await pickSearchableSelect(page, "Selecione um cliente / fornecedor");
  await page.getByPlaceholder("0,00").first().fill(amountDigits);
  await page.getByRole("button", { name: condition, exact: true }).click();

  const dueDate = await dateInputFor(page, "Data de Vencimento");
  await dueDate.fill(futureDate());

  await pickFieldOption(page, "Categoria Contábil");
  await pickFieldOption(page, "Centro de Custo");

  const bankAccounts = page.getByRole("button").filter({ hasText: "Saldo Real:" });
  await expect(bankAccounts.first()).toBeVisible({ timeout: 15_000 });
  await bankAccounts.first().click();
}

async function expectLaunchInList(page: Page, amountText: string): Promise<void> {
  const matchingRows = page.getByRole("row").filter({ hasText: amountText });
  await expect(matchingRows.first()).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  admin = createMasterAdminClient();
  master = await createMasterTestUser(admin);
  await signInAsMaster(page, master);
});

test.afterEach(async () => {
  if (admin && master) {
    await cleanupMasterTestUser(admin, master.id);
  }
  admin = undefined;
  master = undefined;
});

test("Master cria um lançamento a pagar e ele aparece em Contas a Pagar", async ({ page }) => {
  await openNewLaunch(page);
  await fillRequiredLaunchFields(page, "12345", "À Vista");
  await page.getByRole("button", { name: "Salvar Registro" }).click();

  await expect(page.getByText("Lançamento cadastrado com sucesso!", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Novo Lançamento" })).toBeHidden({ timeout: 15_000 });
  await expectLaunchInList(page, "123,45");
});

test("Master não consegue salvar sem os campos obrigatórios", async ({ page }) => {
  await openNewLaunch(page);
  await page.getByRole("button", { name: "Despesa / Saída" }).click();
  await page.getByPlaceholder("0,00").first().fill("12345");
  await page.getByRole("button", { name: "À Vista", exact: true }).click();
  const dueDate = await dateInputFor(page, "Data de Vencimento");
  await dueDate.fill(futureDate());
  await page.getByRole("button", { name: "Salvar Registro" }).click();

  await expect(page.getByText("Por favor, preencha o destinatário.", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Novo Lançamento" })).toBeVisible();
});

test("Master cria um lançamento a prazo com parcelas", async ({ page }) => {
  await openNewLaunch(page);
  await fillRequiredLaunchFields(page, "23468", "A Prazo");

  const installmentCount = page.getByText("Nº vezes", { exact: true }).first().locator("xpath=..").locator("input[type=number]");
  await installmentCount.fill("2");
  await expect(page.getByRole("row").filter({ hasText: "#2" }).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Salvar Registro" }).click();
  await expect(page.getByText("Lançamento cadastrado com sucesso!", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Novo Lançamento" })).toBeHidden({ timeout: 15_000 });
  await expectLaunchInList(page, "117,34");
});
