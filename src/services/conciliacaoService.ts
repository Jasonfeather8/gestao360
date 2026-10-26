import { supabase } from '@/integrations/supabase/client';

export const conciliacaoService = {
  conciliar: async ({ transacaoBancoId, lancamentoIds }: { transacaoBancoId: string; lancamentoIds: string[] }) => {
    const { data, error } = await supabase.rpc('conciliar_transacao_atomica', {
      p_transacao_id: transacaoBancoId,
      p_lancamento_ids: lancamentoIds,
      p_tipo_diferenca: null,
      p_justificativa: null,
    });
    if (error) throw error;
    return data;
  },

  listarLancamentosConciliados: async (lancamentoIds: string[]): Promise<Set<string>> => {
    if (lancamentoIds.length === 0) return new Set();
    const { data, error } = await supabase
      .from('conciliacoes')
      .select('lancamento_id')
      .in('lancamento_id', lancamentoIds);
    if (error) throw error;
    return new Set((data || []).map((row) => row.lancamento_id));
  },

  listarStatusConciliacao: async (transacaoIds: string[]): Promise<Record<string, boolean>> => {
    if (transacaoIds.length === 0) return {};
    const { data, error } = await supabase
      .from('transacoes_banco')
      .select('id, status_conciliacao')
      .in('id', transacaoIds);
    if (error) throw error;
    return Object.fromEntries((data || []).map((row) => [row.id, row.status_conciliacao === true]));
  },
};
