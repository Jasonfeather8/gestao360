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
  futureDate,
  openExtrato,
  openPayables,
  payInFull,
  rowWithAmount,
  searchField,
  shownCounter,
  uniqueMarker,
} from "./fixtures/contas-a-pagar";

test.setTimeout(180_000);

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

test("Extrato filtra por período e por status de pagamento", async ({ page }) => {
  await openPayables(page);
  const marker = uniqueMarker("extrato");
  await createPayable(page, { amountDigits: "97979", dueDate: futureDate(3), observacoes: marker });

  const row = rowWithAmount(page, "979,79").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  // Com a baixa registrada o título sai de Contas a Pagar e passa a aparecer no Extrato.
  await payInFull(page, row);

  await openExtrato(page);
  await searchField(page).fill(marker);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(shownCounter(page)).toHaveText("Exibindo 1 de 1 registros", { timeout: 30_000 });

  // No Extrato o período é comparado com a data de pagamento (hoje).
  await page.getByTestId("date-preset").selectOption("custom");
  await expect(row).toBeVisible({ timeout: 30_000 });

  // Janela começando amanhã deixa o título pago hoje de fora...
  await page.getByTestId("date-start").fill(futureDate(1));
  await expect(row).toHaveCount(0, { timeout: 30_000 });

  // ...e a janela que volta a incluir hoje o traz de volta.
  await page.getByTestId("date-start").fill(futureDate(-30));
  await expect(row).toBeVisible({ timeout: 30_000 });

  // Filtro de status do Extrato: BPI não inclui um título liquidado normalmente.
  const filtroBpi = page.getByRole("button", { name: "BPI (Inatividade)", exact: true });
  await filtroBpi.click();
  await expect(row).toHaveCount(0, { timeout: 30_000 });

  await filtroBpi.click();
  await expect(row).toBeVisible({ timeout: 30_000 });
});
