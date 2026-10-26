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

// O botão de abertura de cada campo é o filho direto do bloco do rótulo.
function fieldTrigger(page: Page, label: string) {
  return page.locator("label", { hasText: label }).locator("xpath=../..").locator("xpath=./button");
}

function fieldTriggerText(page: Page, label: string) {
  return fieldTrigger(page, label).locator("span").first();
}

async function chooseFirstOption(page: Page, label: string): Promise<string> {
  await fieldTrigger(page, label).click();
  const options = page.locator(".max-h-60 button");
  await expect(options.first()).toBeVisible({ timeout: 15_000 });
  const chosen = (await options.first().locator("span").first().innerText()).trim();
  await options.first().click();
  return chosen;
}

async function chooseBankAccount(page: Page): Promise<void> {
  const bankAccounts = page.getByRole("button").filter({ hasText: "Saldo Real:" });
  await expect(bankAccounts.first()).toBeVisible({ timeout: 15_000 });
  await bankAccounts.first().click();
}

async function fillDate(page: Page, label: string, value: string): Promise<void> {
  await page.locator(`label:has-text("${label}")`).locator("xpath=..").locator('input[type="date"]').fill(value);
}

async function fillPanel(page: Page, direction: "Receita / Entrada" | "Despesa / Saída", amountDigits: string): Promise<void> {
  await page.getByRole("button", { name: direction }).click();
  await chooseFirstOption(page, "Entidade / Destinatário");
  await page.getByPlaceholder("0,00").first().fill(amountDigits);
  await page.getByRole("button", { name: "À Vista", exact: true }).click();
  await fillDate(page, "Data de Vencimento", futureDate());
  await chooseFirstOption(page, "Categoria Contábil");
  await chooseFirstOption(page, "Centro de Custo");
  await chooseBankAccount(page);
}

// Lê a mensagem do aviso que aparece no canto inferior direito.
async function saveAndReadMessage(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Salvar Registro" }).click();
  const toast = page.locator("div.fixed.bottom-6.right-6 > div").last();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  return (await toast.locator("p").last().innerText()).trim();
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

test("Master lança uma receita pelo painel de lançamento", async ({ page }) => {
  await openNewLaunch(page);
  await fillPanel(page, "Receita / Entrada", "70101");

  const message = await saveAndReadMessage(page);
  expect(message, `Mensagem exibida ao salvar a receita: "${message}"`).toBe("Lançamento cadastrado com sucesso!");
  await expect(page.getByRole("heading", { name: "Novo Lançamento" })).toBeHidden({ timeout: 15_000 });
});

test("Master lança uma despesa pelo painel de lançamento", async ({ page }) => {
  await openNewLaunch(page);
  await fillPanel(page, "Despesa / Saída", "70202");

  const message = await saveAndReadMessage(page);
  expect(message, `Mensagem exibida ao salvar a despesa: "${message}"`).toBe("Lançamento cadastrado com sucesso!");
  await expect(page.getByRole("heading", { name: "Novo Lançamento" })).toBeHidden({ timeout: 15_000 });
});

test("A categoria do painel acompanha a troca entre receita e despesa", async ({ page }) => {
  await openNewLaunch(page);
  await page.getByRole("button", { name: "Despesa / Saída" }).click();
  const before = (await fieldTriggerText(page, "Categoria Contábil").innerText()).trim();

  await page.getByRole("button", { name: "Receita / Entrada" }).click();
  const after = (await fieldTriggerText(page, "Categoria Contábil").innerText()).trim();

  expect(
    after,
    `A categoria mostrada ao trocar a direção para Receita ficou como "${after}" (antes da troca: "${before}")`,
  ).not.toBe("Selecione...");
});

test("O painel abre com o centro de custo preenchido", async ({ page }) => {
  await openNewLaunch(page);
  // Aguarda o carregamento das listas do painel para descartar atraso de carregamento.
  await expect(page.getByRole("button").filter({ hasText: "Saldo Real:" }).first()).toBeVisible({ timeout: 15_000 });
  await expect(fieldTriggerText(page, "Categoria Contábil")).not.toHaveText("Selecione...", { timeout: 15_000 });

  const categoria = (await fieldTriggerText(page, "Categoria Contábil").innerText()).trim();
  const centro = (await fieldTriggerText(page, "Centro de Custo").innerText()).trim();

  expect(centro, `Centro de custo ao abrir o painel: "${centro}" (categoria: "${categoria}")`).not.toBe("Selecione...");
});

test("Master consegue cadastrar um lançamento já pago pelo painel", async ({ page }) => {
  await openNewLaunch(page);
  await fillPanel(page, "Despesa / Saída", "23456");

  await page.getByRole("checkbox", { name: "Já foi recebido / pago?" }).check();
  await fillDate(page, "Data do Recebimento", futureDate());
  await page
    .locator('label:has-text("Valor Recebido")')
    .locator("xpath=..")
    .locator("input")
    .fill("23456");

  const message = await saveAndReadMessage(page);
  expect(message, `Mensagem exibida ao salvar um lançamento já pago: "${message}"`).toBe("Lançamento cadastrado com sucesso!");
});

test("Ao trocar a direção, o painel escolhe uma categoria da nova direção e salva", async ({ page }) => {
  await openNewLaunch(page);
  await page.getByRole("button", { name: "Despesa / Saída" }).click();
  await page.getByRole("button", { name: "Receita / Entrada" }).click();

  // Preenche todos os campos, menos a categoria, e salva sem reescolhê-la.
  await chooseFirstOption(page, "Entidade / Destinatário");
  await page.getByPlaceholder("0,00").first().fill("70505");
  await page.getByRole("button", { name: "À Vista", exact: true }).click();
  await fillDate(page, "Data de Vencimento", futureDate());
  await expect(fieldTriggerText(page, "Categoria Contábil")).not.toHaveText("Selecione...", { timeout: 15_000 });
  await chooseFirstOption(page, "Centro de Custo");
  await chooseBankAccount(page);

  const message = await saveAndReadMessage(page);
  expect(
    message,
    `Mensagem exibida ao salvar uma receita sem reescolher a categoria: "${message}"`,
  ).toBe("Lançamento cadastrado com sucesso!");
});
