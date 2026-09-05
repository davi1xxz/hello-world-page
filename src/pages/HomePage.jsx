import { ArrowRight, AudioLines, Music, PenLine } from 'lucide-react'
import { useState } from 'react'
import { TrackRow } from '../components/TrackRow'

const musicStyles = ['Trap', 'Funk', 'Rap / Drill', 'Pagode', 'Sertanejo', 'Samba', 'Rock', 'Pop', 'Eletrônico', 'Hino de Torcida']

export function HomePage({ tracks, onPlay, onExpandPlayer, currentTrack, playing, onAction, onNavigate, onSelectTemplate, onShare, onDownload, likedTrackIds = new Set(), onToggleLike, onTogglePublic }) {
  const [quickInput, setQuickInput] = useState('')
  const hasTracks = tracks.length > 0

  const handleQuickSubmit = (event) => {
    event.preventDefault()
    if (quickInput.trim()) onSelectTemplate?.(quickInput, '')
    onNavigate('studio')
  }

  return (
    <div className="home-dashboard">
      <section className="dashboard-welcome">
        <div className="welcome-header">
          <h1 className="welcome-title">Dê voz à <span>sua torcida.</span></h1>
          <p className="welcome-sub">Transforme uma ideia em um hino, canto ou hit — para o próximo jogo ou para a eternidade.</p>
        </div>

        <form className="quick-compose-bar" onSubmit={handleQuickSubmit}>
          <div className="quick-input-wrap">
            <AudioLines size={16} className="compose-spark" />
            <textarea rows={3} placeholder="Descreva a música que você quer criar..." value={quickInput} onChange={event => setQuickInput(event.target.value)} aria-label="Descreva sua ideia musical" />
          </div>
          <button type="submit" className="quick-compose-btn"><Music size={15} /><span>Compor</span></button>
        </form>

        <div className="style-marquee" aria-label="Estilos musicais disponíveis">
          <span className="style-marquee-label">ESTILOS</span>
          <div className="style-marquee-viewport">
            <div className="style-marquee-track">
              {[...musicStyles, ...musicStyles, ...musicStyles, ...musicStyles].map((style, index) => (
                <button
                  key={`${style}-${index}`}
                  type="button"
                  tabIndex={index >= musicStyles.length ? -1 : undefined}
                  aria-hidden={index >= musicStyles.length || undefined}
                  onClick={() => { onSelectTemplate?.('', style); onNavigate('studio') }}
                >
                  {style}<i aria-hidden="true">•</i>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="community-feed-section">
        <div className="section-head-clean">
          <div>
            <h3>{hasTracks ? 'Últimas criações' : 'Comece pelo primeiro som'}</h3>
            <p className="section-sub-clean">{hasTracks ? 'As três faixas mais recentes do seu estúdio.' : 'Tudo que você criar aparecerá aqui.'}</p>
          </div>
        </div>

        {!hasTracks ? (
          <div className="home-empty-card">
            <div className="home-empty-icon"><PenLine size={22} /></div>
            <div>
              <span>PRIMEIRA CRIAÇÃO</span>
              <h2>Comece com uma ideia simples.</h2>
              <p>Conte o clima, a história ou o momento que a sua torcida quer cantar.</p>
            </div>
            <button type="button" onClick={() => onNavigate('studio')}>Abrir estúdio <ArrowRight size={15} /></button>
          </div>
        ) : (
          <div className="track-list-wrapper">
            <div className="track-list">
              {tracks.slice(0, 3).map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={index}
                  active={currentTrack?.id === track.id}
                  playing={playing}
                  onPlay={onPlay}
                  onExpand={onExpandPlayer}
                  onAction={onAction}
                  liked={likedTrackIds.has(track.id)}
                  onToggleLike={onToggleLike}
                  onTogglePublic={onTogglePublic}
                  onShare={onShare}
                  onDownload={onDownload}
                  featured={index === 0}
                />
              ))}
            </div>
            {tracks.length > 3 && <button className="home-library-link" onClick={() => onNavigate('library')}>Ver todas na biblioteca <ArrowRight size={14} /></button>}
          </div>
        )}
      </section>
    </div>
  )
}
