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

test("Master aprova um título clicando no selo Pend. Gestor na tela Financeiro", async ({ page }) => {
  await openPayables(page);
  const marcador = uniqueMarker("APROVACAO PELO SELO FINANCEIRO");
  await createPayable(page, { amountDigits: "555500", observacoes: marcador });

  const payableRow = rowWithAmount(page, "5.555,00").first();
  await expect(payableRow).toBeVisible({ timeout: 30_000 });
  await payPartially(page, payableRow, "123400", "Pagamento parcial acertado com o fornecedor.");

  await page.goto("/lancamentos");
  await searchField(page).fill(marcador);
  const linha = rowWithAmount(page, "5.555,00").first();
  await expect(linha).toBeVisible({ timeout: 30_000 });
  const seloPendGestor = linha.getByText("Pend. Gestor", { exact: true });
  await expect(seloPendGestor).toBeVisible();

  await seloPendGestor.click();
  await expect(page.getByRole("heading", { name: "Aprovar Título" })).toBeVisible();
  await page.getByRole("button", { name: "Confirmar Aprovação" }).click();
  await expect(linha.getByText("Pend. Gestor", { exact: true })).toHaveCount(0, { timeout: 30_000 });
});
