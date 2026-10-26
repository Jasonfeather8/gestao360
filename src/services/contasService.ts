import { supabase } from '@/integrations/supabase/client';
import { ContaBancaria } from '../types';

export const contasService = {
  getAll: async (): Promise<ContaBancaria[]> => {
    const { data, error } = await supabase
      .from('contas_bancarias')
      .select('*')
      .order('nome', { ascending: true });
    
    if (error) throw error;
    return data as ContaBancaria[];
  },

  getById: async (id: string): Promise<ContaBancaria | undefined> => {
    const { data, error } = await supabase
      .from('contas_bancarias')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data as ContaBancaria;
  },

  create: async (item: Omit<ContaBancaria, 'id'>): Promise<ContaBancaria> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { data, error } = await supabase
      .from('contas_bancarias')
      .insert([{ ...item, user_id: user.id }])
      .select()
      .single();
    
    if (error) throw error;
    return data as ContaBancaria;
  },

  update: async (id: string, item: Partial<Omit<ContaBancaria, 'id'>>): Promise<ContaBancaria> => {
    const { data, error } = await supabase
      .from('contas_bancarias')
      .update(item)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data as ContaBancaria;
  },

  delete: async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('contas_bancarias')
      .update({ status: 'excluido' })
      .eq('id', id);
    
    if (error) throw error;
    return true;
  }
};
