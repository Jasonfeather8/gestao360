/**
 * Regras de nome dos cadastros (bancos, categorias, centros de custo, motivos de
 * ajuste e entidades): o mesmo nome não pode ser cadastrado duas vezes e nomes
 * muito parecidos (provável erro de digitação) exigem confirmação do usuário.
 *
 * A mesma normalização existe no banco (public.normalizar_nome) e sustenta os
 * índices únicos que garantem a regra mesmo fora da tela.
 */

/** Sem acento, minúsculo e com espaços colapsados — igual a public.normalizar_nome. */
export function normalizarNome(valor: string | null | undefined): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Quantas edições (inserir, remover ou trocar um caractere) separam duas strings. */
function distanciaEdicao(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let linhaAnterior = Array.from({ length: b.length + 1 }, (_, indice) => indice);
  for (let i = 1; i <= a.length; i += 1) {
    const linhaAtual = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      linhaAtual[j] = Math.min(linhaAnterior[j] + 1, linhaAtual[j - 1] + 1, linhaAnterior[j - 1] + custo);
    }
    linhaAnterior = linhaAtual;
  }
  return linhaAnterior[b.length];
}

/** Similaridade de 0 a 1 entre dois nomes, ignorando acento, caixa e espaços. */
export function similaridadeNomes(a: string, b: string): number {
  const esquerda = normalizarNome(a);
  const direita = normalizarNome(b);
  const maior = Math.max(esquerda.length, direita.length);
  if (maior === 0) return 1;
  return 1 - distanciaEdicao(esquerda, direita) / maior;
}

/** A partir deste grau de semelhança o nome é tratado como provável erro de digitação. */
export const LIMITE_SEMELHANCA = 0.8;

export interface ItemNomeavel {
  id: string;
  status?: string | null;
}

export interface ConflitoNome {
  tipo: 'duplicado' | 'semelhante';
  id: string;
  nome: string;
}

/** Registros excluídos/inativados não bloqueiam um novo cadastro com o mesmo nome. */
const estaInativo = (item: ItemNomeavel) => item.status === 'excluido' || item.status === 'inativo';

/**
 * Procura um cadastro existente com o mesmo nome (duplicado) ou muito parecido
 * (semelhante). `nomeDe` extrai o nome do registro, pois cada cadastro usa um
 * campo diferente (`nome`, `nome_banco`, `nome_razao_social`...).
 */
export function encontrarConflitoNome<T extends ItemNomeavel>(
  nome: string,
  existentes: T[],
  opcoes: { nomeDe: (item: T) => string | null | undefined; ignorarId?: string | null },
): ConflitoNome | null {
  const alvo = normalizarNome(nome);
  if (!alvo) return null;

  let semelhante: ConflitoNome | null = null;
  for (const item of existentes) {
    if (item.id === opcoes.ignorarId || estaInativo(item)) continue;
    const nomeRegistro = (opcoes.nomeDe(item) ?? '').trim();
    const chave = normalizarNome(nomeRegistro);
    if (!chave) continue;
    if (chave === alvo) return { tipo: 'duplicado', id: item.id, nome: nomeRegistro };
    if (!semelhante && similaridadeNomes(alvo, chave) >= LIMITE_SEMELHANCA) {
      semelhante = { tipo: 'semelhante', id: item.id, nome: nomeRegistro };
    }
  }
  return semelhante;
}

/**
 * Guarda usada antes de gravar: bloqueia nome igual e pede confirmação para nome
 * muito parecido. Devolve `true` quando o cadastro pode prosseguir.
 */
export function podeSalvarNome<T extends ItemNomeavel>(
  nome: string,
  existentes: T[],
  opcoes: { nomeDe: (item: T) => string | null | undefined; ignorarId?: string | null; rotulo: string },
): boolean {
  const conflito = encontrarConflitoNome(nome, existentes, opcoes);
  if (!conflito) return true;

  if (conflito.tipo === 'duplicado') {
    window.alert(`Já existe um ${opcoes.rotulo} com o nome "${conflito.nome}". Escolha outro nome.`);
    return false;
  }
  return window.confirm(
    `Já existe um ${opcoes.rotulo} com nome muito parecido: "${conflito.nome}".\n` +
      `Deseja cadastrar "${nome.trim()}" mesmo assim?`,
  );
}

/** Mensagem amigável para a violação do índice único do banco (código 23505). */
export function mensagemErroNomeDuplicado(cause: unknown): string | null {
  const codigo = (cause as { code?: unknown } | null)?.code;
  return codigo === '23505' ? 'Já existe um cadastro com esse nome. Escolha outro nome.' : null;
}
