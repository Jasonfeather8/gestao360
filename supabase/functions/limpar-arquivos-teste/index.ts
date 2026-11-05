import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Limpeza pontual dos arquivos de teste que sobraram no Storage.
// Lista fixa e fechada: a função não aceita caminhos externos, então não serve
// para apagar outros arquivos. As logos dos bancos (documents/logos-bancos/)
// ficam de fora de propósito.
const ALVOS: Array<{ bucket: string; caminhos: string[] }> = [
  {
    bucket: 'bank-statements',
    caminhos: [
      '221d9b66-a792-4175-9335-c9c75b8541ac/fbf80269-9460-4fd5-a49d-bc6d2be7321b/mesquita-administracoes_01012023_a_10012023_bac448b5.pdf',
    ],
  },
  {
    bucket: 'documents',
    caminhos: [
      'lancamentos/35e8f54b-0d32-4a4a-af90-afe322539f1a/0.4398191253349967.jpeg',
    ],
  },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const resultado: Record<string, { solicitados: number; removidos: number }> = {};

    for (const alvo of ALVOS) {
      const { data, error } = await admin.storage.from(alvo.bucket).remove(alvo.caminhos);

      if (error) {
        console.error('[limpar-arquivos-teste] falha ao remover arquivos', {
          bucket: alvo.bucket,
          error: error.message,
        });
        return new Response(JSON.stringify({ ok: false, bucket: alvo.bucket, erro: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      resultado[alvo.bucket] = {
        solicitados: alvo.caminhos.length,
        removidos: data?.length ?? 0,
      };

      console.log('[limpar-arquivos-teste] bucket processado', {
        bucket: alvo.bucket,
        solicitados: alvo.caminhos.length,
        removidos: data?.length ?? 0,
      });
    }

    return new Response(JSON.stringify({ ok: true, resultado }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (erro) {
    console.error('[limpar-arquivos-teste] erro inesperado', { erro: String(erro) });
    return new Response(JSON.stringify({ ok: false, erro: String(erro) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
