import { expect, type Locator, type Page } from "@playwright/test";

export function futureDate(daysAhead = 2): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export async function openPayables(page: Page): Promise<void> {
  await page.goto("/pagar", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Contas a Pagar" }).first()).toBeVisible({ timeout: 30_000 });
}

export async function openNewLaunch(page: Page): Promise<void> {
  await page.getByRole("button", { name: /novo lançamento/i }).first().click();
  await expect(page.getByRole("heading", { name: "Novo Lançamento" })).toBeVisible({ timeout: 15_000 });
}

// O botão de abertura de cada campo é o filho direto do bloco do rótulo.
function fieldTrigger(page: Page, label: string): Locator {
  return page.locator("label", { hasText: label }).locator("xpath=../..").locator("xpath=./button");
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

/** Lê a mensagem do aviso que aparece no canto inferior direito. */
export async function readToast(page: Page): Promise<string> {
  const toast = page.getByTestId("toast").last();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  return (await toast.locator("p").last().innerText()).trim();
}

export type PayableInput = {
  /** Dígitos crus digitados no campo de valor: "88422" vira R$ 884,22. */
  amountDigits: string;
  dueDate?: string;
  condicao?: "À Vista" | "A Prazo";
  /** Nº de parcelas quando a condição é "A Prazo". */
  installments?: number;
};

/** Cria um lançamento a pagar pelo painel e espera a confirmação de sucesso. */
export async function createPayable(page: Page, input: PayableInput): Promise<{ entityName: string }> {
  await openNewLaunch(page);
  await page.getByRole("button", { name: "Despesa / Saída" }).click();
  const entityName = await chooseFirstOption(page, "Entidade / Destinatário");
  await page.getByPlaceholder("0,00").first().fill(input.amountDigits);
  await page.getByRole("button", { name: input.condicao ?? "À Vista", exact: true }).click();
  await fillDate(page, "Data de Vencimento", input.dueDate ?? futureDate());
  await chooseFirstOption(page, "Categoria Contábil");
  await chooseFirstOption(page, "Centro de Custo");
  await chooseBankAccount(page);

  if (input.installments && input.installments > 1) {
    const installmentCount = page.getByText("Nº vezes", { exact: true }).first().locator("xpath=..").locator("input[type=number]");
    await installmentCount.fill(String(input.installments));
    await expect(page.getByRole("row").filter({ hasText: `#${input.installments}` }).first()).toBeVisible({ timeout: 15_000 });
  }

  await page.getByRole("button", { name: "Salvar Registro" }).click();
  const message = await readToast(page);
  expect(message, `Mensagem exibida ao salvar: "${message}"`).toBe("Lançamento cadastrado com sucesso!");
  await expect(page.getByRole("heading", { name: "Novo Lançamento" })).toBeHidden({ timeout: 15_000 });
  return { entityName };
}

/** Linha da listagem que contém o valor informado (ex.: "884,22"). */
export function rowWithAmount(page: Page, amountText: string): Locator {
  return page.getByRole("row").filter({ hasText: amountText });
}

/** Linha de uma parcela da listagem (ex.: "1/2" casa com o texto "(par 1/2)"). */
export function rowWithParcela(page: Page, parcela: string): Locator {
  return page.getByRole("row").filter({ hasText: `(par ${parcela})` });
}
