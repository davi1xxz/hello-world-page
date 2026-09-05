import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4'
import { persistGeneratedMedia } from '../_shared/persist-generated-media.ts'

const configuredOrigins = (Deno.env.get('APP_ORIGIN') ?? '')
  .split(',')
  .map(origin => origin.trim())
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

type GenerateRequest = {
  action?: unknown
  studioId?: unknown
  title?: unknown
  prompt?: unknown
  lyrics?: unknown
  style?: unknown
  voice?: unknown
  mode?: unknown
}

const asText = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value.trim() : fallback

const asNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null

const cleanText = (value: unknown, maxLength: number) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

const extractTracksFromKie = (body: Record<string, unknown>, defaultTaskId = '') => {
  const data = (body.data && typeof body.data === 'object' ? body.data : {}) as Record<string, unknown>
  const responseData = (data.response && typeof data.response === 'object' ? data.response : {}) as Record<string, unknown>
  // Callbacks use data.data; record-info uses data.response.sunoData.
  const rawItems = [data.data, data.sunoData, responseData.data, responseData.sunoData]
    .filter(Array.isArray)
    .flat()
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))

  const effectiveTaskId = asText(data.task_id ?? data.taskId, defaultTaskId)

  return rawItems
    .map((item, index) => {
      const audioUrl = asText(item.audioUrl ?? item.audio_url ?? item.url ?? item.sourceAudioUrl ?? item.source_audio_url)
      if (!audioUrl) return null

      return {
        provider_item_id: asText(item.id ?? item.audioId ?? item.audio_id, `${effectiveTaskId}-${index}`),
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

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(request) })
  if (request.method !== 'POST') return json(request, { error: 'Metodo nao permitido.' }, 405)

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return json(request, { error: 'Conteudo invalido.' }, 415)
  if (Number(request.headers.get('content-length') ?? 0) > 16000) return json(request, { error: 'Conteudo muito grande.' }, 413)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const kieApiKey = Deno.env.get('KIE_API_KEY')

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) return json(request, { error: 'Ambiente Supabase incompleto.' }, 500)
  if (!kieApiKey) return json(request, { error: 'KIE_API_KEY nao configurada.' }, 503)

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return json(request, { error: 'Nao autenticado.' }, 401)

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json(request, { error: 'Nao autenticado.' }, 401)

  let input: GenerateRequest
  try {
    input = await request.json()
  } catch {
    return json(request, { error: 'JSON invalido.' }, 400)
  }

  const studioId = cleanText(input.studioId, 80)
  const action = cleanText(input.action, 20)
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // Ação de Sincronização / Reconciliação
  if (action === 'sync') {
    if (!studioId) return json(request, { error: 'studioId obrigatorio.' }, 400)

    // The admin client is used only after the caller has been authorized by RLS.
    const { data: membership, error: membershipError } = await userClient
      .from('membros_estudio')
      .select('studio_id')
      .eq('studio_id', studioId)
      .maybeSingle()
    if (membershipError || !membership) return json(request, { error: 'Sem acesso ao estudio.' }, 403)

    const { data: pendingJobs, error: pendingError } = await admin
      .from('geracoes')
      .select('id, studio_id, requested_by, title, prompt, style, voice, provider_task_id, status')
      .eq('studio_id', studioId)
      .in('status', ['processing', 'queued'])
      .not('provider_task_id', 'is', null)

    if (pendingError || !pendingJobs || pendingJobs.length === 0) {
      return json(request, { synced: 0 })
    }

    let syncedCount = 0
    for (const job of pendingJobs) {
      if (!job.provider_task_id) continue

      try {
        console.log(`[generate-music:sync] Consultando record-info para task ${job.provider_task_id}...`)
        const recordRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${job.provider_task_id}`, {
          headers: { Authorization: `Bearer ${kieApiKey}` },
        })

        if (!recordRes.ok) continue
        const recordData = await recordRes.json()
        console.log(`[generate-music:sync] Resposta record-info para ${job.provider_task_id}:`, JSON.stringify(recordData, null, 2))

        const kieStatus = asText(recordData?.data?.status ?? recordData?.data?.callbackType ?? recordData?.status).toUpperCase()
        const isFailed = new Set([
          'CREATE_TASK_FAILED',
          'GENERATE_AUDIO_FAILED',
          'CALLBACK_EXCEPTION',
          'SENSITIVE_WORD_ERROR',
          'ERROR',
          'FAILED',
          'FAIL',
        ]).has(kieStatus)

        if (isFailed) {
          await admin
            .from('geracoes')
            .update({
              status: 'failed',
              failure_reason: asText(recordData?.data?.errorMessage ?? recordData?.msg ?? recordData?.data?.msg, 'Falha no provedor KIE'),
              completed_at: new Date().toISOString(),
            })
            .eq('id', job.id)

          await admin
            .from('creditos_movimentacoes')
            .upsert({ studio_id: job.studio_id, amount: 20, reason: 'refund', reference_id: job.id }, { onConflict: 'reference_id,reason' })
          syncedCount += 1
          continue
        }

        const tracks = extractTracksFromKie(recordData, job.provider_task_id)
        if (tracks.length > 0 && kieStatus === 'SUCCESS') {
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
          if (tracksError) throw tracksError

          const { error: completeError } = await admin
            .from('geracoes')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              provider_response: { code: recordData?.code ?? 200, tracks: tracks.length },
            })
            .eq('id', job.id)
          if (completeError) throw completeError

          syncedCount += 1
        } else if (tracks.length > 0 && kieStatus === 'FIRST_SUCCESS') {
          const persistedTracks = await Promise.all(tracks.map((track) => persistGeneratedMedia(admin, job.id, track)))
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
          if (partialTracksError) throw partialTracksError
          await admin
            .from('geracoes')
            .update({ provider_response: { code: recordData?.code ?? 200, status: kieStatus, tracks: tracks.length } })
            .eq('id', job.id)
            .eq('status', 'processing')
          syncedCount += 1
        } else if (kieStatus === 'SUCCESS') {
          await admin
            .from('geracoes')
            .update({ status: 'failed', failure_reason: 'A KIE concluiu a tarefa sem entregar faixas.', completed_at: new Date().toISOString() })
            .eq('id', job.id)
            .in('status', ['processing', 'queued'])
          await admin
            .from('creditos_movimentacoes')
            .upsert({ studio_id: job.studio_id, amount: 20, reason: 'refund', reference_id: job.id }, { onConflict: 'reference_id,reason' })
          syncedCount += 1
        }
      } catch (err) {
        console.error(`[generate-music:sync] Erro ao sincronizar job ${job.id}:`, err)
      }
    }

    return json(request, { synced: syncedCount })
  }

  // Criação de Nova Geração
  const mode = cleanText(input.mode, 20)
  const title = cleanText(input.title, 80)
  const prompt = cleanText(input.prompt, mode === 'simple' ? 3000 : 5000)
  const lyrics = cleanText(input.lyrics, 5000)
  const requestedStyle = cleanText(input.style, 60)
  const style = requestedStyle || (mode === 'simple' ? 'Livre' : '')
  const voice = cleanText(input.voice, 20)

  if (!studioId || !['simple', 'custom'].includes(mode) || (mode === 'simple' && !prompt)) return json(request, { error: 'Dados obrigatorios ausentes.' }, 400)
  if (mode === 'custom' && (!title || !lyrics || !style)) return json(request, { error: 'Nome, letra e estilo sao obrigatorios no modo personalizado.' }, 400)
  if (voice && !['Masculino', 'Feminino'].includes(voice)) return json(request, { error: 'Vocal invalido.' }, 400)

  const { data: job, error: jobError } = await userClient
    .from('geracoes')
    .insert({
      studio_id: studioId,
      requested_by: user.id,
      title: title || null,
      prompt: prompt || null,
      lyrics: lyrics || null,
      style,
      voice: voice || null,
      mode,
      status: 'queued',
    })
    .select('id')
    .single()

  if (jobError || !job) return json(request, { error: jobError?.message ?? 'Nao foi possivel criar o job.' }, 400)

  const failAndRefund = async (reason: string) => {
    await admin
      .from('geracoes')
      .update({ status: 'failed', failure_reason: reason.slice(0, 500), completed_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'queued')

    await admin
      .from('creditos_movimentacoes')
      .upsert({ studio_id: studioId, amount: 20, reason: 'refund', reference_id: job.id }, { onConflict: 'reference_id,reason' })
  }

  let kieResponse: Response
  try {
    const payloadToSend = mode === 'custom'
      ? {
          prompt: lyrics,
          customMode: true,
          instrumental: false,
          model: 'V5_5',
          style,
          title,
          ...(voice ? { vocalGender: voice === 'Feminino' ? 'f' : 'm' } : {}),
          callBackUrl: `${supabaseUrl}/functions/v1/kie-callback`,
        }
      : {
          prompt,
          customMode: false,
          instrumental: false,
          model: 'V5_5',
          callBackUrl: `${supabaseUrl}/functions/v1/kie-callback`,
        }

    console.log('[generate-music] Enviando requisição para KIE:', {
      customMode: payloadToSend.customMode,
      model: payloadToSend.model,
      titleLength: title.length,
      promptLength: payloadToSend.prompt.length,
    })

    kieResponse = await fetch('https://api.kie.ai/api/v1/generate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${kieApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadToSend),
    })
  } catch (fetchErr) {
    console.error('[generate-music] Erro ao conectar na KIE:', fetchErr)
    await failAndRefund('Falha de conexao com o provedor.')
    return json(request, { error: 'Nao foi possivel falar com a KIE.' }, 502)
  }

  const kie = await kieResponse.json().catch(() => null)
  console.log('[generate-music] Resposta da KIE:', JSON.stringify(kie, null, 2))

  const taskId = kie?.data?.taskId

  if (!kieResponse.ok || typeof taskId !== 'string' || !taskId) {
    console.error('[generate-music] KIE recusou a geração:', kie)
    await failAndRefund('Provedor recusou a geracao.')
    return json(request, { error: 'Nao foi possivel iniciar a geracao.' }, 502)
  }

  const { error: startError } = await admin
    .from('geracoes')
    .update({ status: 'processing', provider_task_id: taskId, provider_response: { code: kie?.code ?? null } })
    .eq('id', job.id)
  if (startError) {
    console.error('[generate-music] Tarefa aceita, mas nao foi possivel persistir o taskId:', startError)
    return json(request, { error: 'A geracao foi aceita, mas nao pode ser acompanhada. Contate o suporte.' }, 500)
  }

  console.log(`[generate-music] Sucesso! Job ${job.id} associado ao taskId ${taskId}`)
  return json(request, { jobId: job.id, taskId, status: 'processing' })
}

Deno.serve(async (request) => {
  try {
    return await handleRequest(request)
  } catch (error) {
    // Keep CORS headers on unexpected failures so the client can show a useful error.
    console.error('[generate-music] Erro inesperado:', error)
    return json(request, { error: 'Erro interno ao processar a geracao.' }, 500)
  }
})
