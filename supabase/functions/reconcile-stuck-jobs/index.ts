import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4'
import { persistGeneratedMedia } from '../_shared/persist-generated-media.ts'

const allowedOrigins = new Set([
  'https://flow-hits.web.app',
  'https://flowhits.firebaseapp.com',
  Deno.env.get('APP_ORIGIN') || '',
])

const corsHeaders = (request: Request) => {
  const origin = request.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://flow-hits.web.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    Vary: 'Origin',
  }
}

const json = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } })

const asText = (value: unknown, fallback = '') => typeof value === 'string' ? value.trim() : fallback
const asNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
const timingSafeEqual = (first: string, second: string) => {
  if (first.length !== second.length) return false
  let mismatch = 0
  for (let index = 0; index < first.length; index += 1) mismatch |= first.charCodeAt(index) ^ second.charCodeAt(index)
  return mismatch === 0
}

const extractTracks = (body: Record<string, unknown>, defaultTaskId: string) => {
  const data = (body.data && typeof body.data === 'object' ? body.data : {}) as Record<string, unknown>
  const responseData = (data.response && typeof data.response === 'object' ? data.response : {}) as Record<string, unknown>
  const rawItems = [data.data, data.sunoData, responseData.data, responseData.sunoData]
    .filter(Array.isArray).flat()
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
  const effectiveTaskId = asText(data.task_id ?? data.taskId, defaultTaskId)

  return rawItems.map((item, index) => {
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
  }).filter(Boolean)
}

async function isAuthorized(request: Request, supabaseUrl: string, publishableKey: string, admin: any) {
  const cronSecret = Deno.env.get('CRON_SECRET') || ''
  const providedCronSecret = request.headers.get('x-cron-secret') || ''
  if (cronSecret && timingSafeEqual(cronSecret, providedCronSecret)) return true

  const authHeader = request.headers.get('authorization')
  if (!authHeader) return false
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return false
  const { data: administrator } = await admin.from('administradores').select('user_id').eq('user_id', user.id).maybeSingle()
  return Boolean(administrator)
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  if (request.method !== 'POST') return json(request, { error: 'Método não permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const kieApiKey = Deno.env.get('KIE_API_KEY')
  if (!supabaseUrl || !publishableKey || !serviceRoleKey || !kieApiKey) return json(request, { error: 'Ambiente incompleto.' }, 503)

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  if (!await isAuthorized(request, supabaseUrl, publishableKey, admin)) return json(request, { error: 'Não autorizado.' }, 401)

  try {
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60_000).toISOString()
    const { data: pendingJobs, error: queryError } = await admin
      .from('geracoes')
      .select('id, studio_id, requested_by, title, prompt, style, voice, provider_task_id, status, created_at')
      .in('status', ['processing', 'queued']).not('provider_task_id', 'is', null)
      .lt('created_at', oneMinuteAgo).order('created_at', { ascending: true }).limit(30)
    if (queryError) throw queryError

    let completed = 0
    let failed = 0
    let timedOut = 0
    for (const job of pendingJobs || []) {
      if (!job.provider_task_id) continue
      if (new Date(job.created_at) < new Date(fifteenMinutesAgo)) {
        const { error } = await admin.from('geracoes').update({
          status: 'failed', failure_reason: 'Timeout: tempo limite de geração de 15 minutos excedido no provedor.', completed_at: new Date().toISOString(),
        }).eq('id', job.id).in('status', ['processing', 'queued'])
        if (error) throw error
        await admin.from('creditos_movimentacoes').upsert(
          { studio_id: job.studio_id, amount: 20, reason: 'refund', reference_id: job.id }, { onConflict: 'reference_id,reason' },
        )
        timedOut += 1
        continue
      }

      const recordResponse = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${encodeURIComponent(job.provider_task_id)}`, {
        headers: { Authorization: `Bearer ${kieApiKey}` },
      })
      if (!recordResponse.ok) {
        console.warn(`[reconcile] KIE retornou ${recordResponse.status} para ${job.provider_task_id}`)
        continue
      }
      const record = await recordResponse.json() as Record<string, unknown>
      const status = asText((record.data as Record<string, unknown> | undefined)?.status ?? record.status).toUpperCase()
      const hasFailed = new Set(['CREATE_TASK_FAILED', 'GENERATE_AUDIO_FAILED', 'CALLBACK_EXCEPTION', 'SENSITIVE_WORD_ERROR', 'ERROR', 'FAILED', 'FAIL']).has(status)
      if (hasFailed) {
        const { error } = await admin.from('geracoes').update({
          status: 'failed',
          failure_reason: asText((record.data as Record<string, unknown> | undefined)?.errorMessage ?? record.msg, 'Falha no provedor KIE').slice(0, 500),
          completed_at: new Date().toISOString(),
        }).eq('id', job.id).in('status', ['processing', 'queued'])
        if (error) throw error
        await admin.from('creditos_movimentacoes').upsert(
          { studio_id: job.studio_id, amount: 20, reason: 'refund', reference_id: job.id }, { onConflict: 'reference_id,reason' },
        )
        failed += 1
        continue
      }

      const tracks = extractTracks(record, job.provider_task_id)
      if (!tracks.length || status !== 'SUCCESS') continue
      const persistedTracks = await Promise.all(tracks.map((track) => persistGeneratedMedia(admin, job.id, track)))
      const { error: tracksError } = await admin.from('faixas').upsert(persistedTracks.map((track) => ({
        ...track, title: job.title || track.title, generation_job_id: job.id, studio_id: job.studio_id,
        created_by: job.requested_by, style: job.style, voice: job.voice, status: 'ready',
      })), { onConflict: 'generation_job_id,provider_item_id' })
      if (tracksError) throw tracksError
      const { error: completionError } = await admin.from('geracoes').update({
        status: 'completed', completed_at: new Date().toISOString(), provider_response: { code: record.code ?? 200, tracks: tracks.length },
      }).eq('id', job.id).in('status', ['processing', 'queued'])
      if (completionError) throw completionError
      completed += 1
    }
    return json(request, { success: true, total_checked: pendingJobs?.length || 0, completed, failed, timed_out: timedOut })
  } catch (error) {
    console.error('[reconcile] Erro inesperado:', error)
    return json(request, { error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500)
  }
})
