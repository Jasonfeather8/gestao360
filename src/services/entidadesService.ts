import { supabase } from '@/integrations/supabase/client';
import { EntidadeNegocio } from '../types';

export const entidadesService = {
  getAll: async (): Promise<EntidadeNegocio[]> => {
    const { data, error } = await supabase
      .from('entidades_negocio')
      .select('*')
      .order('nome_razao_social', { ascending: true });
    
    if (error) throw error;
    return data as EntidadeNegocio[];
  },

  create: async (item: Omit<EntidadeNegocio, 'id'>): Promise<EntidadeNegocio> => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('entidades_negocio')
      .insert([{ ...item, user_id: user?.id }])
      .select()
      .single();
    
    if (error) throw error;
    return data as EntidadeNegocio;
  },

  update: async (id: string, data: any): Promise<EntidadeNegocio> => {
    const { data: updatedData, error } = await supabase
      .from('entidades_negocio')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return updatedData as EntidadeNegocio;
  },

  delete: async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('entidades_negocio')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  },

  getDocuments: async (entidadeId: string): Promise<any[]> => {
    const { data, error } = await supabase
      .from('entidade_documentos')
      .select('*')
      .eq('entidade_id', entidadeId);
    
    if (error) throw error;
    return data;
  },

  deleteDocument: async (documentId: string, filePath: string): Promise<void> => {
    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([filePath]);
    
    if (storageError) console.error('Storage delete error:', storageError);

    // Delete from DB
    const { error: dbError } = await supabase
      .from('entidade_documentos')
      .delete()
      .eq('id', documentId);
    
    if (dbError) throw dbError;
  }
};
