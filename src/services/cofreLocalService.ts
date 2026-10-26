import { supabase } from '@/integrations/supabase/client';
import type { ContaBancaria, LancamentoFinanceiro } from '../types';
import { lancamentosService } from './lancamentosService';

export interface TransacaoBancoCofre {
  id: string;
  conta_bancaria_id: string;
  data_transacao: string;
  valor: number;
  tipo_movimento: string;
  descricao_banco: string | null;
  status_conciliacao: boolean;
  pagina_origem: number | null;
  linha_origem: number | null;
  arquivo_nome: string | null;
}

export const cofreLocalService = {
  getConta: async (): Promise<ContaBancaria | null> => {
    const { data, error } = await supabase
      .from('contas_bancarias')
      .select('*')
      .eq('is_cofre_local', true)
      .neq('status', 'excluido')
      .maybeSingle();
    if (error) throw error;
    return data as ContaBancaria | null;
  },

  getLancamentos: async (
    contaId: string,
    startDate: string,
    endDate: string,
    signal?: AbortSignal,
  ): Promise<{ data: LancamentoFinanceiro[]; count: number }> =>
    lancamentosService.getAll({
      contaId,
      startDate,
      endDate,
      isFinanceiroView: true,
      page: 1,
      pageSize: 1000,
    }, signal),

  getTransacoesBanco: async (
    contaId: string,
    startDate: string,
    endDate: string,
    signal?: AbortSignal,
  ): Promise<TransacaoBancoCofre[]> => {
    let query = supabase
      .from('transacoes_banco')
      .select('id, conta_bancaria_id, data_transacao, valor, tipo_movimento, descricao_banco, status_conciliacao, pagina_origem, linha_origem, arquivo_nome')
      .eq('conta_bancaria_id', contaId)
      .gte('data_transacao', startDate)
      .lte('data_transacao', endDate)
      .order('data_transacao', { ascending: false });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as TransacaoBancoCofre[];
  },
};
