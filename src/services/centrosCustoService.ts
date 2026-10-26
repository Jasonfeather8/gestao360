import { supabase } from '@/integrations/supabase/client';
import { CentroCusto } from '../types';

export const centrosCustoService = {
  getAll: async (): Promise<CentroCusto[]> => {
    const { data, error } = await supabase
      .from('centros_custo')
      .select('*')
      .order('nome', { ascending: true });
    
    if (error) throw error;
    return data as CentroCusto[];
  },

  create: async (item: Omit<CentroCusto, 'id'>): Promise<CentroCusto> => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('centros_custo')
      .insert([{ ...item, user_id: user?.id }])
      .select()
      .single();
    
    if (error) throw error;
    return data as CentroCusto;
  },

  update: async (id: string, item: Partial<Omit<CentroCusto, 'id'>>): Promise<CentroCusto> => {
    const { data, error } = await supabase
      .from('centros_custo')
      .update(item)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data as CentroCusto;
  },

  delete: async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('centros_custo')
      .update({ status: 'excluido' })
      .eq('id', id);
    
    if (error) throw error;
    return true;
  }
};
