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
  docCodeField,
  emptyListMessage,
  openPayables,
  payInFull,
  readDocumentCode,
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

test("Título baixado integralmente sai de Contas a Pagar e não volta por esta tela", async ({ page }) => {
  await openPayables(page);
  const marcador = uniqueMarker("INTEGRAL");
  const { bankName } = await createPayable(page, { amountDigits: "312100", observacoes: marcador });

  const row = rowWithAmount(page, "3.121,00").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const saldoAntes = await readOperationalBalance(page, bankName);
  const codigo = await readDocumentCode(row);

  await payInFull(page, row);

  // A baixa integral tira o título da lista e o valor sai do saldo operacional da conta.
  await expect(row).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(
    async () => Math.round((await readOperationalBalance(page, bankName)) * 100) / 100,
    { timeout: 30_000 },
  ).toBe(Math.round((saldoAntes - 3121) * 100) / 100);

  // Contas a Pagar só trabalha com títulos em aberto: o título liquidado não pode ser
  // localizado aqui, então o "Estornar" desta tela não alcança uma baixa integral.
  await expect(page.getByTestId("action-estornar")).toHaveCount(0);

  await searchField(page).fill(marcador);
  await expect(emptyListMessage(page)).toBeVisible({ timeout: 30_000 });

  await searchField(page).fill("");
  await docCodeField(page).fill(codigo);
  await expect(emptyListMessage(page)).toBeVisible({ timeout: 30_000 });
});
