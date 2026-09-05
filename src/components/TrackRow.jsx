import { Download, Globe2, Heart, Pause, Play, Radio, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'

const hash = (value) => Array.from(String(value)).reduce((total, character) => ((total << 5) - total + character.charCodeAt(0)) | 0, 0) >>> 0

export function TrackRow({ track, index, active, playing, onPlay, onExpand, onAction, onTogglePublic, onToggleLike, liked = false, onShare, onDownload, featured = false }) {
  const isPlayingThis = playing && active
  const openOrPlay = () => isPlayingThis ? onExpand?.(track) : onPlay(track)

  return (
    <article className={`track-row ${active ? 'active' : ''} ${isPlayingThis ? 'is-playing' : ''} ${featured ? 'featured' : ''}`}>
      <span className="track-number">{String(index + 1).padStart(2, '0')}</span>

      <button className={`cover-art palette-${track.palette}`} onClick={() => onPlay(track)} aria-label={`${isPlayingThis ? 'Pausar' : 'Tocar'} ${track.title}`}>
        <CoverGraphic imageUrl={track.coverUrl} seed={track.seed} label={track.title} />
        <span className="cover-play">{isPlayingThis ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</span>
        {track.status && <i className="track-badge-status">{track.status}</i>}
      </button>

      <div className="track-copy" onClick={openOrPlay}>
        <h3>{track.title}</h3>
        <p>{track.subtitle}</p>
        <div className="track-tags">
          <span>{track.style}</span>
          <span>{track.voice}</span>
        </div>
      </div>
      <div className="waveform" aria-hidden="true" onClick={openOrPlay}>
        {Array.from({ length: 32 }).map((_, itemIndex) => (
          <i key={itemIndex} style={{ height: `${12 + ((itemIndex * 19 + track.seed * 13) % 32)}px` }} />
        ))}
      </div>
      <div className="track-data"><span>{track.duration}</span><small><Radio size={10} />{track.plays > 999 ? `${(track.plays / 1000).toFixed(1)}k` : track.plays}</small></div>

      <div className="track-actions">
        {onTogglePublic && track.mine !== false && (
          <button
            aria-label={track.isPublic ? 'Remover da biblioteca pública' : 'Publicar na biblioteca'}
            title={track.isPublic ? 'Pública na comunidade (Clique para despublicar)' : 'Tornar pública'}
            className={`track-action-btn action-public ${track.isPublic ? 'active is-public' : ''}`}
            onClick={event => {
              event.stopPropagation()
              event.currentTarget.blur()
              onTogglePublic(track)
            }}
            onPointerUp={event => event.currentTarget.blur()}
          >
            <Globe2 size={15} />
          </button>
        )}
        <button
          aria-label={liked ? 'Remover dos favoritos' : 'Favoritar faixa'}
          title={liked ? 'Favoritada' : 'Favoritar'}
          className={`track-action-btn action-like ${liked ? 'active is-liked' : ''}`}
          onClick={event => {
            event.stopPropagation()
            event.currentTarget.blur()
            if (onToggleLike) onToggleLike(track)
            else onAction?.('Não foi possível alterar a curtida.')
          }}
          onPointerUp={event => event.currentTarget.blur()}
        >
          <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
        </button>
        <button
          aria-label="Compartilhar"
          title="Compartilhar"
          className="track-action-btn action-share"
          onClick={event => {
            event.stopPropagation()
            event.currentTarget.blur()
            onShare?.(track)
          }}
          onPointerUp={event => event.currentTarget.blur()}
        >
          <Share2 size={15} />
        </button>
        <button
          aria-label="Baixar"
          title="Baixar áudio"
          className="track-action-btn action-download"
          onClick={event => {
            event.stopPropagation()
            event.currentTarget.blur()
            onDownload?.(track)
          }}
          onPointerUp={event => event.currentTarget.blur()}
        >
          <Download size={15} />
        </button>
      </div>
    </article>
  )
}

export function CoverGraphic({ imageUrl, seed = 1, label = 'FlowHits' }) {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [imageUrl])

  if (imageUrl && !imageFailed) {
    return <span className="cover-graphic"><img src={imageUrl} alt={`Capa de ${label}`} onError={() => setImageFailed(true)} /></span>
  }

  const value = hash(`${label}-${seed}`)
  const hue = value % 360
  const accent = (hue + 80 + (value % 60)) % 360
  const initials = String(label).trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'FH'
  const gradientId = `cover-${seed}-${value}`
  const angle = value % 180

  return (
    <span className="cover-graphic">
      <svg viewBox="0 0 100 100" role="img" aria-label={`Capa de ${label}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop stopColor={`hsl(${hue} 82% 53%)`} /><stop offset="1" stopColor={`hsl(${accent} 84% 28%)`} /></linearGradient>
          <filter id={`${gradientId}-blur`}><feGaussianBlur stdDeviation="8" /></filter>
        </defs>
        <rect width="100" height="100" fill={`url(#${gradientId})`} />
        <circle cx={20 + (value % 55)} cy={18 + ((value >> 5) % 52)} r={26 + ((value >> 10) % 19)} fill={`hsl(${accent} 92% 68%)`} opacity=".58" filter={`url(#${gradientId}-blur)`} />
        <path d={`M-15 ${78 - (value % 24)} L115 ${12 + ((value >> 4) % 30)}`} stroke="rgba(255,255,255,.38)" strokeWidth="3" transform={`rotate(${angle} 50 50)`} />
        <path d="M0 76 C25 52 50 93 100 39 L100 100 L0 100 Z" fill="rgba(5,9,25,.34)" />
        <text x="9" y="87" fill="white" fontSize="24" fontWeight="900" fontFamily="Arial, sans-serif" letterSpacing="-2">{initials}</text>
        <text x="10" y="17" fill="rgba(255,255,255,.86)" fontSize="6" fontWeight="700" letterSpacing="1">FLOWHITS</text>
      </svg>
    </span>
  )
}
