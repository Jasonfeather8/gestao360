declare const Deno: {
  env: {
    get(name: string): string | undefined
  }
}

// @ts-expect-error Deno resolves this remote module in the Edge Function runtime.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-expect-error Deno resolves this remote module in the Edge Function runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return jsonResponse({}, 200)
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i)
    if (!tokenMatch) {
      return jsonResponse({ error: 'Token de autenticação ausente ou inválido.' }, 401)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(tokenMatch[1])
    if (authError || !user) {
      return jsonResponse({ error: 'Token de autenticação inválido.' }, 401)
    }

    let role = user.app_metadata?.role
    if (!role) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      role = profile?.role
    }
    if (role !== 'master') {
      return jsonResponse({ error: 'Apenas usuários Master podem enviar emails de teste.' }, 403)
    }

    let body: Record<string, unknown>
    try {
      const parsed: unknown = await req.json()
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return jsonResponse({ error: 'O corpo da requisição deve ser um objeto JSON.' }, 400)
      }
      body = parsed as Record<string, unknown>
    } catch {
      return jsonResponse({ error: 'O corpo da requisição deve ser um JSON válido.' }, 400)
    }

    const to = typeof body.to === 'string' ? body.to.trim() : ''
    const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
    const html = typeof body.html === 'string' ? body.html : ''
    const from = typeof body.from === 'string' && body.from.trim() ? body.from.trim() : 'onboarding@resend.dev'
    const replyTo = typeof body.reply_to === 'string' ? body.reply_to.trim() : ''

    if (!to) return jsonResponse({ error: 'O destinatário (to) é obrigatório.' }, 400)
    if (!subject) return jsonResponse({ error: 'O assunto (subject) é obrigatório.' }, 400)
    if (!html.trim()) return jsonResponse({ error: 'O conteúdo do email (html) é obrigatório.' }, 400)

    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      return jsonResponse({ error: 'A secret RESEND_API_KEY não está configurada no Supabase.' }, 500)
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    })

    const resendResult: unknown = await resendResponse.json().catch(() => null)
    if (!resendResponse.ok) {
      const message = typeof resendResult === 'object' && resendResult !== null && 'message' in resendResult
        ? String((resendResult as { message: unknown }).message)
        : 'A Resend não conseguiu enviar o email.'
      console.error('[enviar-email-teste] Resend recusou o envio:', message)
      return jsonResponse({ error: message }, resendResponse.status)
    }

    const id = typeof resendResult === 'object' && resendResult !== null && 'id' in resendResult
      ? (resendResult as { id: unknown }).id
      : null
    console.log('[enviar-email-teste] Email de teste enviado com sucesso.')
    return jsonResponse({ success: true, id })
  } catch (error) {
    console.error('[enviar-email-teste] Erro interno ao enviar email de teste:', error)
    return jsonResponse({ error: 'Não foi possível enviar o email de teste.' }, 500)
  }
})
