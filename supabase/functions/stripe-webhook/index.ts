import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4'

// Verificação criptográfica nativa de assinatura Stripe (HMAC SHA-256)
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string, toleranceSeconds = 300): Promise<boolean> {
  if (!sigHeader || !secret) return false

  const parts = sigHeader.split(',').reduce((acc: Record<string, string>, item) => {
    const [key, val] = item.split('=')
    if (key && val) acc[key.trim()] = val.trim()
    return acc
  }, {})

  const timestamp = parseInt(parts.t, 10)
  const signature = parts.v1

  if (isNaN(timestamp) || !signature) return false

  // Proteção contra Replay Attack
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    console.error(`[stripe-webhook] Assinatura expirada. Timestamp: ${timestamp}, Now: ${now}`)
    return false
  }

  const signedPayload = `${timestamp}.${payload}`
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const computedSigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))
  const computedHex = Array.from(new Uint8Array(computedSigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return computedHex === signature
}

async function handleWebhook(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metodo nao permitido' }), { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Ambiente Supabase incompleto' }), { status: 500 })
  }

  const sigHeader = request.headers.get('stripe-signature') ?? ''
  const rawBody = await request.text()

  // Se houver webhook secret configurado, realiza verificação criptográfica estrita
  if (webhookSecret) {
    const isValid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret)
    if (!isValid) {
      console.error('[stripe-webhook] Assinatura HMAC invalida ou rejeitada!')
      return new Response(JSON.stringify({ error: 'Assinatura Stripe invalida.' }), { status: 400 })
    }
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ error: 'JSON malformado.' }), { status: 400 })
  }

  const eventId = typeof event.id === 'string' ? event.id : ''
  const eventType = typeof event.type === 'string' ? event.type : ''
  const eventData = (event.data && typeof event.data === 'object' ? (event.data as Record<string, unknown>).object : {}) as Record<string, unknown>

  console.log(`[stripe-webhook] Processando evento: ${eventType} (${eventId})`)

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  try {
    // 1. Checkout Session Concluído (Compra de Pacote ou Assinatura Inicial)
    if (eventType === 'checkout.session.completed') {
      const sessionId = typeof eventData.id === 'string' ? eventData.id : ''
      const customerId = typeof eventData.customer === 'string' ? eventData.customer : ''
      const subscriptionId = typeof eventData.subscription === 'string' ? eventData.subscription : ''
      const metadata = (eventData.metadata && typeof eventData.metadata === 'object' ? eventData.metadata : {}) as Record<string, unknown>

      const userId = typeof metadata.user_id === 'string' ? metadata.user_id : null
      const studioId = typeof metadata.studio_id === 'string' ? metadata.studio_id : null
      const mode = typeof eventData.mode === 'string' ? eventData.mode : 'payment'
      const planTier = typeof metadata.plan_tier === 'string' ? metadata.plan_tier : null
      const billingInterval = typeof metadata.billing_interval === 'string' ? metadata.billing_interval : null
      const credits = parseInt(String(metadata.credits || '0'), 10)

      if (userId && studioId) {
        const { data, error } = await adminClient.rpc('processar_checkout_stripe_concluido', {
          p_event_id: eventId,
          p_session_id: sessionId,
          p_customer_id: customerId,
          p_user_id: userId,
          p_studio_id: studioId,
          p_mode: mode,
          p_plan_tier: planTier,
          p_billing_interval: billingInterval,
          p_credits: credits,
          p_subscription_id: subscriptionId || null,
        })

        if (error) throw error
        console.log('[stripe-webhook] Checkout processado com sucesso:', data)
      }
    }

    // 2. Fatura Paga / Renovação de Assinatura (invoice.paid)
    else if (eventType === 'invoice.paid') {
      const invoiceId = typeof eventData.id === 'string' ? eventData.id : ''
      const subscriptionId = typeof eventData.subscription === 'string' ? eventData.subscription : ''
      const customerId = typeof eventData.customer === 'string' ? eventData.customer : ''
      const billingReason = typeof eventData.billing_reason === 'string' ? eventData.billing_reason : 'subscription_cycle'

      if (subscriptionId) {
        const { data, error } = await adminClient.rpc('processar_renovacao_assinatura_stripe', {
          p_event_id: eventId,
          p_invoice_id: invoiceId,
          p_subscription_id: subscriptionId,
          p_customer_id: customerId,
          p_billing_reason: billingReason,
        })

        if (error) throw error
        console.log('[stripe-webhook] Renovacao de fatura processada:', data)
      }
    }

    // 3. Atualização de Assinatura / Cancelamento
    else if (eventType === 'customer.subscription.updated' || eventType === 'customer.subscription.deleted') {
      const subscriptionId = typeof eventData.id === 'string' ? eventData.id : ''
      const status = typeof eventData.status === 'string' ? eventData.status : 'active'
      const currentPeriodStart = eventData.current_period_start ? new Date(Number(eventData.current_period_start) * 1000).toISOString() : null
      const currentPeriodEnd = eventData.current_period_end ? new Date(Number(eventData.current_period_end) * 1000).toISOString() : null
      const cancelAtPeriodEnd = Boolean(eventData.cancel_at_period_end)

      if (subscriptionId) {
        const { data, error } = await adminClient.rpc('processar_atualizacao_status_assinatura_stripe', {
          p_event_id: eventId,
          p_subscription_id: subscriptionId,
          p_status: eventType === 'customer.subscription.deleted' ? 'canceled' : status,
          p_period_start: currentPeriodStart,
          p_period_end: currentPeriodEnd,
          p_cancel_at_period_end: cancelAtPeriodEnd,
        })

        if (error) throw error
        console.log('[stripe-webhook] Status de assinatura atualizado:', data)
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[stripe-webhook] Erro ao processar webhook:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

Deno.serve(handleWebhook)
