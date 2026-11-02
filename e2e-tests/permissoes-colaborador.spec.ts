import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  cleanupColaboradorTestUser,
  createColaboradorAdminClient,
  createColaboradorTestUser,
  createContaBancaria,
  createLancamentoAberto,
  signInAsColaborador,
  type ColaboradorTestUser,
} from "./fixtures/colaborador-user";

test.setTimeout(150_000);

let admin: SupabaseClient | undefined;
let colaborador: ColaboradorTestUser | undefined;
let contaLiberada: string | undefined;
let contaBloqueada: string | undefined;
let lancamentoId: string | undefined;
let nomeContaLiberada = "";

test.beforeEach(async ({ page }) => {
  admin = createColaboradorAdminClient();
  nomeContaLiberada = `Banco liberado ${randomUUID()}`;
  const nomeContaBloqueada = `Banco bloqueado ${randomUUID()}`;
  contaLiberada = await createContaBancaria(admin, nomeContaLiberada);
  contaBloqueada = await createContaBancaria(admin, nomeContaBloqueada);
  colaborador = await createColaboradorTestUser(admin, [contaLiberada]);
  lancamentoId = await createLancamentoAberto(admin, { contaId: contaLiberada, userId: colaborador.id });
  await signInAsColaborador(page, colaborador);
});

test.afterEach(async () => {
  if (admin && colaborador) {
    await cleanupColaboradorTestUser(admin, {
      userId: colaborador.id,
      lancamentoIds: lancamentoId ? [lancamentoId] : [],
      contaIds: [contaLiberada, contaBloqueada].filter((id): id is string => Boolean(id)),
    });
  }
  admin = undefined;
  colaborador = undefined;
  contaLiberada = undefined;
  contaBloqueada = undefined;
  lancamentoId = undefined;
});

test("Colaborador entra por Contas a Pagar e só vê Pagar e Receber no menu", async ({ page }) => {
  await expect(page).toHaveURL(/\/pagar/);
  await expect(page.getByTestId("nav-pagar")).toBeVisible();
  await expect(page.getByTestId("nav-receber")).toBeVisible();
  for (const id of [
    "nav-dashboard",
    "nav-lancamentos",
    "nav-conciliacao",
    "nav-cofre-local",
    "nav-crm",
    "nav-cadastros",
    "nav-configuracoes",
    "nav-recorrencias",
  ]) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
});

test("Colaborador não acessa outras telas nem pela URL", async ({ page }) => {
  for (const path of ["/lancamentos", "/crm", "/cofre-local"]) {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page).toHaveURL(/\/pagar/);
  }
});

test("Filtro de bancos do Colaborador mostra só os bancos liberados e nenhum saldo", async ({ page }) => {
  const accountCard = page.getByTestId("account-card");
  await expect(accountCard).toHaveCount(1);
  await expect(accountCard).toContainText(nomeContaLiberada);
  await expect(page.getByTestId("account-card-saldo")).toHaveCount(0);
  await expect(page.getByText(/Saldo:|Operacional|Confirmado|Real \(Master\)/)).toHaveCount(0);
});

test("Colaborador não vê AVR nem BPI e baixa sem ver saldo", async ({ page }) => {
  const row = page.getByRole("row").filter({ hasText: "123,45" }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  // A baixa integral/parcial continua liberada para o Colaborador.
  await expect(row.getByRole("button", { name: /dar baixa/i })).toBeVisible();

  // AVR e demais ações de gestão não existem no menu de ações do Colaborador.
  await row.getByTestId("lancamento-action-menu").click();
  await expect(page.getByTestId("portal-dropdown")).toBeVisible();
  await expect(page.getByTestId("action-avr")).toHaveCount(0);
  await expect(page.getByTestId("action-estornar")).toHaveCount(0);
  await expect(page.getByTestId("action-excluir")).toHaveCount(0);
  await page.mouse.click(2, 2);
  await expect(page.getByTestId("portal-dropdown")).toBeHidden();

  await row.getByRole("button", { name: /dar baixa/i }).click();
  const modal = page.getByRole("heading", { name: "Operações de Baixa de Título" });
  await expect(modal).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^BPI/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Quitar" })).toBeVisible();
  await expect(page.getByRole("option", { name: /Saldo:/ })).toHaveCount(0);
});
