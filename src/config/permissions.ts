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

/** Contas bancárias que o perfil pode ver. Master e Gerente veem todas; o
 * Colaborador vê apenas as liberadas pelo Master (falha fechada sem liberação). */
export function filtrarContasDoPerfil<T extends { id: string }>(
  contas: T[],
  perfil: UserPerfil,
  contasLiberadas: string[] | null,
): T[] {
  if (perfil !== 'colaborador') return contas;
  if (!contasLiberadas?.length) return [];
  return contas.filter(conta => contasLiberadas.includes(conta.id));
}

/** IDs de conta usados para filtrar consultas. Lista vazia = sem filtro (Master/Gerente);
 * o Colaborador sem bancos liberados não vê título nenhum. */
export function idsContasDoPerfil(perfil: UserPerfil, contasLiberadas: string[] | null): string[] {
  if (perfil !== 'colaborador') return [];
  return contasLiberadas?.length ? contasLiberadas : [SEM_CONTA_LIBERADA];
}

export const podeVerSaldos = (perfil: UserPerfil) => perfil !== 'colaborador';
export const podeUsarAVR = (perfil: UserPerfil) => perfil !== 'colaborador';
export const podeUsarBPI = (perfil: UserPerfil) => perfil !== 'colaborador';
