import { test, expect, type Locator, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupMasterTestUser,
  createMasterAdminClient,
  createMasterTestUser,
  signInAsMaster,
  type MasterTestUser,
} from "./fixtures/master-user";
import { createPayable, openPayables, payInFull, rowWithAmount } from "./fixtures/contas-a-pagar";

test.setTimeout(150_000);

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

/** Abre o Dashboard e espera a tela sair do estado de carregamento. */
async function openDashboard(page: Page): Promise<void> {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /Dashboard Real-Time/i })).toBeVisible({ timeout: 30_000 });
}

/** Card/bloco identificado pelo título: o título fica dois níveis abaixo do container. */
function block(page: Page, title: string): Locator {
  return page.getByText(title, { exact: true }).first().locator("xpath=../..");
}

/** Guarda uma observação no relatório do teste (evidência da auditoria). */
function annotate(label: string, value: string): void {
  const texto = value.replace(/\s+/g, " ").trim();
  test.info().annotations.push({ type: label, description: texto.length > 400 ? `${texto.slice(0, 400)}…` : texto });
}

/** Valores usados para checar se um bloco reage (ou não) ao filtro de centro de custo. */
async function readProbe(page: Page): Promise<string> {
  const kpi = page.getByText("Realizado · entradas / saídas", { exact: true }).first().locator("xpath=..");
  const partes = [
    `KPI realizado=${(await kpi.innerText()).replace(/\s+/g, " ")}`,
    `SaudeCC=${(await block(page, "Saúde por Centro de Custo").innerText()).replace(/\s+/g, " ")}`,
    `Desempenho=${(await block(page, "Desempenho & Desperdício").innerText()).replace(/\s+/g, " ")}`,
    `SaidasCategoria=${(await block(page, "Saídas por Categoria").innerText()).replace(/\s+/g, " ")}`,
  ];
  return partes.join(" | ");
}

test("Dashboard carrega a visão geral com todos os blocos principais", async ({ page }) => {
  await openDashboard(page);

  await expect(page.getByRole("button", { name: "Visão Geral" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fluxo de Caixa" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Auditoria" })).toBeVisible();

  await expect(page.getByText("Saldos de Caixa")).toBeVisible();
  await expect(page.getByText("Expectativa Final")).toBeVisible();
  await expect(page.getByText("Fila de Trabalho")).toBeVisible();
  await expect(page.getByText("SALDO POR CONTA")).toBeVisible();

  const exportar = page.getByRole("button", { name: /Exportar CSV/i });
  await expect(exportar).toBeVisible();
  annotate("Exportar CSV habilitado", String(await exportar.isEnabled()));

  const periodo = page.locator("select").filter({ hasText: "Todo o período" });
  await expect(periodo).toBeVisible();
  annotate("Opções do seletor de período", (await periodo.locator("option").allInnerTexts()).join(" | "));
  annotate("Período selecionado por padrão", await periodo.inputValue());

  for (const titulo of [
    "Performance por Centro de Custo",
    "Desempenho & Desperdício",
    "Cobertura das Provisões",
    "Inadimplência por Valor",
    "Fluxo de Caixa Diário · Realizado × Projetado",
    "Saídas por Categoria",
    "Concentração de Receita · Top 5 Clientes",
    "Saúde por Centro de Custo",
  ]) {
    await expect(block(page, titulo), `Bloco ausente na visão geral: ${titulo}`).toBeVisible();
  }

  for (const kpi of ["Liquidez corrente", "Margem operacional", "Saldo projetado", "Realizado · entradas / saídas"]) {
    const card = page.getByText(kpi, { exact: true }).first().locator("xpath=..");
    await expect(card, `KPI ausente: ${kpi}`).toBeVisible();
    annotate(`KPI ${kpi}`, await card.innerText());
  }

  annotate("Desempenho & Desperdício", await block(page, "Desempenho & Desperdício").innerText());
  annotate("Cobertura das Provisões", await block(page, "Cobertura das Provisões").innerText());
  annotate("Inadimplência por Valor", await block(page, "Inadimplência por Valor").innerText());
  annotate("Saúde por Centro de Custo", await block(page, "Saúde por Centro de Custo").innerText());
  annotate("Contas no filtro de conta", String(await page.getByTestId("dashboard-account-card").count()));
  annotate("Centros de custo no gráfico", String(await page.getByTestId("dashboard-cc-bar").count()));
});

test("Abas do dashboard alternam entre visão geral, fluxo de caixa e auditoria", async ({ page }) => {
  await openDashboard(page);

  await page.getByRole("button", { name: "Fluxo de Caixa" }).click();
  await expect(page.getByText("Histórico Recente de Fluxo")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("SALDO POR CONTA")).toBeHidden();

  await page.getByRole("button", { name: "Auditoria" }).click();
  await expect(page.getByText("Rastro de Auditoria")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Atualizar Dados/i })).toBeVisible();
  await expect(page.getByText("SALDO POR CONTA")).toBeHidden();

  await page.getByRole("button", { name: "Visão Geral" }).click();
  await expect(page.getByText("SALDO POR CONTA")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Rastro de Auditoria")).toBeHidden();
});

