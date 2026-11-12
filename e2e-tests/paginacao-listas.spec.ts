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
  openPayables,
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

test("Paginação avança e volta entre as páginas da lista", async ({ page }) => {
  await openPayables(page);

  // Um único lançamento "A Prazo" com 51 parcelas gera 51 títulos: duas páginas de 50.
  const marker = uniqueMarker("pagina");
  await createPayable(page, {
    amountDigits: "5100",
    condicao: "A Prazo",
    installments: 51,
    dueDate: futureDate(1),
    observacoes: marker,
  });

  await searchField(page).fill(marker);
  await expect(shownCounter(page)).toHaveText("Exibindo 50 de 51 registros", { timeout: 30_000 });

  const paginaUm = page.getByRole("button", { name: "1", exact: true });
  const paginaDois = page.getByRole("button", { name: "2", exact: true });
  await expect(paginaUm).toHaveClass(/bg-neutral-900/, { timeout: 15_000 });
  await expect(paginaDois).toBeVisible({ timeout: 15_000 });

  // Clicar na página 2 precisa manter a página 2 marcada e mostrar o registro que sobra.
  await paginaDois.click();
  await expect(paginaDois).toHaveClass(/bg-neutral-900/, { timeout: 30_000 });
  await expect(shownCounter(page)).toHaveText("Exibindo 1 de 51 registros", { timeout: 30_000 });

  // "Anterior" volta para a página 1 e a marcação acompanha.
  await page.getByRole("button", { name: "Anterior" }).click();
  await expect(paginaUm).toHaveClass(/bg-neutral-900/, { timeout: 30_000 });
  await expect(shownCounter(page)).toHaveText("Exibindo 50 de 51 registros", { timeout: 30_000 });

  // "Próximo" leva de novo para a página 2.
  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(paginaDois).toHaveClass(/bg-neutral-900/, { timeout: 30_000 });
  await expect(shownCounter(page)).toHaveText("Exibindo 1 de 51 registros", { timeout: 30_000 });
});
