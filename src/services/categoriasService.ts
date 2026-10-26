import { supabase } from '@/integrations/supabase/client';
import { CategoriaFinanceira } from '../types';

export const categoriasService = {
  getAll: async (): Promise<CategoriaFinanceira[]> => {
    const { data, error } = await supabase
      .from('categorias_financeiras')
      .select('*')
      .order('nome', { ascending: true });
    
    if (error) throw error;
    return data as CategoriaFinanceira[];
  },

  create: async (item: Omit<CategoriaFinanceira, 'id'>): Promise<CategoriaFinanceira> => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('categorias_financeiras')
      .insert([{ ...item, user_id: user?.id }])
      .select()
      .single();
    
    if (error) throw error;
    return data as CategoriaFinanceira;
  },

  delete: async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('categorias_financeiras')
      .update({ status: 'excluido' })
      .eq('id', id);
    
    if (error) throw error;
    return true;
  },

  update: async (id: string, data: Partial<CategoriaFinanceira>): Promise<CategoriaFinanceira> => {
    const { data: updatedData, error } = await supabase
      .from('categorias_financeiras')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return updatedData as CategoriaFinanceira;
  }
};
