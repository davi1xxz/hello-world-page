import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4'

const configuredOrigins = (Deno.env.get('APP_ORIGIN') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...configuredOrigins,
])

const corsHeadersFor = (request: Request) => {
  const origin = request.headers.get('Origin') ?? ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
  if (allowedOrigins.has(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

const json = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(request), 'Content-Type': 'application/json' },
  })

// Catálogo Oficial com Preços Fixos no Backend (R$ 0,15 / crédito base -> 10 créditos = 1 música)
const PLANS_CATALOG: Record<string, { name: string; mode: 'subscription'; tier: 'lite' | 'plus' | 'pro'; interval: 'monthly' | 'yearly'; amountBrlCents: number; credits: number }> = {
  lite_monthly: {
    name: 'FlowHits Lite (Mensal)',
    mode: 'subscription',
    tier: 'lite',
    interval: 'monthly',
    amountBrlCents: 3000, // R$ 30,00
    credits: 200,
  },
  lite_yearly: {
    name: 'FlowHits Lite (Anual - 20% OFF)',
    mode: 'subscription',
    tier: 'lite',
    interval: 'yearly',
    amountBrlCents: 28800, // R$ 288,00 / ano (R$ 24,00/mês)
    credits: 2400, // 200 créditos x 12 meses
  },
  plus_monthly: {
    name: 'FlowHits Plus (Mensal)',
    mode: 'subscription',
    tier: 'plus',
    interval: 'monthly',
    amountBrlCents: 9000, // R$ 90,00
    credits: 600,
  },
  plus_yearly: {
    name: 'FlowHits Plus (Anual - 20% OFF)',
    mode: 'subscription',
    tier: 'plus',
    interval: 'yearly',
    amountBrlCents: 86400, // R$ 864,00 / ano (R$ 72,00/mês)
    credits: 7200, // 600 créditos x 12 meses
  },
  pro_monthly: {
    name: 'FlowHits Pro (Mensal)',
    mode: 'subscription',
    tier: 'pro',
    interval: 'monthly',
    amountBrlCents: 24000, // R$ 240,00
    credits: 1600,
  },
  pro_yearly: {
    name: 'FlowHits Pro (Anual - 20% OFF)',
    mode: 'subscription',
    tier: 'pro',
    interval: 'yearly',
    amountBrlCents: 230400, // R$ 2.304,00 / ano (R$ 192,00/mês)
    credits: 19200, // 1600 créditos x 12 meses
  },
}

