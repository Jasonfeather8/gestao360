import { supabase } from '@/integrations/supabase/client';

export interface Recorrencia {
  id: string;
  user_id: string;
  periodicidade: 'diario' | 'semanal' | 'mensal' | 'anual';
  quantidade_total_parcelas: number;
  data_inicio: string;
  created_at: string;
}

export interface RecorrenciaWithMeta extends Recorrencia {
  entidade_nome: string;
  categoria_nome: string;
  valor_parcela: number;
  parcelas_pagas: number;
  proxima_data: string;
  total_valor: number;
}

export const recorrenciasService = {
  getAll: async (): Promise<RecorrenciaWithMeta[]> => {
    // We fetch recurrences and join with the first installment to get meta data
    const { data, error } = await supabase
      .from('recorrencias')
      .select(`
        *,
        lancamentos_financeiros (
          valor_previsto,
          entidade_id,
          categoria_id,
          status_pagamento,
          data_vencimento,
          entidades_negocio (nome_razao_social),
          categorias_financeiras (nome)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data as any[]).map(rec => {
      const lancs = rec.lancamentos_financeiros || [];
      const first = lancs[0] || {};
      const pagas = lancs.filter((l: any) => l.status_pagamento === 'pago').length;
      
      // Find next pending installment
      const today = new Date().toISOString().split('T')[0];
      const next = lancs
        .filter((l: any) => l.status_pagamento === 'aberto' && l.data_vencimento >= today)
        .sort((a: any, b: any) => a.data_vencimento.localeCompare(b.data_vencimento))[0];

      return {
        ...rec,
        entidade_nome: first.entidades_negocio?.nome_razao_social || 'Desconhecido',
        categoria_nome: first.categorias_financeiras?.nome || 'Sem Categoria',
        valor_parcela: first.valor_previsto || 0,
        parcelas_pagas: pagas,
        proxima_data: next?.data_vencimento || 'Finalizada',
        total_valor: (first.valor_previsto || 0) * rec.quantidade_total_parcelas
      };
    });
  },

  stopRecorrencia: async (recorrenciaId: string): Promise<void> => {
    const today = new Date().toISOString().split('T')[0];
    
    // Delete all future unpaid installments
    const { error: deleteError } = await supabase
      .from('lancamentos_financeiros')
      .delete()
      .eq('recorrencia_id', recorrenciaId)
      .eq('status_pagamento', 'aberto')
      .gt('data_vencimento', today);

    if (deleteError) throw deleteError;

    // Optional: Mark the recurrence as finished/stopped in the future if we add a status
    // For now, removing future rows is the "stop" action
  }
};
