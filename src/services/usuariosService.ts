import { supabase } from '@/integrations/supabase/client';
import { UserProfile } from '../types';

export const usuariosService = {
  getAll: async (): Promise<UserProfile[]> => {
    // Mapeamos 'role' (banco) para 'perfil' (frontend/tipos) para manter compatibilidade
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('nome', { ascending: true });
    
    if (error) throw error;

    return (data || []).map(p => ({
      id: p.id,
      nome: p.nome || '',
      email: p.email || '',
      perfil: p.role as any, // Conversão de role -> perfil
      status: p.status ?? true,
      created_at: p.updated_at // Usando updated_at como fallback de created_at se necessário
    })) as UserProfile[];
  },

  create: async (item: any): Promise<UserProfile> => {
    // A criação de auth é feita via Edge Function, mas mantemos o mapeamento aqui
    const { data, error } = await supabase
      .from('profiles')
      .insert([{
        nome: item.nome,
        email: item.email,
        role: item.perfil,
        status: item.status
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data as any;
  },

  update: async (id: string, data: any): Promise<UserProfile> => {
    // Mapear 'perfil' de volta para 'role' se estiver vindo do frontend
    const updatePayload: any = { ...data };
    if (data.perfil) {
      updatePayload.role = data.perfil;
      delete updatePayload.perfil;
    }

    const { data: updatedData, error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return updatedData as any;
  }
};