test("Filtro de conta destaca o card e pode ser limpo", async ({ page }) => {
  await openDashboard(page);

  const cards = page.getByTestId("dashboard-account-card");
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });

  const limpar = page.getByRole("button", { name: /Limpar Filtro Conta/i });
  await expect(limpar).toBeHidden();

  await cards.first().click();
  await expect(cards.first()).toHaveClass(/ring-2/);
  await expect(limpar).toBeVisible();

  await limpar.click();
  await expect(page.getByRole("button", { name: /Limpar Filtro Conta/i })).toBeHidden();
  await expect(cards.first()).not.toHaveClass(/ring-2/);
});

test("Filtro de centro de custo destaca a barra e pode ser limpo", async ({ page }) => {
  await openDashboard(page);

  const barras = page.getByTestId("dashboard-cc-bar");
  await expect(barras.first()).toBeVisible({ timeout: 15_000 });
  const total = await barras.count();

  const limpar = page.getByRole("button", { name: /Limpar Filtro Centro/i });
  await expect(limpar).toBeHidden();

  await barras.first().click();
  await expect(barras.first()).toHaveClass(/scale-105/);
  await expect(limpar).toBeVisible();
  if (total > 1) {
    await expect(barras.nth(1)).toHaveClass(/grayscale/);
  }

  await limpar.click();
  await expect(page.getByRole("button", { name: /Limpar Filtro Centro/i })).toBeHidden();
  await expect(barras.first()).not.toHaveClass(/grayscale/);
});

test("Filtro de centro de custo com dados: o que a tela filtra hoje", async ({ page }) => {
  test.setTimeout(240_000);

  // Dois títulos pagos, cada um em um centro de custo diferente.
  await openPayables(page);
  const primeiro = await createPayable(page, { amountDigits: "50000", costCenterIndex: 0 });
  await payInFull(page, rowWithAmount(page, "500,00").first());
  const segundo = await createPayable(page, { amountDigits: "70000", costCenterIndex: 1 });
  await payInFull(page, rowWithAmount(page, "700,00").first());

  await openDashboard(page);
  await expect(page.getByText("SALDO POR CONTA")).toBeVisible({ timeout: 30_000 });

  annotate("Centro de custo A", primeiro.costCenterName);
  annotate("Centro de custo B", segundo.costCenterName);
  annotate("Sem filtro de centro de custo", await readProbe(page));

  const barraA = page.getByTestId("dashboard-cc-bar").filter({ hasText: primeiro.costCenterName }).first();
  await expect(barraA).toBeVisible({ timeout: 15_000 });
  await barraA.click();
  await expect(page.getByRole("button", { name: /Limpar Filtro Centro/i })).toBeVisible();

  annotate(`Com filtro no centro de custo A (${primeiro.costCenterName})`, await readProbe(page));
});

// Requisito pendente (aguardando aprovação): com um centro de custo selecionado, saldos, fila de
// trabalho, indicadores, cobertura, inadimplência, fluxo diário, saídas por categoria, receita por
// cliente e saúde por centro de custo devem mostrar apenas aquele centro. Hoje apenas o gráfico
// "Performance por Centro de Custo" e o bloco "Desempenho & Desperdício" reagem ao filtro.
test.fixme("Filtro de centro de custo deve refletir em todos os blocos do dashboard", async ({ page }) => {
  await openDashboard(page);
  await page.getByTestId("dashboard-cc-bar").first().click();
  await expect(block(page, "Saídas por Categoria")).toContainText("centro de custo selecionado");
});

test("Dashboard não gera erros de console nem exceções durante o uso", async ({ page }) => {
  const problemas: string[] = [];
  page.on("pageerror", (erro) => problemas.push(`pageerror: ${erro.message}`));
  page.on("console", (mensagem) => {
    if (mensagem.type() === "error") problemas.push(`console.error: ${mensagem.text()}`);
  });

  await openDashboard(page);
  await page.getByRole("button", { name: "Fluxo de Caixa" }).click();
  await expect(page.getByText("Histórico Recente de Fluxo")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Auditoria" }).click();
  await expect(page.getByText("Rastro de Auditoria")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Visão Geral" }).click();
  await expect(page.getByText("SALDO POR CONTA")).toBeVisible({ timeout: 15_000 });

  annotate("Erros de console", problemas.length ? problemas.join(" | ") : "nenhum");
  expect(problemas, `Erros observados no Dashboard: ${problemas.join(" | ")}`).toEqual([]);
});
