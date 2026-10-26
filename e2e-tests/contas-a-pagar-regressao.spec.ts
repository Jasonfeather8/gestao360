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
  await page.getByRole("button", { name: /novo lançamento/i }).first().click();
  await expect(page.getByRole("heading", { name: "Novo Lançamento" })).toBeVisible({ timeout: 15_000 });
}

async function pickSearchableOption(page: Page, triggerName: string | RegExp): Promise<string> {
  await page.getByRole("button", { name: triggerName }).first().click();
  const options = page.locator(".max-h-60 button");
  await expect(options.first()).toBeVisible({ timeout: 15_000 });
  const label = (await options.first().locator("span").first().innerText()).trim();
  await options.first().click();
  return label;
}

// O botão de abertura de cada campo é o filho direto do bloco do rótulo.
function fieldTrigger(page: Page, label: string) {
  return page.locator("label", { hasText: label }).locator("xpath=../..").locator("xpath=./button");
}

async function selectCategoryAndCostCenter(page: Page): Promise<void> {
  // O painel nem sempre vem com categoria e centro de custo preenchidos; escolhe os dois pelo rótulo.
  for (const label of ["Categoria Contábil", "Centro de Custo"]) {
    await fieldTrigger(page, label).click();
    const options = page.locator(".max-h-60 button");
    await expect(options.first()).toBeVisible({ timeout: 15_000 });
    await options.first().click();
  }
}

async function fillLaunch(page: Page, amountDigits: string, type: "Receita / Entrada" | "Despesa / Saída"): Promise<string> {
  await openNewLaunch(page);
  await page.getByRole("button", { name: type }).click();
  const entityName = await pickSearchableOption(page, "Selecione um cliente / fornecedor");
  await page.getByPlaceholder("0,00").first().fill(amountDigits);
  await page.getByRole("button", { name: "À Vista", exact: true }).click();
  const dueDate = page.getByText("Data de Vencimento", { exact: false }).first().locator("xpath=..").locator("input[type=date]");
  await dueDate.fill(futureDate());
  await selectCategoryAndCostCenter(page);

  const bankAccounts = page.getByRole("button").filter({ hasText: "Saldo Real:" });
  await expect(bankAccounts.first()).toBeVisible({ timeout: 15_000 });
  await bankAccounts.first().click();
  return entityName;
}

async function saveLaunch(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Salvar Registro" }).click();
  const toast = page.locator("div.fixed.bottom-6.right-6 > div").last();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const observedMessage = (await toast.locator("p").last().innerText()).trim();
  expect(observedMessage, `Mensagem exibida ao salvar: "${observedMessage}"`).toBe("Lançamento cadastrado com sucesso!");
}

async function goToPayables(page: Page): Promise<void> {
  await page.goto("/pagar", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Contas a Pagar" }).first()).toBeVisible({ timeout: 30_000 });
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

test("Contas a Pagar mostra apenas saídas", async ({ page }) => {
  await goToPayables(page);
  const incomeEntity = await fillLaunch(page, "70101", "Receita / Entrada");
  await saveLaunch(page);

  const incomeRows = page.getByRole("row").filter({ hasText: "701,01" }).filter({ hasText: incomeEntity });
  await expect(
    incomeRows,
    `A receita de 701,01 (entidade "${incomeEntity}") apareceu em Contas a Pagar`,
  ).toHaveCount(0);

  await fillLaunch(page, "70202", "Despesa / Saída");
  await saveLaunch(page);
  await expect(page.getByRole("row").filter({ hasText: "702,02" }).first()).toBeVisible({ timeout: 30_000 });
});

test("Transferência entre contas não aparece em Contas a Pagar", async ({ page }) => {
  await goToPayables(page);
  await expect(page.getByText("Sincronizando registros...", { exact: true })).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("row").filter({ hasText: "Transferência entre contas" })).toHaveCount(0);
});

test("A busca da tela filtra pelo texto digitado", async ({ page }) => {
  await goToPayables(page);
  const amountText = "703,03";
  const entityName = await fillLaunch(page, "70303", "Despesa / Saída");
  await saveLaunch(page);

  const search = page.getByPlaceholder("Pesquisar por entidade ou observação...");
  await search.fill(entityName);
  const matchingRow = page.getByRole("row").filter({ hasText: amountText });
  await expect(matchingRow.first()).toBeVisible({ timeout: 30_000 });

  await search.fill("zzzz-nao-existe");
  await expect(matchingRow).toHaveCount(0, { timeout: 30_000 });
});
