import { Fragment, useState } from 'react'
import { ArrowRight, Filter, List, Search, X } from 'lucide-react'
import { CreateConsole } from '../components/CreateConsole'
import { TrackRow } from '../components/TrackRow'

export function StudioPage({ tracks, generationJobs = [], onGenerate, onPlay, onExpandPlayer, currentTrack, playing, onAction, onNavigate, initialPrompt, initialStyle, onShare, onDownload, likedTrackIds = new Set(), onToggleLike, onTogglePublic }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('newest') // 'newest' | 'oldest' | 'likes'

  const pendingJobs = generationJobs.filter(job => job.status === 'queued' || job.status === 'processing')
  const pendingTrackIds = new Set(tracks.filter(track => pendingJobs.some(job => job.id === track.generationJobId)).map(track => track.id))
  
  const allReadyTracks = tracks.filter(track => !pendingTrackIds.has(track.id))
  
  const filteredTracks = allReadyTracks.filter(track => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (track.title || '').toLowerCase().includes(q) ||
      (track.subtitle || '').toLowerCase().includes(q) ||
      (track.style || '').toLowerCase().includes(q)
    )
  }).sort((a, b) => {
    if (sortBy === 'likes') return (b.likes || 0) - (a.likes || 0)
    if (sortBy === 'oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  })

  return (
    <div className="studio-layout">
      <div className="studio-main-col">
        {/* Console de Criação com Modos Simples e Personalizável */}
        <CreateConsole
          onGenerate={onGenerate}
          initialPrompt={initialPrompt}
          initialStyle={initialStyle}
        />
      </div>

      {/* Coluna Lateral / Workspace de Faixas */}
      <aside className="studio-side-col">
        {/* Cabeçalho Estilo Suno Workspaces */}
        <div className="suno-workspace-header">
          <div className="suno-workspace-title-row">
            <span className="suno-breadcrumb">
              <strong>Workspaces</strong> <i>›</i> Meu Estúdio
            </span>
          </div>

          <div className="suno-workspace-toolbar">
            <div className="suno-search-box">
              <Search size={14} />
              <input
                type="text"
                placeholder="Buscar faixas..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="suno-clear-search"
                  onClick={() => setSearchQuery('')}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="suno-toolbar-actions">
              <button
                type="button"
                className="suno-tool-btn"
                onClick={() => setFilterOpen(v => !v)}
              >
                <Filter size={13} />
                <span>Filtros</span>
              </button>

              <select
                className="suno-sort-select"
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                aria-label="Ordenar faixas"
              >
                <option value="newest">Mais recentes</option>
                <option value="likes">Mais curtidas</option>
                <option value="oldest">Mais antigas</option>
              </select>

              <button
                type="button"
                className="suno-view-mode-btn"
                onClick={() => onNavigate('library')}
                title="Ver todas as faixas na biblioteca"
              >
                <List size={14} />
                <span>Ver tudo</span>
              </button>
            </div>
          </div>
        </div>

        <div className="side-section-header mobile-only">
          <h3>Últimas criações</h3>
          <button className="see-all-btn" onClick={() => onNavigate('library')}>
            Ver todas <ArrowRight size={13} />
          </button>
        </div>

        <div className="studio-recent-list">
          {pendingJobs.map(job => {
            const deliveredTracks = tracks.filter(track => track.generationJobId === job.id).slice(0, 2)
            return (
              <Fragment key={job.id}>
                {deliveredTracks.map((track, index) => (
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
                  />
                ))}
                {Array.from({ length: Math.max(0, 2 - deliveredTracks.length) }, (_, slot) => (
                  <PendingTrackRow key={`${job.id}-${slot}`} />
                ))}
              </Fragment>
            )
          })}
          {filteredTracks.map((track, index) => (
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
            />
          ))}
          {filteredTracks.length === 0 && pendingJobs.length === 0 && (
            <div className="suno-empty-feed">
              <p>Nenhuma faixa encontrada com os filtros atuais.</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function PendingTrackRow() {
  return (
    <article className="track-row pending-track-row" aria-label="Faixa em criação" aria-busy="true">
      <span className="track-number pending-number skeleton-shimmer" aria-hidden="true" />
      <span className="pending-cover skeleton-shimmer" aria-hidden="true" />
      <div className="pending-track-copy" aria-hidden="true">
        <span className="pending-title skeleton-shimmer" />
        <span className="pending-subtitle skeleton-shimmer" />
        <span className="pending-tags"><i className="skeleton-shimmer" /><i className="skeleton-shimmer" /></span>
      </div>
      <div className="waveform pending-waveform" aria-hidden="true">
        {Array.from({ length: 16 }, (_, index) => <i key={index} style={{ height: `${8 + (index * 7) % 18}px` }} />)}
      </div>
      <div className="track-data pending-data" aria-hidden="true"><span className="skeleton-shimmer" /></div>
      <div className="pending-actions" aria-hidden="true"><i /><i /><i /></div>
    </article>
  )
}
