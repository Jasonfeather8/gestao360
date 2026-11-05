import { supabase } from '@/integrations/supabase/client';
import type { ContaBancaria, LancamentoFinanceiro } from '../types';
import { lancamentosService } from './lancamentosService';

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
};
