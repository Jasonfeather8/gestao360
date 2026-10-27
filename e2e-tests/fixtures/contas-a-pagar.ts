import { expect, type Locator, type Page } from "@playwright/test";

/** Texto único para gravar em Observações e localizar o título criado pela busca. */
export function uniqueMarker(prefix: string): string {
  return `E2E ${prefix} ${Date.now()}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

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

/** Escolhe uma opção da lista pelo índice (0 = primeira) e devolve o rótulo escolhido. */
async function chooseOption(page: Page, label: string, index = 0): Promise<string> {
  await fieldTrigger(page, label).click();
  const option = page.locator(".max-h-60 button").nth(index);
  await expect(option).toBeVisible({ timeout: 15_000 });
  const chosen = (await option.locator("span").first().innerText()).trim();
  await option.click();
  return chosen;
}

/** Escolhe a conta bancária do painel pelo índice (0 = primeira) e devolve o nome da conta. */
async function chooseBankAccount(page: Page, index = 0): Promise<string> {
  const account = page.getByRole("button").filter({ hasText: "Saldo Real:" }).nth(index);
  await expect(account).toBeVisible({ timeout: 15_000 });
  const name = (await account.locator("span").first().innerText()).trim();
  await account.click();
  return name;
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
  /** Texto gravado em "Observações Contábeis" (usado pelas buscas). */
  observacoes?: string;
  /** Índice da opção escolhida em cada lista do painel (0 = primeira). */
  entityIndex?: number;
  categoryIndex?: number;
  costCenterIndex?: number;
  bankAccountIndex?: number;
};

export type CreatedPayable = {
  entityName: string;
  categoryName: string;
  costCenterName: string;
  bankName: string;
};

/** Cria um lançamento a pagar pelo painel e espera a confirmação de sucesso. */
export async function createPayable(page: Page, input: PayableInput): Promise<CreatedPayable> {
  await openNewLaunch(page);
  await page.getByRole("button", { name: "Despesa / Saída" }).click();
  const entityName = await chooseOption(page, "Entidade / Destinatário", input.entityIndex);
  await page.getByPlaceholder("0,00").first().fill(input.amountDigits);
  await page.getByRole("button", { name: input.condicao ?? "À Vista", exact: true }).click();
  await fillDate(page, "Data de Vencimento", input.dueDate ?? futureDate());
  const categoryName = await chooseOption(page, "Categoria Contábil", input.categoryIndex);
  const costCenterName = await chooseOption(page, "Centro de Custo", input.costCenterIndex);
  const bankName = await chooseBankAccount(page, input.bankAccountIndex);

  if (input.observacoes) {
    await page.getByPlaceholder("Digite descrições detalhadas...").fill(input.observacoes);
  }

  if (input.installments && input.installments > 1) {
    const installmentCount = page.getByText("Nº vezes", { exact: true }).first().locator("xpath=..").locator("input[type=number]");
    await installmentCount.fill(String(input.installments));
    await expect(page.getByRole("row").filter({ hasText: `#${input.installments}` }).first()).toBeVisible({ timeout: 15_000 });
  }

  await page.getByRole("button", { name: "Salvar Registro" }).click();
  const message = await readToast(page);
  expect(message, `Mensagem exibida ao salvar: "${message}"`).toBe("Lançamento cadastrado com sucesso!");
  await expect(page.getByRole("heading", { name: "Novo Lançamento" })).toBeHidden({ timeout: 15_000 });
  return { entityName, categoryName, costCenterName, bankName };
}

/** Linha da listagem que contém o valor informado (ex.: "884,22"). */
export function rowWithAmount(page: Page, amountText: string): Locator {
  return page.getByRole("row").filter({ hasText: amountText });
}

/** Linha de uma parcela da listagem (ex.: "1/2" casa com o texto "(par 1/2)"). */
export function rowWithParcela(page: Page, parcela: string): Locator {
  return page.getByRole("row").filter({ hasText: `(par ${parcela})` });
}

/** Campo "Pesquisar por entidade ou observação...". */
export function searchField(page: Page): Locator {
  return page.getByPlaceholder("Pesquisar por entidade ou observação...");
}

/** Campo "Cód. Doc" (aceita "123" ou "123-2" para a parcela). */
export function docCodeField(page: Page): Locator {
  return page.getByPlaceholder("Cód. Doc");
}

/** Contador do rodapé: "Exibindo X de Y registros". */
export function shownCounter(page: Page): Locator {
  return page.getByText(/^Exibindo \d+ de \d+ registros$/);
}

/** Aviso exibido quando a busca não encontra nenhum título. */
export function emptyListMessage(page: Page): Locator {
  return page.getByText("Nenhum lançamento localizado");
}

/** Código do documento mostrado na coluna "Documento" da linha informada. */
export async function readDocumentCode(row: Locator): Promise<string> {
  const text = (await row.locator("td").nth(1).innerText()).trim();
  const codigo = text.match(/\d+/)?.[0];
  if (!codigo) throw new Error(`Linha sem código de documento. Texto encontrado: "${text}"`);
  return codigo;
}

/** Valor "Operacional" mostrado no card da conta bancária indicada. */
export async function readOperationalBalance(page: Page, bankName: string): Promise<number> {
  const card = page.getByTestId("account-card").filter({ hasText: bankName }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const texto = (await card.getByText("Operacional", { exact: true }).locator("xpath=..").locator("p").innerText()).trim();
  return Number(texto.replace("R$", "").replace(/\./g, "").replace(",", ".").trim());
}

/** Abre o modal de baixa pelo botão "Dar baixa" da linha. */
export async function openBaixa(page: Page, row: Locator): Promise<void> {
  await row.getByRole("button", { name: /dar baixa/i }).click();
  await expect(page.getByRole("heading", { name: "Operações de Baixa de Título" })).toBeVisible({ timeout: 15_000 });
}

/** Marca "Dispensar comprovante", que libera a baixa sem anexo. */
export async function allowBaixaWithoutReceipt(page: Page): Promise<void> {
  await page.getByTestId("dispensar-comprovante").click();
}

/** Faz a baixa integral do título pelo modal, sem anexo, e espera o modal fechar. */
export async function payInFull(page: Page, row: Locator): Promise<void> {
  await openBaixa(page, row);
  await allowBaixaWithoutReceipt(page);
  await page.getByRole("button", { name: "Baixar Título" }).click();
  await expect(page.getByRole("heading", { name: "Confirmar Baixa de Título?" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Confirmar e Baixar" }).click();
  await expect(page.getByRole("heading", { name: "Operações de Baixa de Título" })).toBeHidden({ timeout: 30_000 });
}

/** Botão que abre um dos filtros de lista do painel "Filtros adicionais". */
export function filterTrigger(page: Page, filterTestId: string): Locator {
  return page.getByTestId(filterTestId).getByRole("button");
}

/** Marca/desmarca uma opção de um filtro de lista e fecha o painel do filtro. */
export async function toggleFilterOption(page: Page, filterTestId: string, option: string): Promise<void> {
  await filterTrigger(page, filterTestId).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await page.keyboard.press("Escape");
}

/** Rótulos disponíveis em um filtro de lista (inclui a opção "todos"). */
export async function readFilterOptions(page: Page, filterTestId: string): Promise<string[]> {
  await filterTrigger(page, filterTestId).click();
  const labels = (await page.getByRole("option").allInnerTexts()).map(text => text.trim());
  await page.keyboard.press("Escape");
  return labels;
}
