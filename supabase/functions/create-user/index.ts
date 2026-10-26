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
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing Authorization header')
    }

    // Initialize Supabase Admin Client using Service Role Key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify if the user calling this is a Master
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) throw new Error('Invalid token')
    
    if (user.app_metadata?.role !== 'master') {
      throw new Error('Apenas usuários Master podem criar novas contas.')
    }

    // Parse request body
    const { email, password, nome, role, telefone } = await req.json()

    if (!email || !password || !nome || !role) {
      throw new Error('Campos obrigatórios faltando')
    }

    // Create the user in Auth
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto confirm so they can login immediately
      user_metadata: { nome, telefone },
      app_metadata: { role } // Inject custom claim
    })

    if (createError) throw createError

    // The database trigger (handle_new_user) will create the public.profile.
    // We just need to update it with the correct role and phone.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ role, telefone, nome })
      .eq('id', newUser.user.id)

    if (profileError) throw profileError

    return new Response(
      JSON.stringify({ success: true, user: newUser.user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    console.error('[create-user] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
