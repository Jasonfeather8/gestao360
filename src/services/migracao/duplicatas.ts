import { supabase } from '@/integrations/supabase/client';

export interface ChaveDuplicata {
  indice: number;
  conta_id: string | null;
  vencimento: string | null;
  valor: number | null;
  observacoes: string;
}

/**
 * Pergunta ao banco quais linhas já existem como lançamento
 * (mesma conta + vencimento + valor + observações).
 */
export async function buscarDuplicatas(chaves: ChaveDuplicata[]): Promise<number[]> {
  const validas = chaves.filter(
    chave => !!chave.conta_id && !!chave.vencimento && chave.valor !== null
  );
  if (validas.length === 0) return [];

  const { data, error } = await supabase.rpc('detectar_duplicatas', { p_chaves: validas });
  if (error) throw error;

  const lista = (data as { duplicados?: number[] } | null)?.duplicados ?? [];
  return Array.isArray(lista) ? lista : [];
}
