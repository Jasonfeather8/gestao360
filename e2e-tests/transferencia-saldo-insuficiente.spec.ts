import { test, expect } from "@playwright/test";
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

test("Master não registra transferência acima do saldo da conta de origem", async ({ page }) => {
  await page.goto("/conciliacao?aba=transferencias", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Transferências", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Nova transferência" })).toBeVisible({ timeout: 30_000 });

  const origem = page.locator("#transferencia-origem");
  const destino = page.locator("#transferencia-destino");
  await expect(origem.locator("option").nth(2)).toBeAttached({ timeout: 30_000 });
  await expect(destino.locator("option").nth(2)).toBeAttached({ timeout: 30_000 });

  const contaIds = await origem.locator("option").evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
  );
  expect(contaIds.length).toBeGreaterThanOrEqual(2);
  await origem.selectOption(contaIds[0]);
  await destino.selectOption(contaIds.find((contaId) => contaId !== contaIds[0])!);

  await page.locator("#transferencia-valor").fill("99999900");
  await expect(page.locator("#transferencia-valor")).toHaveValue("999.999,00");
  await page.getByRole("button", { name: "Registrar transferência" }).click();

  await expect(page.getByRole("alert").filter({ hasText: /Saldo insuficiente na conta selecionada/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: /Transferência registrada/ })).toHaveCount(0);
});
