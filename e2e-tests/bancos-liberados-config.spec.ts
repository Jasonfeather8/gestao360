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
  cleanupColaboradorTestUser,
  createColaboradorTestUser,
  createContaBancaria,
  type ColaboradorTestUser,
} from "./fixtures/colaborador-user";

test.setTimeout(150_000);

let admin: SupabaseClient | undefined;
let master: MasterTestUser | undefined;
let colaborador: ColaboradorTestUser | undefined;
let contaId: string | undefined;

test.beforeEach(async ({ page }) => {
  admin = createMasterAdminClient();
  master = await createMasterTestUser(admin);
  contaId = await createContaBancaria(admin, `Banco de teste ${Date.now()}`);
  colaborador = await createColaboradorTestUser(admin, []);
  await signInAsMaster(page, master);
});

test.afterEach(async () => {
  if (admin && colaborador) {
    await cleanupColaboradorTestUser(admin, {
      userId: colaborador.id,
      lancamentoIds: [],
      contaIds: contaId ? [contaId] : [],
    });
  }
  if (admin && master) await cleanupMasterTestUser(admin, master.id);
  admin = undefined;
  master = undefined;
  colaborador = undefined;
  contaId = undefined;
});

test("Master libera bancos para um Colaborador na aba Equipe", async ({ page }) => {
  if (!colaborador || !contaId || !admin) throw new Error("Os dados de teste não foram preparados.");

  await page.goto("/configuracoes", { waitUntil: "domcontentloaded", timeout: 60_000 });
  const abrirPermissoes = page.getByTestId(`liberar-bancos-${colaborador.id}`);
  await expect(abrirPermissoes).toBeVisible({ timeout: 30_000 });
  await abrirPermissoes.click();

  const modal = page.getByTestId("modal-bancos-liberados");
  await expect(modal.getByRole("heading", { name: "Bancos liberados" })).toBeVisible();
  await modal.getByTestId(`banco-${contaId}`).check();
  await modal.getByRole("button", { name: "Salvar" }).click();
  await expect(modal).toHaveCount(0);

  const { data, error } = await admin
    .from("profiles")
    .select("contas_liberadas")
    .eq("id", colaborador.id)
    .single();
  if (error) throw error;
  expect(data.contas_liberadas).toContain(contaId);
});
