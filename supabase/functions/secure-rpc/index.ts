import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Metodo nao permitido' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return json({ error: 'Ambiente Supabase incompleto.' }, 500)
  }

  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!token) return json({ error: 'Usuario nao autenticado.' }, 401)

  let payload: { function?: string; fn?: string; args?: Record<string, unknown> }
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'JSON invalido.' }, 400)
  }

  const functionName = String(payload.function || payload.fn || '').trim()
  if (!functionName) return json({ error: 'RPC nao informada.' }, 400)

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: userData, error: userError } = await userClient.auth.getUser(token)
  if (userError || !userData.user) {
    return json({ error: 'Sessao invalida.' }, 401)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await adminClient.rpc('secure_rpc', {
    p_function: functionName,
    p_args: payload.args || {},
    p_actor_id: userData.user.id,
  })

  if (error) {
    console.error('[secure-rpc] Falha ao executar RPC:', functionName, error)
    return json({ error: error.message || 'Falha ao executar RPC segura.', details: error }, 400)
  }

  return json({ data })
})
