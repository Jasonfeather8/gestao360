// FUNÇÃO TEMPORÁRIA DE ENTREGA — deve ser removida após o uso.
//
// Motivo: o banco bloqueia exclusão direta em storage.objects (gatilho protect_delete) para
// não deixar arquivos órfãos. A exclusão correta passa pela API do Storage, que exige
// credencial de serviço — disponível aqui no ambiente da Edge Function.
//
// Segurança: a lista de caminhos é FIXA. A função não aceita parâmetros e só consegue apagar
// exatamente estes arquivos (extratos e anexos dos dados de teste). As logos dos bancos
// (documents/logos-bancos) não estão na lista e não são afetadas.

declare const Deno: {
  env: {
    get(name: string): string | undefined
  }
}

// @ts-expect-error Deno resolves this remote module in the Edge Function runtime.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-expect-error Deno resolves this remote module in the Edge Function runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const ARQUIVOS: Record<string, string[]> = {
  "bank-statements": [
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/0b0ea59f-17a2-4c34-a0fa-d8038a661d89/mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/45ccdf50-234c-46cb-acdb-40425b25eca5/mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/4ca89789-79b9-4e85-ba0e-58a24cc0878a/Entradas-21_09_2026-18_28_15.csv",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/561986e1-8f4f-4609-aa9c-d685cd3ca433/COR.A....................pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/63f67c64-5fcf-499d-b6dc-1d1cc8dcc3d9/Saidas-21_09_2026-18_37_22.csv",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/90abcbf3-4b5c-4a0d-b7f8-c706f5cd6281/mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/9c413b65-e689-47f4-b0b8-5cc924189f06/mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/a04b3149-63d5-4f5d-9648-36e3f85406bf/mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/b40da556-aebd-416b-aadf-1f85f55c183a/mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/bd438c84-f352-46a3-ac07-cf6cbfcad168/mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/c3300740-fdeb-468a-acde-dfa5900fad4d/mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/c81d72dc-7f62-41a5-85ea-60a97d73bf2f/mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/c968f0bc-15ec-4ca8-807e-84124be04df6/mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/cdd0fc97-eab6-4820-b30d-b77a56bc0583/STONE.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/d0446a96-d9c8-42c5-a26c-b07b03fda6b3/mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/dde8910b-11fd-4b86-ba82-fb37b9c9abba/bradesco.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/de909f73-9764-4d42-8c7a-d2e36961a8d2/mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/e4dab80f-5852-4b76-ace7-7edeeebbb93e/mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/eed8691e-c652-4e19-b91a-53e524a76fb9/mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf",
    "5bcb1aa3-2e33-4cb2-9097-8ed541c6b6e3/f7747df7-9584-4fae-ba05-01ccdd576c48/mesquita-administracoes_14092026_a_22092026_2d1a141c.pdf",
  ],
  "documents": [
    "entidades/8dc409de-3d77-409e-a2e3-09d94abf63c4/0.02322794624913538.jpeg",
    "lancamentos/018de048-b99b-45fb-a468-5733a672d96f/0.5664082757641461.pdf",
    "lancamentos/0785dea1-0493-44de-bcc9-c6bfab6fa624/1787101802870-citb6cb2t3.jpeg",
    "lancamentos/1d6555ac-0275-4f7d-b6a3-b2fa3845575c/0.02201839130268557.pdf",
    "lancamentos/35b597ad-38a6-40fc-831d-ee35a0a8f851/0.03129081991646032.pdf",
    "lancamentos/3b8f9542-fc5d-48dc-bb59-1f5b8c95e44c/0.17027325545046434.pdf",
    "lancamentos/4a6c2dcd-2bf8-4989-af7c-95d74a3f4c85/0.7708168515659302.jpeg",
    "lancamentos/4c1c037a-798e-4752-89e0-4f5386ae1cef/0.04677309294735199.pdf",
    "lancamentos/51b14e86-b600-418d-bc38-bc8cc1e2e3cf/0.024475594692920932.pdf",
    "lancamentos/63d527fe-e120-4e84-9252-bb1e807b4a5a/0.6125305903841429.pdf",
    "lancamentos/68a686e4-7d5d-4524-b56d-fd45f2f99550/0.36614785511749537.pdf",
    "lancamentos/79eaa1d3-342f-417c-987e-f903fd353959/0.1520089159342174.jpeg",
    "lancamentos/7d416fb9-12c4-4d91-bdd3-a46e2e09356e/0.4879668732059359.pdf",
    "lancamentos/95722b12-4151-4f5f-b204-d53c72bb6fec/0.9411880307012813.pdf",
    "lancamentos/a9494d7b-e6ce-4e46-a5eb-65ebd3776136/0.21337808235191102.jpeg",
    "lancamentos/ad52d6b0-f70f-4d34-a790-8c7863d971f1/0.6410375410290894.pdf",
    "lancamentos/b7cb167a-db77-4da5-a4ae-f11ba58c9f14/0.70531701433195.png",
    "lancamentos/c59f4876-e6c4-4f3f-9d5d-6fbbb63b7df3/0.37434632036127213.pdf",
    "lancamentos/c9ca810f-4c0d-462a-bbf6-efdd038e70e4/1786743091315-37ywzirp3d.png",
    "lancamentos/ccd77edd-941d-4d70-b662-d8d5b148d203/0.9385358954450862.pdf",
    "lancamentos/cdab1117-bb7e-425d-9d06-9a86e91934b4/0.14832447720517383.pdf",
    "lancamentos/d445c9e9-b973-4a13-93b0-72e43f2098a1/0.7299951212821786.pdf",
    "lancamentos/e442b5d4-f5eb-4820-b433-94484523c2fb/0.8927972667574947.jpeg",
    "lancamentos/ebad6ad3-155b-435c-ae34-d0e06358d170/0.5981489501141642.pdf",
  ],
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const resultado: Record<string, { solicitados: number; removidos: number; erro?: string }> = {}

    for (const [bucket, caminhos] of Object.entries(ARQUIVOS)) {
      const { data, error } = await supabaseAdmin.storage.from(bucket).remove(caminhos)
      console.log("[limpar-arquivos-teste] remocao", {
        bucket,
        solicitados: caminhos.length,
        removidos: data?.length ?? 0,
        error: error?.message ?? null,
      })
      resultado[bucket] = {
        solicitados: caminhos.length,
        removidos: data?.length ?? 0,
        ...(error ? { erro: error.message } : {}),
      }
    }

    return new Response(JSON.stringify({ ok: true, resultado }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "erro desconhecido"
    console.error("[limpar-arquivos-teste] erro", { error: mensagem })
    return new Response(JSON.stringify({ ok: false, error: mensagem }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
