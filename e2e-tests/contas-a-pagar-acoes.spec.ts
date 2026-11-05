import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupMasterTestUser,
  createMasterAdminClient,
  createMasterTestUser,
  signInAsMaster,
  type MasterTestUser,
} from "./fixtures/master-user";
import {
  createPayable,
  openPayables,
  payPartially,
  readOperationalBalance,
  rowWithAmount,
  searchField,
  uniqueMarker,
} from "./fixtures/contas-a-pagar";

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

test("Master exclui um título pelo menu de ações", async ({ page }) => {
  await openPayables(page);
  await createPayable(page, { amountDigits: "177100" });

  const row = rowWithAmount(page, "1.771,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  page.on("dialog", dialog => dialog.accept());
  await row.getByTestId("lancamento-action-menu").click();
  await page.getByTestId("action-excluir").click();

  await expect(row).toHaveCount(0, { timeout: 30_000 });
});

test("Master estorna no Financeiro um título baixado parcialmente e o saldo da conta volta", async ({ page }) => {
  await openPayables(page);
  const marcador = uniqueMarker("ESTORNO PARCIAL");
  const { bankName } = await createPayable(page, { amountDigits: "288200", observacoes: marcador });

  const row = rowWithAmount(page, "2.882,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const saldoAntes = await readOperationalBalance(page, bankName);

  await payPartially(page, row, "80000", "Pagamento parcial acertado com o fornecedor.");
  await expect(row.getByText("Pago Parcial").first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(
    async () => Math.round((await readOperationalBalance(page, bankName)) * 100) / 100,
    { timeout: 30_000 },
  ).toBe(Math.round((saldoAntes - 800) * 100) / 100);

  // Contas a Pagar não tem estorno: o menu ⋮ desta tela oferece AVR e Excluir.
  await row.getByTestId("lancamento-action-menu").click();
  await expect(page.getByTestId("action-avr")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("action-excluir")).toBeVisible();
  await expect(page.getByTestId("action-estornar")).toHaveCount(0);

  // O estorno de um título já baixado é feito no Financeiro, pelo Master.
  await page.goto("/lancamentos", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await searchField(page).fill(marcador);
  const linhaFinanceiro = rowWithAmount(page, "2.882,00").first();
  await expect(linhaFinanceiro).toBeVisible({ timeout: 30_000 });
  page.once("dialog", dialog => void dialog.accept());
  await linhaFinanceiro.getByTestId("lancamento-action-menu").click();
  await page.getByTestId("action-estornar").click();

  // De volta a Contas a Pagar o título está aberto de novo e o saldo foi restaurado.
  await openPayables(page);
  await searchField(page).fill(marcador);
  const rowAberto = rowWithAmount(page, "2.882,00").first();
  await expect(rowAberto).toBeVisible({ timeout: 30_000 });
  await expect(rowAberto.getByText("Pago Parcial")).toHaveCount(0, { timeout: 30_000 });
  await expect(rowAberto.getByRole("button", { name: /dar baixa/i })).toBeVisible();
  await expect.poll(
    async () => Math.round((await readOperationalBalance(page, bankName)) * 100) / 100,
    { timeout: 30_000 },
  ).toBe(Math.round(saldoAntes * 100) / 100);
});

test("Master baixa o arquivo anexado pelo menu de ações", async ({ page }) => {
  await openPayables(page);
  await createPayable(page, { amountDigits: "399300", comAnexo: true });

  // Recarrega a tela: a lista de anexos é carregada com a página.
  await openPayables(page);

  const row = rowWithAmount(page, "3.993,00").first();
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