const PACKAGES_CATALOG: Record<string, { name: string; mode: 'payment'; amountBrlCents: number; credits: number }> = {
  pack_10: {
    name: 'Pacote Starter (100 Créditos)',
    mode: 'payment',
    amountBrlCents: 1500, // R$ 15,00
    credits: 100,
  },
  pack_30: {
    name: 'Pacote Creator (300 Créditos)',
    mode: 'payment',
    amountBrlCents: 4500, // R$ 45,00
    credits: 300,
  },
  pack_100: {
    name: 'Pacote Studio Pro (1.000 Créditos)',
    mode: 'payment',
    amountBrlCents: 15000, // R$ 150,00
    credits: 1000,
  },
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(request) })
  if (request.method !== 'POST') return json(request, { error: 'Metodo nao permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return json(request, { error: 'Ambiente Supabase incompleto.' }, 500)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return json(request, { error: 'Nao autenticado.' }, 401)

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json(request, { error: 'Usuario invalido.' }, 401)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json(request, { error: 'JSON invalido.' }, 400)
  }

  const action = typeof body.action === 'string' ? body.action.trim() : 'create-checkout-session'
  const studioId = typeof body.studioId === 'string' ? body.studioId.trim() : ''
  const appOrigin = request.headers.get('Origin') || 'http://localhost:5173'

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // 1. Gerenciamento pelo Portal do Cliente Stripe
  if (action === 'create-portal-session') {
    if (!stripeSecretKey) {
      return json(request, { error: 'STRIPE_SECRET_KEY nao configurada.' }, 503)
    }

    const { data: clientRecord } = await adminClient
      .from('stripe_clientes')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!clientRecord?.stripe_customer_id) {
      return json(request, { error: 'Nenhum historico de faturamento encontrado no Stripe para esta conta.' }, 404)
    }

    const portalParams = new URLSearchParams()
    portalParams.append('customer', clientRecord.stripe_customer_id)
    portalParams.append('return_url', `${appOrigin}/?billing=returned`)

    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: portalParams.toString(),
    })

    const portalData = await portalRes.json()
    if (!portalRes.ok) {
      return json(request, { error: portalData.error?.message || 'Falha ao criar sessao do portal.' }, 400)
    }

    return json(request, { url: portalData.url })
  }

  // 2. Criação de Sessão de Checkout (Plano ou Pacote)
  const planId = typeof body.planId === 'string' ? body.planId.trim() : ''
  const packageId = typeof body.packageId === 'string' ? body.packageId.trim() : ''

  if (!studioId) return json(request, { error: 'studioId obrigatorio.' }, 400)

  // Validar se o usuário é membro do estúdio
  const { data: membership, error: memErr } = await userClient
    .from('membros_estudio')
    .select('studio_id')
    .eq('studio_id', studioId)
    .maybeSingle()

  if (memErr || !membership) return json(request, { error: 'Acesso negado ao estudio especificado.' }, 403)

  const selectedPlan = planId ? PLANS_CATALOG[planId] : null
  const selectedPackage = packageId ? PACKAGES_CATALOG[packageId] : null

  if (!selectedPlan && !selectedPackage) {
    return json(request, { error: 'Selecione um plano ou pacote valido.' }, 400)
  }

  if (!stripeSecretKey) {
    return json(request, { error: 'STRIPE_SECRET_KEY nao configurada no servidor.' }, 503)
  }

  // Obter ou preparar Stripe Customer
  const { data: existingCustomer } = await adminClient
    .from('stripe_clientes')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  let customerId = existingCustomer?.stripe_customer_id

  if (!customerId) {
    const custParams = new URLSearchParams()
    custParams.append('email', user.email || '')
    custParams.append('metadata[user_id]', user.id)

    const custRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: custParams.toString(),
    })

    if (custRes.ok) {
      const custData = await custRes.json()
      customerId = custData.id
      await adminClient.from('stripe_clientes').upsert({ user_id: user.id, stripe_customer_id: customerId })
    }
  }

  const sessionParams = new URLSearchParams()
  if (customerId) sessionParams.append('customer', customerId)
  else sessionParams.append('customer_email', user.email || '')

  sessionParams.append('payment_method_types[0]', 'card')
  sessionParams.append('success_url', `${appOrigin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`)
  sessionParams.append('cancel_url', `${appOrigin}/?payment=cancelled`)
  sessionParams.append('metadata[user_id]', user.id)
  sessionParams.append('metadata[studio_id]', studioId)

  if (selectedPlan) {
    sessionParams.append('mode', 'subscription')
    sessionParams.append('metadata[plan_tier]', selectedPlan.tier)
    sessionParams.append('metadata[billing_interval]', selectedPlan.interval)
    sessionParams.append('metadata[credits]', String(selectedPlan.credits))
    sessionParams.append('metadata[type]', 'subscription')

    sessionParams.append('line_items[0][price_data][currency]', 'brl')
    sessionParams.append('line_items[0][price_data][product_data][name]', selectedPlan.name)
    sessionParams.append('line_items[0][price_data][product_data][description]', `Assinatura ${selectedPlan.tier.toUpperCase()} com ${selectedPlan.credits} creditos por periodo.`)
    sessionParams.append('line_items[0][price_data][unit_amount]', String(selectedPlan.amountBrlCents))
    sessionParams.append('line_items[0][price_data][recurring][interval]', selectedPlan.interval === 'yearly' ? 'year' : 'month')
    sessionParams.append('line_items[0][quantity]', '1')
  } else if (selectedPackage) {
    sessionParams.append('mode', 'payment')
    sessionParams.append('metadata[credits]', String(selectedPackage.credits))
    sessionParams.append('metadata[type]', 'topup')

    sessionParams.append('line_items[0][price_data][currency]', 'brl')
    sessionParams.append('line_items[0][price_data][product_data][name]', selectedPackage.name)
    sessionParams.append('line_items[0][price_data][product_data][description]', `Recarga rapida de ${selectedPackage.credits} creditos musicais no FlowHits.`)
    sessionParams.append('line_items[0][price_data][unit_amount]', String(selectedPackage.amountBrlCents))
    sessionParams.append('line_items[0][quantity]', '1')
  }

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: sessionParams.toString(),
  })

  const sessionData = await stripeRes.json()
  if (!stripeRes.ok) {
    console.error('[stripe-checkout] Erro ao criar sessao:', sessionData)
    return json(request, { error: sessionData.error?.message || 'Falha ao iniciar checkout no Stripe.' }, 400)
  }

  return json(request, { url: sessionData.url, sessionId: sessionData.id })
}

Deno.serve(handleRequest)
