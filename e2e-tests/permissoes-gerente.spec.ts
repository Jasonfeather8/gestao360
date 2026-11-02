import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupGerenteTestUser,
  createGerenteAdminClient,
  createGerenteTestUser,
  signInAsGerente,
  type GerenteTestUser,
} from "./fixtures/gerente-user";

test.setTimeout(150_000);

let admin: SupabaseClient | undefined;
let gerente: GerenteTestUser | undefined;

test.beforeEach(async ({ page }) => {
  admin = createGerenteAdminClient();
  gerente = await createGerenteTestUser(admin);
  await signInAsGerente(page, gerente);
});

test.afterEach(async () => {
  if (admin && gerente) await cleanupGerenteTestUser(admin, gerente.id);
  admin = undefined;
  gerente = undefined;
});

test("Gerente entra pela Conciliação e não vê Painel Geral nem Configurações", async ({ page }) => {
  await expect(page).toHaveURL(/\/conciliacao/);
  await expect(page.getByRole("heading", { name: /Conciliação Bancária/i })).toBeVisible({ timeout: 30_000 });

  for (const id of ["nav-pagar", "nav-receber", "nav-lancamentos", "nav-conciliacao", "nav-cadastros", "nav-crm", "nav-cofre-local"]) {
    await expect(page.getByTestId(id), `Menu liberado ausente para o Gerente: ${id}`).toBeVisible();
  }

  // Bloqueados: o item não existe na tela para o Gerente.
  await expect(page.getByTestId("nav-dashboard")).toHaveCount(0);
  await expect(page.getByTestId("nav-configuracoes")).toHaveCount(0);
});

test("Gerente não acessa o Painel Geral nem digitando a URL", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page).toHaveURL(/\/conciliacao/);
});

test("Gerente usa a Conciliação Bancária e a aba Transferências, sem aprovar nem estornar", async ({ page }) => {
  const abaTransferencias = page.getByRole("button", { name: "Transferências", exact: true });
  await expect(abaTransferencias).toBeVisible({ timeout: 30_000 });

  await abaTransferencias.click();
  await expect(page.getByRole("heading", { name: "Nova transferência" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Registrar transferência/i })).toBeVisible();

  // Aprovar e Estornar de transferência continuam exclusivos do Master.
  await expect(page.getByRole("button", { name: "Estornar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reprovar", exact: true })).toHaveCount(0);
});

test("Gerente administra Centros de Custo, Categorias e Motivos, mas não vê Contas Bancárias", async ({ page }) => {
  await page.goto("/cadastros", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /Configurações de Estrutura/i })).toBeVisible({ timeout: 30_000 });

  await expect(page.getByRole("button", { name: "Contas Bancárias", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Centros de Custo", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Categorias", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Motivos de Ajuste", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Motivos de Ajuste", exact: true }).click();
  await page.getByRole("button", { name: /Novo Registro/i }).click();
  await expect(page.getByRole("heading", { name: "Novo Motivo de Ajuste" })).toBeVisible();
});

test("Gerente não acessa Configurações nem digitando a URL", async ({ page }) => {
  await page.goto("/configuracoes", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page).toHaveURL(/\/conciliacao/);
});
