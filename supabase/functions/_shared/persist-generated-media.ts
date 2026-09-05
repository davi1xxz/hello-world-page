type GeneratedTrack = {
  provider_item_id: string
  audio_url: string
  audio_path: string
  cover_url?: string | null
  cover_path?: string | null
}

const safePart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)

const extensionFor = (url: string, contentType: string, fallback: string) => {
  const urlExtension = (() => {
    try {
      return new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase()
    } catch {
      return undefined
    }
  })()
  if (urlExtension) return urlExtension
  if (contentType.includes('mpeg')) return 'mp3'
  if (contentType.includes('wav')) return 'wav'
  if (contentType.includes('ogg')) return 'ogg'
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('webp')) return 'webp'
  return fallback
}

async function copyToStorage(
  admin: any,
  bucket: 'faixas-audio' | 'faixas-capas',
  source: string,
  destinationBase: string,
  maxBytes: number,
  fallbackExtension: string,
) {
  const parsed = new URL(source)
  if (parsed.protocol !== 'https:') throw new Error('URL de mídia do provedor não é HTTPS.')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
  try {
    const response = await fetch(source, { signal: controller.signal })
    if (!response.ok) throw new Error(`Download da mídia falhou (${response.status}).`)
    const size = Number(response.headers.get('content-length') || 0)
    if (size > maxBytes) throw new Error('Arquivo de mídia excede o limite permitido.')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) throw new Error('Arquivo de mídia excede o limite permitido.')

    const contentType = response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream'
    const extension = extensionFor(source, contentType, fallbackExtension)
    const path = `${destinationBase}.${extension}`
    const { error } = await admin.storage.from(bucket).upload(path, bytes, {
      contentType,
      upsert: true,
      cacheControl: '31536000',
    })
    if (error) throw error
    const { data } = admin.storage.from(bucket).getPublicUrl(path)
    return { path, url: data.publicUrl }
  } finally {
    clearTimeout(timeout)
  }
}

// Preserves the provider URL on an isolated storage failure so a successful
// generation is never discarded; the edge-function log makes it actionable.
export async function persistGeneratedMedia(admin: any, generationId: string, track: GeneratedTrack) {
  const key = `generated/${safePart(generationId)}/${safePart(track.provider_item_id)}`
  const result = { ...track }

  try {
    const audio = await copyToStorage(admin, 'faixas-audio', track.audio_url, `${key}/audio`, 50 * 1024 * 1024, 'mp3')
    result.audio_path = audio.path
    result.audio_url = audio.url
  } catch (error) {
    console.error('[media-persistence] Não foi possível persistir o áudio:', error)
  }

  if (track.cover_url) {
    try {
      const cover = await copyToStorage(admin, 'faixas-capas', track.cover_url, `${key}/cover`, 10 * 1024 * 1024, 'jpg')
      result.cover_path = cover.path
      result.cover_url = cover.url
    } catch (error) {
      console.error('[media-persistence] Não foi possível persistir a capa:', error)
    }
  }

  return result
}
