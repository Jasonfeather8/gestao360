import { test, expect, type Page } from "@playwright/test";
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
  createLancamentoAberto,
  type ColaboradorTestUser,
} from "./fixtures/colaborador-user";
import {
  cleanupGerenteTestUser,
  createGerenteTestUser,
  signInAsGerente,
  type GerenteTestUser,
} from "./fixtures/gerente-user";

test.setTimeout(180_000);

let admin: SupabaseClient | undefined;
let master: MasterTestUser | undefined;
let colaborador: ColaboradorTestUser | undefined;
let gerente: GerenteTestUser | undefined;
let nomeContaPrincipal = "";
let contaIds: string[] = [];
let lancamentoIds: string[] = [];

test.beforeEach(async () => {
  admin = createMasterAdminClient();
  nomeContaPrincipal = `Banco de teste ${Date.now()}`;
  contaIds = [await createContaBancaria(admin, nomeContaPrincipal)];
  lancamentoIds = [];
});

test.afterEach(async () => {
  if (admin && colaborador) {
    await cleanupColaboradorTestUser(admin, {
      userId: colaborador.id,
      lancamentoIds,
      contaIds,
    });
  }
  if (admin && gerente) await cleanupGerenteTestUser(admin, gerente.id);
  if (admin && master) await cleanupMasterTestUser(admin, master.id);
  admin = undefined;
  master = undefined;
  colaborador = undefined;
  gerente = undefined;
  nomeContaPrincipal = "";
  contaIds = [];
  lancamentoIds = [];
});

/** Abre o modal de edição da conta bancária no Cadastros, já com a seção de acessos. */
async function abrirContaNoCadastros(page: Page, contaId: string, nomeConta: string) {
  await page.goto("/cadastros", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByPlaceholder("Pesquisar...").fill(nomeConta);
  const editar = page.getByTestId(`editar-conta-${contaId}`);
  await expect(editar).toBeVisible({ timeout: 30_000 });
  await editar.click();
  await expect(page.getByTestId("acessos-conta")).toBeVisible();
}

async function lerPerfil(campo: "contas_liberadas" | "contas_bloqueadas", userId: string) {
  if (!admin) throw new Error("O cliente administrativo de teste não foi preparado.");
  const { data, error } = await admin.from("profiles").select(campo).eq("id", userId).single();
  if (error) throw error;
  return (data as Record<string, string[] | null>)[campo] ?? [];
}

test("Master libera um banco para o Colaborador no modal da conta", async ({ page }) => {
  if (!admin) throw new Error("O cliente administrativo de teste não foi preparado.");
  const contaId = contaIds[0];

  master = await createMasterTestUser(admin);
  colaborador = await createColaboradorTestUser(admin, []);

  await signInAsMaster(page, master);
  await abrirContaNoCadastros(page, contaId, nomeContaPrincipal);

  const switchColaborador = page.getByTestId(`acesso-conta-${colaborador.id}`);
  await expect(switchColaborador).toHaveAttribute("aria-checked", "false");
  await switchColaborador.click();
  await expect(switchColaborador).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("acessos-conta")).toHaveCount(0);

  expect(await lerPerfil("contas_liberadas", colaborador.id)).toContain(contaId);
});

test("Master desativa um Gerente de uma conta bancária no modal da conta", async ({ page }) => {
  if (!admin) throw new Error("O cliente administrativo de teste não foi preparado.");
  const contaId = contaIds[0];

  master = await createMasterTestUser(admin);
  gerente = await createGerenteTestUser(admin);

  await signInAsMaster(page, master);
  await abrirContaNoCadastros(page, contaId, nomeContaPrincipal);

  const switchGerente = page.getByTestId(`acesso-conta-${gerente.id}`);
  // O Gerente entra com acesso a todas as contas; o switch começa ligado.
  await expect(switchGerente).toHaveAttribute("aria-checked", "true");
  await switchGerente.click();
  await expect(switchGerente).toHaveAttribute("aria-checked", "false");

  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("acessos-conta")).toHaveCount(0);

  expect(await lerPerfil("contas_bloqueadas", gerente.id)).toContain(contaId);
});

test("Gerente desativado de uma conta não vê a conta nem os lançamentos dela", async ({ page }) => {
  if (!admin) throw new Error("O cliente administrativo de teste não foi preparado.");
  gerente = await createGerenteTestUser(admin);

  const contaBloqueada = contaIds[0];
  const nomeContaVisivel = `Banco visivel ${Date.now()}`;
  const contaVisivel = await createContaBancaria(admin, nomeContaVisivel);
  contaIds.push(contaVisivel);

  lancamentoIds.push(
    await createLancamentoAberto(admin, { contaId: contaBloqueada, userId: gerente.id, valor: 222.22 }),
  );
  lancamentoIds.push(
    await createLancamentoAberto(admin, { contaId: contaVisivel, userId: gerente.id, valor: 111.11 }),
  );

  const { error } = await admin
    .from("profiles")
    .update({ contas_bloqueadas: [contaBloqueada] })
    .eq("id", gerente.id);
  if (error) throw error;

  await signInAsGerente(page, gerente);

  // Conciliação bancária: a conta desativada não aparece no seletor de contas.
  await page.goto("/conciliacao", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("option").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("option").filter({ hasText: nomeContaPrincipal })).toHaveCount(0);
  await expect(page.getByRole("option").filter({ hasText: nomeContaVisivel }).first()).toBeVisible();

  // Financeiro: sem card da conta desativada e sem os lançamentos dela.
  await page.goto("/pagar", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByTestId("account-card").filter({ hasText: nomeContaVisivel }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("account-card").filter({ hasText: nomeContaPrincipal })).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: "111,11" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("row").filter({ hasText: "222,22" })).toHaveCount(0);
});
