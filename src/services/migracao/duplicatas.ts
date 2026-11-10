import { supabase } from '@/integrations/supabase/client';

export interface ChaveDuplicata {
  indice: number;
  conta_id: string | null;
  vencimento: string | null;
  valor: number | null;
  observacoes: string;
  categoria_id?: string | null;
  centro_custo_id?: string | null;
}

export interface OrigemDuplicata {
  arquivo_nome: string | null;
  importado_em: string | null;
}

/**
 * Pergunta ao banco quais linhas já existem como lançamento
 * (mesma conta + vencimento + valor + observações).
 */
export async function buscarDuplicatas(chaves: ChaveDuplicata[]): Promise<Map<number, OrigemDuplicata | null>> {
  const validas = chaves.filter(
    chave => !!chave.conta_id && !!chave.vencimento && chave.valor !== null
  );
  if (validas.length === 0) return new Map();

  const { data, error } = await supabase.rpc('detectar_duplicatas', { p_chaves: validas });
  if (error) throw error;

  const resposta = data as {
    duplicados?: number[];
    origens?: { indice: number; arquivo_nome?: string | null; importado_em?: string | null }[];
  } | null;
  const indicesDuplicados = Array.isArray(resposta?.duplicados) ? resposta.duplicados : [];
  const origens = new Map((resposta?.origens ?? []).map(origem => [
    origem.indice,
    { arquivo_nome: origem.arquivo_nome ?? null, importado_em: origem.importado_em ?? null },
  ]));

  return new Map(indicesDuplicados.map(indice => [indice, origens.get(indice) ?? null]));
}
