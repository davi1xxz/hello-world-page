import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4'
import { persistGeneratedMedia } from '../_shared/persist-generated-media.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const asText = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value.trim() : fallback

const asNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

const sign = async (taskId: string, timestamp: string, hmacKey: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(hmacKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${taskId}.${timestamp}`)))
  return btoa(String.fromCharCode(...bytes))
}

const extractTracks = (body: Record<string, unknown>) => {
  const data = (body.data && typeof body.data === 'object' ? body.data : {}) as Record<string, unknown>
  const responseData = (data.response && typeof data.response === 'object' ? data.response : {}) as Record<string, unknown>
  const rawItems = [data.data, data.sunoData, responseData.data, responseData.sunoData]
    .filter(Array.isArray)
    .flat()
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))

  return rawItems
    .map((item, index) => {
      const audioUrl = asText(item.audioUrl ?? item.audio_url ?? item.url ?? item.sourceAudioUrl ?? item.source_audio_url)
      if (!audioUrl) return null

      return {
        provider_item_id: asText(item.id ?? item.audioId ?? item.audio_id, `${asText(data.task_id ?? data.taskId)}-${index}`),
        title: asText(item.title, index === 0 ? 'FlowHits AI' : `FlowHits AI ${index + 1}`).slice(0, 120),
        subtitle: asText(item.tags ?? item.style ?? data.style, 'Gerada com KIE').slice(0, 240),
        lyrics: asText(item.lyric ?? item.lyrics ?? data.lyric ?? data.lyrics).slice(0, 5000) || null,
        duration_seconds: asNumber(item.duration ?? item.durationSeconds ?? item.duration_seconds),
        audio_url: audioUrl,
        audio_path: audioUrl,
        cover_url: asText(item.imageUrl ?? item.image_url ?? item.coverUrl ?? item.cover_url) || null,
        cover_path: asText(item.imageUrl ?? item.image_url ?? item.coverUrl ?? item.cover_url) || null,
      }
    })
    .filter(Boolean)
}

async function handleCallback(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, 405)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json({ error: 'JSON invalido.' }, 400)
  }

  let data = (body.data && typeof body.data === 'object' ? body.data : {}) as Record<string, unknown>
  const taskId = asText(body.task_id ?? body.taskId ?? data.task_id ?? data.taskId)
  if (!taskId) return json({ error: 'taskId ausente.' }, 400)

  // KIE documents `text`, `first`, `complete`, and `error` callback stages.
  let callbackType = asText(data.callbackType ?? body.callbackType).toLowerCase()
  let providerCode = typeof body.code === 'number' ? body.code : null
  let failed = callbackType === 'error' || [400, 408, 413, 500, 501, 531].includes(providerCode ?? 0)

  const timestamp = request.headers.get('X-Webhook-Timestamp') ?? ''
  const signature = request.headers.get('X-Webhook-Signature') ?? ''
  const hmacKey = Deno.env.get('KIE_WEBHOOK_HMAC_KEY') ?? ''
  const timestampSeconds = Number(timestamp)
  const hasSignatureHeaders = Boolean(timestamp || signature)
  let signatureVerified = false

  if (hmacKey && hasSignatureHeaders) {
    if (!timestamp || !signature || !Number.isFinite(timestampSeconds)) {
      console.error('[kie-callback] Webhook rejeitado: cabeçalhos HMAC ausentes.')
      return json({ error: 'Webhook nao autorizado.' }, 401)
    }
    if (Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
      console.error('[kie-callback] Webhook rejeitado: timestamp expirado.')
      return json({ error: 'Webhook nao autorizado.' }, 401)
    }

    const expected = await sign(taskId, timestamp, hmacKey)
    if (!timingSafeEqual(expected, signature)) {
      console.error('[kie-callback] Webhook rejeitado: assinatura HMAC inválida.')
      return json({ error: 'Webhook nao autorizado.' }, 401)
    }
    signatureVerified = true
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Ambiente Supabase incompleto.' }, 500)

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: job, error: jobError } = await admin
    .from('geracoes')
    .select('id, studio_id, requested_by, title, prompt, style, voice, status')
    .eq('provider_task_id', taskId)
    .maybeSingle()

  if (jobError) return json({ error: 'Falha ao consultar job.' }, 500)
  if (!job) return json({ received: true })
  if (job.status === 'completed') return json({ received: true })

  // Some KIE accounts do not attach HMAC headers until webhook signing is
  // enabled in their console. In that case, never trust the callback body:
  // query KIE with the server-only API key and use only that response.
  if (!signatureVerified) {
    const kieApiKey = Deno.env.get('KIE_API_KEY')
    if (!kieApiKey) return json({ error: 'KIE_API_KEY nao configurada.' }, 503)

    const recordResponse = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${kieApiKey}` },
    })
    if (!recordResponse.ok) return json({ error: 'Falha ao validar task na KIE.' }, 502)

    const recordBody = await recordResponse.json().catch(() => null) as Record<string, unknown> | null
    if (!recordBody) return json({ error: 'Resposta invalida da KIE.' }, 502)
    const recordData = (recordBody.data && typeof recordBody.data === 'object' ? recordBody.data : {}) as Record<string, unknown>
    if (asText(recordData.taskId ?? recordData.task_id) !== taskId) return json({ error: 'Task divergente na KIE.' }, 502)

    body = recordBody
    data = recordData
    providerCode = typeof recordBody.code === 'number' ? recordBody.code : null
    const status = asText(recordData.status).toUpperCase()
    callbackType = status === 'SUCCESS' ? 'complete' : status === 'FIRST_SUCCESS' ? 'first' : status === 'TEXT_SUCCESS' ? 'text' : status.toLowerCase()
    failed = new Set(['CREATE_TASK_FAILED', 'GENERATE_AUDIO_FAILED', 'CALLBACK_EXCEPTION', 'SENSITIVE_WORD_ERROR', 'ERROR', 'FAILED', 'FAIL']).has(status)
  }

  console.log(`[kie-callback] Webhook recebido para taskId ${taskId}, callbackType: ${callbackType}`)

  if (failed) {
    console.error(`[kie-callback] Job ${job.id} falhou no provedor:`, body.msg ?? data.msg)
    await admin
      .from('geracoes')
      .update({
        status: 'failed',
        failure_reason: asText(body.msg ?? data.msg, 'Falha do provedor').slice(0, 500),
        callback_received_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        provider_response: { code: providerCode, callbackType },
      })
      .eq('id', job.id)
      .neq('status', 'completed')

    await admin
      .from('creditos_movimentacoes')
      .upsert({ studio_id: job.studio_id, amount: 20, reason: 'refund', reference_id: job.id }, { onConflict: 'reference_id,reason' })

    return json({ received: true })
  }

  if (callbackType !== 'complete') {
    const partialTracks = callbackType === 'first' ? extractTracks(body) : []
    if (partialTracks.length > 0) {
      const persistedTracks = await Promise.all(partialTracks.map((track) => persistGeneratedMedia(admin, job.id, track)))
      const { error: partialTracksError } = await admin.from('faixas').upsert(persistedTracks.map((track) => ({
        ...track,
        title: job.title || track.title,
        generation_job_id: job.id,
        studio_id: job.studio_id,
        created_by: job.requested_by,
        style: job.style,
        voice: job.voice,
        status: 'processing',
      })), { onConflict: 'generation_job_id,provider_item_id' })
      if (partialTracksError) return json({ error: 'Falha ao salvar resultado parcial.' }, 500)
    }
    console.log(`[kie-callback] Callback intermediário (${callbackType}) para job ${job.id}`)
    await admin
      .from('geracoes')
      .update({ callback_received_at: new Date().toISOString(), provider_response: { code: providerCode, callbackType } })
      .eq('id', job.id)
      .eq('status', 'processing')
    return json({ received: true })
  }

  const tracks = extractTracks(body)
  console.log(`[kie-callback] Extraídas ${tracks.length} faixa(s) para o job ${job.id}`)

  if (tracks.length > 0) {
    const persistedTracks = await Promise.all(tracks.map((track) => persistGeneratedMedia(admin, job.id, track)))
    const { error: tracksError } = await admin.from('faixas').upsert(persistedTracks.map((track) => ({
      ...track,
      title: job.title || track.title,
      generation_job_id: job.id,
      studio_id: job.studio_id,
      created_by: job.requested_by,
      style: job.style,
      voice: job.voice,
      status: 'ready',
    })), { onConflict: 'generation_job_id,provider_item_id' })
    if (tracksError) {
      console.error('[kie-callback] Erro ao salvar faixas no banco:', tracksError)
      return json({ error: 'Falha ao salvar faixas.' }, 500)
    }
  } else {
    console.error('[kie-callback] Callback final sem faixas de áudio:', body)
    return json({ error: 'Callback final sem faixas.' }, 422)
  }

  await admin
    .from('geracoes')
    .update({
      status: 'completed',
      callback_received_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      provider_response: { code: providerCode, callbackType, tracks: tracks.length },
    })
    .eq('id', job.id)
    .neq('status', 'completed')

  console.log(`[kie-callback] Sucesso! Job ${job.id} marcado como concluído com ${tracks.length} faixas salvas.`)
  return json({ received: true })
}

Deno.serve(async (request) => {
  try {
    return await handleCallback(request)
  } catch (error) {
    console.error('[kie-callback] Erro inesperado:', error)
    // A non-2xx response tells KIE to retry a transient callback failure.
    return json({ error: 'Erro interno ao processar callback.' }, 500)
  }
})
