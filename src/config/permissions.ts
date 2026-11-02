import type { UserPerfil } from '../types';

/**
 * Matriz de acesso por perfil usada pela navegação (menu lateral) e pelas rotas.
 * A delimitação é feita na UI: o que o perfil não pode acessar não é renderizado
 * e também não fica disponível digitando a URL.
 */
export const ROTAS_POR_PERFIL: Record<string, UserPerfil[]> = {
  '/dashboard': ['master', 'colaborador'],
  '/pagar': ['master', 'gerente', 'colaborador'],
  '/receber': ['master', 'gerente', 'colaborador'],
  '/lancamentos': ['master', 'gerente', 'colaborador'],
  '/conciliacao': ['master', 'gerente'],
  '/cofre-local': ['master', 'gerente', 'colaborador'],
  '/recorrencias': ['master', 'gerente'],
  '/crm': ['master', 'gerente', 'colaborador'],
  '/cadastros': ['master', 'gerente'],
  '/configuracoes': ['master'],
};

/** Perfis autorizados a acessar uma rota. */
export function perfisDaRota(path: string): UserPerfil[] {
  return ROTAS_POR_PERFIL[path] ?? [];
}

/**
 * Primeira tela liberada para o perfil, usada como destino padrão no login e ao
 * cair em uma rota sem acesso. O Gerente não tem Painel Geral, então entra
 * direto pela Conciliação Bancária.
 */
export function rotaInicial(perfil: UserPerfil): string {
  if (perfil === 'gerente') return '/conciliacao';
  return '/dashboard';
}
