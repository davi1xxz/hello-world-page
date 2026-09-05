import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Compass, Disc3, Globe2, Heart, Library, Music, Search, Sparkles, X } from 'lucide-react'
import { TrackRow } from '../components/TrackRow'
import { StyleCarousel } from '../components/StyleCarousel'

const copy = {
  library: {
    eyebrow: 'SUA COLEÇÃO',
    title: 'Biblioteca de Faixas',
    text: 'Acesse todas as músicas, hinos e hits criados.',
    icon: Library,
  },
  explore: {
    eyebrow: 'COMUNIDADE FLOWHITS',
    title: 'Explorar Faixas',
    text: 'Descubra músicas, hinos e versões compartilhadas publicamente pela comunidade.',
    icon: Compass,
  },
  plans: {
    eyebrow: 'RECARGA E PLANOS',
    title: 'Créditos de Criação',
    text: 'Recarregue seus créditos ou assine para desbloquear áudio sem perdas em 48kHz.',
    icon: Disc3,
  },
}

export function CollectionPage({
  page,
  tracks = [],
  publicTracks = [],
  onPlay,
  onExpandPlayer,
  currentTrack,
  playing,
  onNavigate,
  onOpenPricing,
  onTogglePublic,
  onToggleLike,
  likedTrackIds = new Set(),
  onShare,
  onDownload,
  credits = 0,
  onAction,
}) {
  const [filter, setFilter] = useState('all') // 'all' | 'public' | 'favorites'
  const [selectedGenre, setSelectedGenre] = useState(null)
  const [sortBy, setSortBy] = useState('recent')
  const [sortOpen, setSortOpen] = useState(false)
  const [query, setQuery] = useState('')
  const sortControlRef = useRef(null)

  useEffect(() => {
    if (!sortOpen) return undefined

    const closeOnOutsideClick = (event) => {
      if (!sortControlRef.current?.contains(event.target)) setSortOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [sortOpen])

  const content = copy[page] || copy.library
  const Icon = content.icon
  const isExplore = page === 'explore'
  const activeTracks = isExplore ? publicTracks : tracks

  // Contadores para os filtros
  const countAll = activeTracks.length
  const countPublic = activeTracks.filter((t) => t.isPublic).length
  const countFavorites = activeTracks.filter((t) => likedTrackIds.has(t.id)).length

  // Filtragem composta
  const filteredTracks = activeTracks
    .filter((track) => {
      // Busca textual
      const q = query.trim().toLowerCase()
      const matchesSearch =
        !q ||
        (track.title || '').toLowerCase().includes(q) ||
        (track.subtitle || '').toLowerCase().includes(q) ||
        (track.style || '').toLowerCase().includes(q)

      if (!matchesSearch) return false

      // Filtro por gênero do carrossel Best Of
      if (selectedGenre) {
        const styleText = (track.style || '').toLowerCase()
        const titleText = (track.title || '').toLowerCase()
        const g = selectedGenre.toLowerCase()
        if (!styleText.includes(g) && !titleText.includes(g)) return false
      }

      // Filtro de aba/chips
      if (filter === 'public') return track.isPublic
      if (filter === 'favorites') return likedTrackIds.has(track.id)
      return true
    })
    .sort((first, second) => {
      if (sortBy === 'liked') {
        const diff = (second.likes || 0) - (first.likes || 0)
        if (diff !== 0) return diff
      }
      if (sortBy === 'oldest') {
        const timeDiff = new Date(first.createdAt || 0) - new Date(second.createdAt || 0)
        if (timeDiff !== 0) return timeDiff
        return String(first.id).localeCompare(String(second.id))
      }
      const timeDiff = new Date(second.createdAt || 0) - new Date(first.createdAt || 0)
      if (timeDiff !== 0) return timeDiff
      return String(second.id).localeCompare(String(first.id))
    })

  // Tocar a primeira faixa correspondente a um gênero
  return (
    <div className="collection-page">
      {/* Hero Header */}
      <div className="collection-hero-card">
        <div className="hero-text">
          {page !== 'library' && page !== 'explore' && <span className="overline">{content.eyebrow}</span>}
          <h1>{content.title}</h1>
          <p>{content.text}</p>
        </div>
        <div className="hero-icon-box">
          <Icon size={36} />
        </div>
      </div>

      {page === 'plans' ? (
        <div className="plans-showcase">
          <div className="plan-card">
            <div className="plan-badge">SALDO ATUAL</div>
            <h3>{credits} créditos</h3>
            <p>Saldo disponível no seu estúdio para gerar novos hits.</p>
          </div>
          <div className="plan-card featured">
            <div className="plan-badge">ASSINATURAS & RECARGAS</div>
            <h3>Planos Oficiais FlowHits</h3>
            <div className="plan-price">
              A partir de R$ 24<span>/mês</span>
            </div>
            <p>
              Assine os planos Lite, Plus ou Pro com 20% OFF no anual, ou compre pacotes avulsos a R$ 1,50/crédito.
            </p>
            <button
              className="plan-btn"
              onClick={() => (onOpenPricing ? onOpenPricing() : onNavigate('plans'))}
            >
              <Sparkles size={15} /> Ver Planos & Preços
            </button>
          </div>
        </div>
      ) : (
        <>
          {isExplore && (
            <StyleCarousel
              onPlay={onPlay}
              tracks={activeTracks}
            />
          )}

          {/* Barra de Filtros e Busca */}
          <div className="library-filter-bar">
            <div className="search-pill">
              <Search size={15} />
              <input
                type="text"
                placeholder="Buscar por faixa, estilo ou letra..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setQuery('')}
                  aria-label="Limpar busca"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="filter-chips">
              {isExplore && (
                <button
                  type="button"
                  className={`filter-chip ${filter === 'all' && !selectedGenre ? 'active' : ''}`}
                  onClick={() => {
                    setFilter('all')
                    setSelectedGenre(null)
                  }}
                >
                  Publicadas ({countAll})
                </button>
              )}

              {!isExplore && (
                <button
                  type="button"
                  className={`filter-chip ${filter === 'public' ? 'active' : ''}`}
                  onClick={() => setFilter(filter === 'public' ? 'all' : 'public')}
                >
                  <Globe2 size={13} /> Publicadas ({countPublic})
                </button>
              )}

              <button
                type="button"
                className={`filter-chip ${filter === 'favorites' ? 'active' : ''}`}
                onClick={() => setFilter(filter === 'favorites' ? 'all' : 'favorites')}
              >
                <Heart size={13} /> Favoritas ({countFavorites})
              </button>

              {selectedGenre && (
                <button
                  type="button"
                  className="filter-chip active genre-active-chip"
                  onClick={() => setSelectedGenre(null)}
                  title="Clique para remover o filtro de estilo"
                >
                  <Music size={13} /> Estilo: {selectedGenre} <X size={12} />
                </button>
              )}
            </div>

            {/* Ordenação */}
            <div className="library-sort-control" ref={sortControlRef}>
              <span>Ordenar</span>
              <button
                type="button"
                className="library-sort-trigger"
                onClick={() => setSortOpen((open) => !open)}
              >
                {{ recent: 'Mais recentes', oldest: 'Mais antigas', liked: 'Mais curtidas' }[sortBy]}
                <ChevronDown size={12} />
              </button>
              {sortOpen && (
                <div className="library-sort-menu">
                  {[
                    ['recent', 'Mais recentes'],
                    ['oldest', 'Mais antigas'],
                    ['liked', 'Mais curtidas'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={sortBy === value ? 'active' : ''}
                      onClick={() => {
                        setSortBy(value)
                        setSortOpen(false)
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Listagem de Faixas */}
          <div className="track-list-wrapper">
            <div className="track-table-head">
              <span>#</span>
              <span>FAIXA</span>
              <span>ONDA</span>
              <span>TEMPO</span>
              <span>AÇÕES</span>
            </div>

            {filteredTracks.length === 0 ? (
              <div className="library-empty-state">
                <div className="library-empty-icon">
                  <Music size={26} />
                </div>
                <h3>Nenhuma faixa encontrada</h3>
                <p>
                  {filter === 'public'
                    ? 'Você ainda não publicou nenhuma faixa na comunidade. Clique no ícone de globo em qualquer faixa para torná-la pública.'
                    : filter === 'favorites'
                    ? 'Você ainda não favoritou nenhuma música. Clique no coração de qualquer faixa para salvá-la aqui.'
                    : selectedGenre
                    ? `Nenhuma faixa encontrada para o estilo "${selectedGenre}".`
                    : 'Gere sua primeira música no Estúdio para ouvi-la aqui.'}
                </p>
                {selectedGenre && (
                  <button
                    type="button"
                    className="library-reset-filter-btn"
                    onClick={() => {
                      setSelectedGenre(null)
                      setFilter('all')
                      setQuery('')
                    }}
                  >
                    Limpar Filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="track-list">
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
                    onTogglePublic={onTogglePublic}
                    onToggleLike={onToggleLike}
                    liked={likedTrackIds.has(track.id)}
                    onShare={onShare}
                    onDownload={onDownload}
                    featured={index === 0 && !query && filter === 'all' && !selectedGenre}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
