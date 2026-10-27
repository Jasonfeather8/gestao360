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
  createReceivable,
  emptyListMessage,
  openPayables,
  openReceivables,
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

test("Master cadastra uma receita e ela aparece em Contas a Receber", async ({ page }) => {
  await openReceivables(page);
  const marcador = uniqueMarker("RECEBER");
  const { entityName } = await createReceivable(page, { amountDigits: "141400", observacoes: marcador });

  const row = rowWithAmount(page, "1.414,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByText(entityName).first()).toBeVisible();
  // Título a receber em aberto: a tela oferece o recebimento.
  await expect(row.getByRole("button", { name: /dar baixa/i })).toBeVisible();

  // O marcador das observações também localiza o título na busca desta tela.
  await searchField(page).fill(marcador);
  await expect(rowWithAmount(page, "1.414,00").first()).toBeVisible({ timeout: 30_000 });
});

test("Receita cadastrada não aparece em Contas a Pagar", async ({ page }) => {
  await openReceivables(page);
  const marcador = uniqueMarker("SOENTRADA");
  await createReceivable(page, { amountDigits: "151500", observacoes: marcador });

  const row = rowWithAmount(page, "1.515,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  // Em Contas a Pagar a mesma busca não encontra nada: as telas não se misturam.
  await openPayables(page);
  await searchField(page).fill(marcador);
  await expect(emptyListMessage(page)).toBeVisible({ timeout: 30_000 });
});
