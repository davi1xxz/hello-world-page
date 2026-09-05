import { Music, Play } from 'lucide-react'
import { useRef } from 'react'

const formatPlays = (plays) => {
  const count = Number(plays) || 0
  if (count > 999) return `${(count / 1000).toFixed(1)} mil reproduções`
  return `${count} ${count === 1 ? 'reprodução' : 'reproduções'}`
}

export function StyleCarousel({ onPlay, tracks = [] }) {
  const scrollRef = useRef(null)
  const dragRef = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false })
  const mostPlayedTracks = [...tracks]
    .sort((first, second) => {
      const playsDiff = (Number(second.plays) || 0) - (Number(first.plays) || 0)
      if (playsDiff !== 0) return playsDiff
      return new Date(second.createdAt || 0) - new Date(first.createdAt || 0)
    })
    .slice(0, 5)

  const handlePointerDown = (event) => {
    if (!scrollRef.current) return

    dragRef.current = {
      active: true,
      startX: event.clientX,
      scrollLeft: scrollRef.current.scrollLeft,
      moved: false,
    }
    scrollRef.current.setPointerCapture?.(event.pointerId)
  }

  const handlePointerMove = (event) => {
    if (!scrollRef.current || !dragRef.current.active) return

    const deltaX = event.clientX - dragRef.current.startX
    if (Math.abs(deltaX) > 6) dragRef.current.moved = true
    scrollRef.current.scrollLeft = dragRef.current.scrollLeft - deltaX
  }

  const stopDragging = (event) => {
    scrollRef.current?.releasePointerCapture?.(event.pointerId)
    dragRef.current.active = false
  }

  const handleTrackClick = (track) => {
    if (dragRef.current.moved) return
    onPlay?.(track)
  }

  return (
    <section className="best-of-section" aria-label="Faixas mais ouvidas">
      <div className="best-of-header">
        <div className="best-of-heading">
          <h2 className="best-of-title">Mais ouvidas</h2>
        </div>
      </div>

      {mostPlayedTracks.length === 0 ? (
        <div className="most-played-empty">
          <Music size={20} />
          <p>Ainda não há faixas públicas para classificar.</p>
        </div>
      ) : (
        <div className="best-of-carousel-wrap">
          <div
            ref={scrollRef}
            className="best-of-scroll-track"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            onPointerLeave={stopDragging}
          >
            {mostPlayedTracks.map((track, index) => (
              <button
                key={track.id}
                type="button"
                className="best-of-card-item most-played-card"
                onClick={() => handleTrackClick(track)}
                aria-label={`Tocar ${track.title}, posição ${index + 1}`}
              >
                <div className="best-of-stack-wrap">
                  <div className="best-of-stack-layer layer-2" />
                  <div className="best-of-stack-layer layer-1" />
                  <div className="best-of-card-main most-played-cover">
                    {track.coverUrl ? (
                      <img src={track.coverUrl} alt={`Capa de ${track.title}`} />
                    ) : (
                      <Music size={34} aria-hidden="true" />
                    )}
                    <span className="most-played-rank">#{index + 1}</span>
                    <span className="most-played-play"><Play size={16} fill="currentColor" /></span>
                  </div>
                </div>

                <div className="best-of-info">
                  <h3 className="best-of-info-title">{track.title}</h3>
                  <p className="best-of-info-sub">{formatPlays(track.plays)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
