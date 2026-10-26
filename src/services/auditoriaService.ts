import { supabase } from '@/integrations/supabase/client';
import { AuditoriaLog } from '../types';

export const auditoriaService = {
  getAll: async (): Promise<any[]> => {
    const { data, error } = await supabase
      .from('auditoria_logs')
      .select('*, profiles(nome, email)')
      .order('data_hora', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data;
  },

  getByRegistroIds: async (registroIds: string[]): Promise<any[]> => {
    const ids = Array.from(new Set(registroIds.filter(Boolean)));
    if (ids.length === 0) return [];

    const { data, error } = await supabase
      .from('auditoria_logs')
      .select('*, profiles(nome, email)')
      .eq('tabela_afetada', 'lancamentos_financeiros')
      .in('registro_id', ids)
      .order('data_hora', { ascending: false });

    if (error) throw error;
    return data || [];
  }
};
