import type { ContaBancaria } from '../types';

type ContaComLimiteNegativo = Pick<ContaBancaria, 'permite_saldo_negativo' | 'limite_saldo_negativo'>;

// Quanto a conta pode ficar negativa: 0 quando não permite saldo negativo e
// Infinity quando permite sem limite cadastrado.
export const limiteSaldoNegativo = (conta?: ContaComLimiteNegativo | null): number => {
  if (!conta?.permite_saldo_negativo) return 0;
  const limite = Number(conta.limite_saldo_negativo);
  return Number.isFinite(limite) && limite > 0 ? limite : Infinity;
};

// true quando o valor ultrapassa o saldo disponível somado ao limite da conta.
export const excedeSaldoDaConta = (
  conta: ContaComLimiteNegativo | null | undefined,
  saldoDisponivel: number,
  valor: number
): boolean => valor > saldoDisponivel + limiteSaldoNegativo(conta) + 0.005;

// Trecho de mensagem com o limite da conta, quando houver.
export const descricaoLimiteSaldoNegativo = (conta?: ContaComLimiteNegativo | null): string => {
  const limite = limiteSaldoNegativo(conta);
  if (limite === Infinity) return ' Conta sem limite de saldo negativo.';
  if (limite <= 0) return '';
  return ` Limite de saldo negativo: R$ ${limite.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
};
