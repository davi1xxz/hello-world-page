import { useEffect, useRef, useState } from 'react'
import { Download, Heart, Maximize2, Pause, Play, Repeat2, Share2, SkipBack, SkipForward, Volume2, X } from 'lucide-react'
import { CoverGraphic } from './TrackRow'

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

export function PlayerBar({ track, playing, expanded, onExpand, onClose, onDismiss, onToggle, onAction, onPrevious, onNext, onEnded, onShare, onDownload, liked = false, onToggleLike }) {
  const [repeat, setRepeat] = useState(false)
  const [volume, setVolume] = useState(70)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isDismissing, setIsDismissing] = useState(null)
  const dragStartX = useRef(null)
  const dragStartY = useRef(null)
  const hasMoved = useRef(false)
  const audioRef = useRef(null)

  const parseDuration = (str) => {
    if (typeof str !== 'string') return 0
    const parts = str.split(':').map(Number)
    if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0
  }

  const hasAudio = Boolean(track?.audioUrl)
  const effectiveDuration = duration || parseDuration(track?.duration) || 0
  const progress = effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0

  useEffect(() => {
    setCurrentTime(0)
    setDuration(0)
  }, [track?.id])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !hasAudio) return
    if (playing) audio.play().catch(() => onAction('Nao foi possivel reproduzir este audio.'))
    else audio.pause()
  }, [hasAudio, onAction, playing, track?.id])

  useEffect(() => {
    if (!expanded) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [expanded, onClose])

  if (!track) return null

  const togglePlayback = () => {
    if (!hasAudio) return onAction('Esta faixa ainda nao possui audio pronto para reproduzir.')
    onToggle()
  }

  const handleEnded = () => {
    if (repeat && audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {})
      return
    }
    onEnded?.()
  }

  const seek = (event) => {
    const nextTime = Number(event.target.value)
    if (!audioRef.current || !Number.isFinite(nextTime)) return
    audioRef.current.currentTime = nextTime
    setCurrentTime(nextTime)
  }

  const stopExpansion = (event) => event.stopPropagation()

  // --- Gesto Swipe to Dismiss (Arrastar para fechar) ---
  const handlePointerDown = (e) => {
    if (e.target.closest('button, input, a')) return
    dragStartX.current = e.clientX
    dragStartY.current = e.clientY
    hasMoved.current = false
    setIsDragging(false)
  }

  const handlePointerMove = (e) => {
    if (dragStartX.current === null || isDismissing) return
    const deltaX = e.clientX - dragStartX.current
    const deltaY = e.clientY - dragStartY.current

    if (!isDragging && Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
      setIsDragging(true)
      hasMoved.current = true
    }

    if (isDragging) {
      setDragOffset(deltaX)
    }
  }

  const handlePointerUp = () => {
    if (isDismissing) return
    if (isDragging) {
      if (Math.abs(dragOffset) > 65) {
        const dir = dragOffset > 0 ? 'right' : 'left'
        setIsDismissing(dir)
        setIsDragging(false)
        setTimeout(() => {
          if (onDismiss) onDismiss()
          else if (onClose) onClose()
          setIsDismissing(null)
          setDragOffset(0)
        }, 220)
      } else {
        setDragOffset(0)
        setIsDragging(false)
      }
    }
    dragStartX.current = null
  }

  const handleTouchStart = (e) => {
    if (e.target.closest('button, input, a')) return
    const touch = e.touches[0]
    dragStartX.current = touch.clientX
    dragStartY.current = touch.clientY
    hasMoved.current = false
    setIsDragging(false)
  }

  const handleTouchMove = (e) => {
    if (dragStartX.current === null || isDismissing) return
    const touch = e.touches[0]
    const deltaX = touch.clientX - dragStartX.current
    const deltaY = touch.clientY - dragStartY.current

    if (!isDragging && Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
      setIsDragging(true)
      hasMoved.current = true
    }

    if (isDragging) {
      setDragOffset(deltaX)
    }
  }

  const handleTouchEnd = () => {
    handlePointerUp()
  }

  const handleBarClick = () => {
    if (hasMoved.current || Math.abs(dragOffset) > 5) return
    onExpand?.()
  }

  const handleDismissButton = (e) => {
    e.stopPropagation()
    setIsDismissing('right')
    setTimeout(() => {
      if (onDismiss) onDismiss()
      else if (onClose) onClose()
      setIsDismissing(null)
    }, 200)
  }

  return (
    <>
    <div className="floating-player-wrap">
      {hasAudio && (
        <audio
          ref={audioRef}
          src={track.audioUrl}
          preload="auto"
          onLoadedMetadata={(event) => {
            if (event.currentTarget.duration && Number.isFinite(event.currentTarget.duration)) {
              setDuration(event.currentTarget.duration)
            }
          }}
          onDurationChange={(event) => {
            if (event.currentTarget.duration && Number.isFinite(event.currentTarget.duration)) {
              setDuration(event.currentTarget.duration)
            }
          }}
          onCanPlay={(event) => {
            if (!duration && event.currentTarget.duration && Number.isFinite(event.currentTarget.duration)) {
              setDuration(event.currentTarget.duration)
            }
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
          onEnded={handleEnded}
          onError={() => onAction('O áudio desta faixa não está mais disponível.')}
        />
      )}
      <footer
        className={`island-player-bar ${isDragging ? 'is-dragging' : ''}`}
        onClick={handleBarClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          transform: isDismissing
            ? `translateX(${isDismissing === 'right' ? '120vw' : '-120vw'})`
            : isDragging
            ? `translateX(${dragOffset}px)`
            : 'translateX(0)',
          opacity: isDismissing ? 0 : isDragging ? Math.max(0.1, 1 - Math.abs(dragOffset) / 220) : 1,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease',
          touchAction: 'pan-y',
        }}
        aria-label="Abrir player expandido (arraste para os lados para fechar)"
      >
        {/* Barra de progresso neon ultra fina no topo da ilha */}
        <div className="island-scrubber-progress">
          <div className="island-scrubber-fill" style={{ width: `${progress}%` }}></div>
        </div>

        <div className="player-inner">
          {/* Informações da Faixa */}
          <div className="now-playing-info">
            <div className={`mini-cover palette-${track.palette}`}>
              <CoverGraphic imageUrl={track.coverUrl} seed={track.seed} label={track.title} />
            </div>
            <div className="now-playing-text">
              <span className={`live-status-tag ${playing ? 'is-playing' : 'is-paused'}`}>
                <i className={`pulse-dot ${playing ? 'active' : 'paused'}`}></i>
                {playing ? 'TOCANDO' : 'PAUSADO'}
              </span>
              <strong>{track.title}</strong>
              <span>{track.subtitle}</span>
            </div>
            <button
              aria-label={liked ? 'Remover dos favoritos' : 'Favoritar'}
              className={`like-btn ${liked ? 'is-liked' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                onToggleLike?.()
              }}
            >
              <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
            </button>
          </div>

          {/* Controles Centrais + Timeline Scrubber no Desktop */}
          <div className="player-center-group" onClick={stopExpansion}>
            <div className="player-controls">
              <button
                aria-label="Repetir"
                className={`ctrl-sub-btn ${repeat ? 'active' : ''}`}
                onClick={() => {
                  setRepeat((v) => !v)
                  onAction(repeat ? 'Repetição desativada.' : 'Repetição ativada.')
                }}
              >
                <Repeat2 size={15} />
              </button>

              <button aria-label="Anterior" className="ctrl-step-btn" onClick={onPrevious}>
                <SkipBack size={16} fill="currentColor" />
              </button>

              <button
                className="ctrl-main-play"
                aria-label={playing ? 'Pausar' : 'Tocar'}
                onClick={togglePlayback}
              >
                {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </button>

              <button aria-label="Próxima" className="ctrl-step-btn" onClick={onNext}>
                <SkipForward size={16} fill="currentColor" />
              </button>
            </div>

            {/* Linha do Tempo Desktop Estilo Suno */}
            <div className="suno-desktop-timeline">
              <span className="suno-timeline-time">{formatTime(currentTime)}</span>
              <div className="suno-timeline-bar-wrap">
                <input
                  type="range"
                  min="0"
                  max={effectiveDuration || 100}
                  step="0.1"
                  value={currentTime}
                  onChange={seek}
                  className="suno-timeline-slider"
                  aria-label="Progresso da música"
                />
                <div
                  className="suno-timeline-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="suno-timeline-time">
                {effectiveDuration ? formatTime(effectiveDuration) : (track.duration || '0:00')}
              </span>
            </div>
          </div>

          {/* Ações e Volume (Desktop) */}
          <div className="player-actions-end" onClick={stopExpansion}>
            <span className="track-time-label">{formatTime(currentTime)} / {duration ? formatTime(duration) : track.duration}</span>
            <button
              aria-label="Expandir player"
              className="action-icon-btn"
              onClick={onExpand}
            >
              <Maximize2 size={15} />
            </button>
            <button
              aria-label="Compartilhar"
              className="action-icon-btn"
              onClick={() => onShare?.(track)}
            >
              <Share2 size={15} />
            </button>
            <button
              aria-label="Baixar áudio"
              className="action-icon-btn"
              onClick={() => onDownload?.(track)}
            >
              <Download size={15} />
            </button>
            <div className="volume-slider-wrap">
              <Volume2 size={15} />
              <input
                className="volume-slider"
                aria-label="Volume"
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
              />
            </div>
            <button
              aria-label="Fechar player"
              className="action-icon-btn player-dismiss-btn"
              onClick={handleDismissButton}
              title="Fechar player"
            >
              <X size={15} />
            </button>
          </div>

          {/* Botão fechar sutil no mobile */}
          <button
            aria-label="Fechar player"
            className="mobile-player-dismiss-btn"
            onClick={handleDismissButton}
            title="Fechar player (arraste para os lados)"
          >
            <X size={14} />
          </button>
        </div>
      </footer>
    </div>

    {expanded && (
      <div className="expanded-player-backdrop" onClick={onClose}>
        <section className="expanded-player" role="dialog" aria-modal="true" aria-label={`Player de ${track.title}`} onClick={stopExpansion}>
          <button className="expanded-player-close" aria-label="Fechar player" onClick={onClose}><X size={20} /></button>

          <div className="expanded-player-visual">
            <div className={`expanded-cover palette-${track.palette}`}>
              <CoverGraphic imageUrl={track.coverUrl} seed={track.seed} label={track.title} />
            </div>
            <div className="expanded-track-heading">
              <span className="expanded-eyebrow">{playing ? 'TOCANDO AGORA' : 'EM PAUSA'}</span>
              <h2>{track.title}</h2>
              <p>{track.subtitle}</p>
              <div className="expanded-track-tags"><span>{track.style}</span><span>{track.voice}</span></div>
            </div>

            <div className="expanded-timeline">
              <input aria-label="Progresso da música" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={seek} disabled={!duration} />
              <div><span>{formatTime(currentTime)}</span><span>{duration ? formatTime(duration) : track.duration}</span></div>
            </div>

            <div className="expanded-controls">
              <button aria-label="Anterior" onClick={onPrevious}><SkipBack size={22} fill="currentColor" /></button>
              <button className="expanded-main-play" aria-label={playing ? 'Pausar' : 'Tocar'} onClick={togglePlayback}>
                {playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
              </button>
              <button aria-label="Próxima" onClick={onNext}><SkipForward size={22} fill="currentColor" /></button>
            </div>

            <div className="expanded-secondary-actions">
              <button className={liked ? 'active' : ''} onClick={onToggleLike}><Heart size={17} fill={liked ? 'currentColor' : 'none'} /> {liked ? 'Favoritado' : 'Favoritar'}</button>
              <button onClick={() => onShare?.(track)}><Share2 size={17} /> Compartilhar</button>
              <button onClick={() => onDownload?.(track)}><Download size={17} /> Baixar</button>
            </div>
          </div>

          <div className="expanded-lyrics-panel">
            <div className="expanded-lyrics-header"><span>LETRA</span><i>Letra original</i></div>
            {track.lyrics ? <div className="expanded-lyrics-text">{track.lyrics}</div> : <div className="expanded-lyrics-empty">A letra não está disponível para esta faixa.</div>}
          </div>
        </section>
      </div>
    )}
    </>
  )
}
