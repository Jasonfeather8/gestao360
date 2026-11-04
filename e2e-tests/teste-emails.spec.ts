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
  cleanupGerenteTestUser,
  createGerenteTestUser,
  signInAsGerente,
  type GerenteTestUser,
} from "./fixtures/gerente-user";

test.setTimeout(180_000);

let admin: SupabaseClient | undefined;
let master: MasterTestUser | undefined;
let gerente: GerenteTestUser | undefined;

test.beforeEach(async ({}, testInfo) => {
  admin = createMasterAdminClient();
  if (testInfo.title.startsWith("Master")) {
    master = await createMasterTestUser(admin);
  } else {
    gerente = await createGerenteTestUser(admin);
  }
});

test.afterEach(async () => {
  if (admin && gerente) await cleanupGerenteTestUser(admin, gerente.id);
  if (admin && master) await cleanupMasterTestUser(admin, master.id);
  admin = undefined;
  gerente = undefined;
  master = undefined;
});

test("Master acessa o teste de emails e recebe validação antes de qualquer envio", async ({ page }) => {
  if (!master) throw new Error("O usuário Master de teste não foi preparado.");
  await signInAsMaster(page, master);

  await page.getByRole("button", { name: "Teste de emails" }).click();
  await expect(page).toHaveURL(/\/teste-emails$/);
  await expect(page.getByTestId("email-to")).toBeVisible();
  await expect(page.getByTestId("email-subject")).toBeVisible();
  await expect(page.getByTestId("email-html")).toBeVisible();
  await expect(page.getByTestId("enviar-email-teste")).toBeVisible();

  let emailRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/functions/v1/enviar-email-teste")) emailRequests += 1;
  });

  await page.getByTestId("enviar-email-teste").click();
  const result = page.getByTestId("email-resultado");
  await expect(result).toBeVisible();
  await expect(result).toContainText("Preencha o destinatário, o assunto e o conteúdo do email.");
  expect(emailRequests).toBe(0);
});

test("Gerente não vê o menu de teste de emails e é redirecionado da rota protegida", async ({ page }) => {
  if (!gerente) throw new Error("O usuário Gerente de teste não foi preparado.");
  await signInAsGerente(page, gerente);

  await expect(page.getByRole("button", { name: "Teste de emails" })).toHaveCount(0);
  await page.goto("/teste-emails", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page).toHaveURL(/\/conciliacao$/);
  await expect(page.getByTestId("email-to")).toHaveCount(0);
});
