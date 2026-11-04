import type { UserPerfil } from '../types';

/**
 * Matriz de acesso por perfil usada pela navegação (menu lateral) e pelas rotas.
 * A delimitação é feita na UI: o que o perfil não pode acessar não é renderizado
 * e também não fica disponível digitando a URL.
 */
export const ROTAS_POR_PERFIL: Record<string, UserPerfil[]> = {
  '/dashboard': ['master'],
  '/pagar': ['master', 'gerente', 'colaborador'],
  '/receber': ['master', 'gerente', 'colaborador'],
  '/lancamentos': ['master', 'gerente'],
  '/conciliacao': ['master', 'gerente'],
  '/cofre-local': ['master', 'gerente'],
  '/recorrencias': ['master', 'gerente'],
  '/crm': ['master', 'gerente'],
  '/cadastros': ['master', 'gerente'],
  '/configuracoes': ['master'],
};

export const SEM_CONTA_LIBERADA = '00000000-0000-0000-0000-000000000000';

export function perfisDaRota(path: string): UserPerfil[] {
  return ROTAS_POR_PERFIL[path] ?? [];
}

export function rotaInicial(perfil: UserPerfil): string {
  if (perfil === 'master') return '/dashboard';
  if (perfil === 'gerente') return '/conciliacao';
  return '/pagar';
}

/**
 * Contas bancárias que o perfil pode acessar. O Master nunca é limitado.
 * O Gerente começa com todas as contas e o Colaborador apenas com as liberadas
 * pelo Master (falha fechada); em ambos, as contas bloqueadas ficam de fora.
 */
export function filtrarContasDoPerfil<T extends { id: string }>(
  contas: T[],
  perfil: UserPerfil,
  contasLiberadas: string[] | null,
  contasBloqueadas: string[] | null,
): T[] {
  if (perfil === 'master') return contas;
  const permitidas = perfil === 'colaborador'
    ? contas.filter(conta => (contasLiberadas ?? []).includes(conta.id))
    : contas;
  if (!contasBloqueadas?.length) return permitidas;
  return permitidas.filter(conta => !contasBloqueadas.includes(conta.id));
}

/** Estado de acesso efetivo de um usuário para uma conta bancária. */
export function usuarioTemAcessoAConta(
  perfil: UserPerfil,
  contaId: string,
  contasLiberadas: string[] | null,
  contasBloqueadas: string[] | null,
): boolean {
  if (perfil === 'master') return true;
  if ((contasBloqueadas ?? []).includes(contaId)) return false;
  if (perfil === 'colaborador') return (contasLiberadas ?? []).includes(contaId);
  return true;
}

/** Estado inicial do switch para uma conta nova: o Gerente já entra com acesso
 * e o Colaborador só depois que o Master liberar. */
export const acessoPadraoDoPerfil = (perfil: UserPerfil) => perfil !== 'colaborador';

/**
 * IDs de conta usados para filtrar a consulta de lançamentos. Lista vazia = sem
 * filtro. O Master nunca é filtrado; o Colaborador é sempre filtrado (falha
 * fechada) e o Gerente só quando tem alguma conta bloqueada — assim a consulta
 * dele segue idêntica enquanto nenhum banco for desativado.
 */
export function idsContasDoPerfil(
  perfil: UserPerfil,
  contasLiberadas: string[] | null,
  contasBloqueadas: string[] | null,
  idsPermitidas: string[],
): string[] {
  if (perfil === 'master') return [];
  if (perfil !== 'colaborador' && !(contasBloqueadas ?? []).length) return [];
  if (perfil === 'colaborador' && !(contasLiberadas ?? []).length) return [SEM_CONTA_LIBERADA];
  return idsPermitidas.length ? idsPermitidas : [SEM_CONTA_LIBERADA];
}

export const podeVerSaldos = (perfil: UserPerfil) => perfil !== 'colaborador';
export const podeUsarAVR = (perfil: UserPerfil) => perfil !== 'colaborador';
export const podeUsarBPI = (perfil: UserPerfil) => perfil !== 'colaborador';
