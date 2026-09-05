import { useCallback, useEffect, useRef, useState } from 'react'
import { AppShell } from './components/AppShell'
import { HomePage } from './pages/HomePage'
import { StudioPage } from './pages/StudioPage'
import { CollectionPage } from './pages/CollectionPage'
import { AdminPage } from './pages/AdminPage'
import { PlayerBar } from './components/PlayerBar'
import { AppLoader } from './components/AppLoader'
import { AuthPage } from './pages/AuthPage'
import { LandingPage } from './pages/LandingPage'
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage'
import { TermsPage } from './pages/TermsPage'
import { PricingModal } from './components/PricingModal'
import { supabase } from './lib/supabase'

const formatDuration = (seconds) => {
  if (!seconds) return '—'
  const minutes = Math.floor(seconds / 60)
  const remainder = String(seconds % 60).padStart(2, '0')
  return `${minutes}:${remainder}`
}

const mapTrack = (track, index) => {
  const stats = Array.isArray(track.estatisticas) ? track.estatisticas[0] : track.estatisticas
  const curtidas = stats?.curtidas_count ?? track.curtidas_count ?? track.likes ?? 0
  const reproducoes = stats?.reproducoes_count ?? track.reproducoes_count ?? track.plays ?? 0

  return {
    id: track.id,
    title: track.title,
    subtitle: track.subtitle || 'Criada no FlowHits',
    style: track.style,
    voice: track.voice || 'Masculino',
    duration: formatDuration(track.duration_seconds),
    plays: Number(reproducoes),
    likes: Number(curtidas),
    status: track.status === 'ready' ? (Number(reproducoes) > 0 ? 'EM ALTA' : 'NOVA') : track.status?.toUpperCase(),
    palette: ['blue', 'acid', 'orange', 'purple'][index % 4],
    seed: index + 4,
    audioUrl: track.audio_url || track.audio_path,
    coverUrl: track.cover_url || track.cover_path,
    lyrics: track.lyrics || track.generation?.lyrics || '',
    generationJobId: track.generation_job_id,
    isPublic: Boolean(track.is_public),
    mine: track.mine ?? true,
    createdAt: track.created_at,
  }
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [isAdmin, setIsAdmin] = useState(false)
  const [fontsReady, setFontsReady] = useState(() => !document.fonts || document.fonts.status === 'loaded')
  const [legalRoute, setLegalRoute] = useState(() => {
    const path = window.location.pathname.toLowerCase()
    if (path.includes('inicio') || path === '/inicio') {
      window.history.replaceState({}, '', '/')
      return null
    }
    if (path.includes('privacidade') || path.includes('privacy')) return 'privacy'
    if (path.includes('termos') || path.includes('terms')) return 'terms'
    return null
  })
  const [publicScreen, setPublicScreen] = useState(() => window.location.pathname.toLowerCase().includes('/entrar') ? 'auth' : 'landing')
  const [page, setPage] = useState('home')
  const [pricingModalOpen, setPricingModalOpen] = useState(false)
  // Faixas somente chegam do banco: nunca exibimos conteúdo de demonstração.
  const [tracks, setTracks] = useState([])
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false)
  const [publicTracks, setPublicTracks] = useState([])
  const [likedTrackIds, setLikedTrackIds] = useState(new Set())
  const [credits, setCredits] = useState(0)
  const [generationJobs, setGenerationJobs] = useState([])
  const [studio, setStudio] = useState(null)
  const [currentTrack, setCurrentTrack] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [playerExpanded, setPlayerExpanded] = useState(false)
  const [toast, setToast] = useState('')
  const [composerTemplate, setComposerTemplate] = useState({ prompt: '', style: '' })
  const lastKieSyncAtRef = useRef(0)
  const workspaceUserIdRef = useRef(null)

  // Detecção de Retorno do Stripe Checkout e Billing Portal
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('payment') === 'success') {
      setToast('Pagamento confirmado com sucesso! Seus créditos foram atualizados.')
      window.history.replaceState({}, '', '/')
    } else if (urlParams.get('payment') === 'cancelled') {
      setToast('Processo de pagamento cancelado.')
      window.history.replaceState({}, '', '/')
    } else if (urlParams.get('billing') === 'returned') {
      setToast('Retorno do portal de faturamento concluído.')
      window.history.replaceState({}, '', '/')
    }
  }, [])
  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (mounted) setSession(currentSession)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true
    if (!document.fonts?.ready) {
      setFontsReady(true)
      return undefined
    }

    document.fonts.ready
      .catch(() => undefined)
      .finally(() => {
        if (active) setFontsReady(true)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(timer)
  }, [toast])

  const loadWorkspace = useCallback(async () => {
    if (!session?.user) return

    try {
    const database = supabase
    const { data: { user: authenticatedUser }, error: authenticatedUserError } = await supabase.auth.getUser(session.access_token)

    if (authenticatedUserError || !authenticatedUser) {
      setToast('Sua sessão não pôde ser validada. Entre novamente.')
      return
    }

    const { data: reactivation, error: reactivationError } = await database.rpc('reativar_minha_conta')
    if (reactivationError) {
      setToast('Não foi possível validar o status da sua conta.')
      return
    }
    if (reactivation?.reactivated) {
      setToast('Sua conta foi recuperada com sucesso.')
    }

    const { data: existingStudios, error: studioError } = await database
      .from('estudios')
      .select('id, name, slug')
      .order('created_at', { ascending: true })
      .limit(1)

    if (studioError) {
      setToast('Nao foi possivel carregar seu estudio.')
      return
    }

    let activeStudio = existingStudios?.[0]

    if (!activeStudio) {
      const metadataName = authenticatedUser.user_metadata?.full_name || authenticatedUser.user_metadata?.name || authenticatedUser.user_metadata?.display_name
      const studioName = metadataName ? `Estúdio de ${metadataName.split(' ')[0]}` : 'Meu FlowHits'
      const baseName = (metadataName || authenticatedUser.email?.split('@')[0] || 'flowhits').replace(/[^a-z0-9]/gi, '').slice(0, 18).toLowerCase()
      const studioSlug = `${baseName}-${authenticatedUser.id.slice(0, 8)}`
      const { error: createError } = await database
        .from('estudios')
        .insert({ name: studioName, slug: studioSlug })

      if (createError) {
        console.error('Falha ao criar estúdio:', createError)
        setToast(`Não foi possível criar seu estúdio (${createError.code || 'erro de acesso'}).`)
        return
      }

      const { data: createdStudio, error: createdStudioError } = await database
        .from('estudios')
        .select('id, name, slug')
        .eq('slug', studioSlug)
        .single()

      if (createdStudioError) {
        console.error('Falha ao carregar estúdio recém-criado:', createdStudioError)
        setToast('Seu estúdio foi criado, mas não pôde ser carregado agora.')
        return
      }

      activeStudio = createdStudio
    }

    setStudio(activeStudio)

    const { data: movements, error: creditsError } = await database
      .from('creditos_movimentacoes')
      .select('amount')
      .eq('studio_id', activeStudio.id)

    if (creditsError) {
      setToast('Nao foi possivel carregar seus creditos.')
    } else {
      setCredits((movements || []).reduce((total, movement) => total + movement.amount, 0))
    }

    const { data: jobs, error: jobsError } = await database
      .from('geracoes')
      .select('id, status, failure_reason, created_at, completed_at')
      .eq('studio_id', activeStudio.id)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!jobsError) {
      setGenerationJobs(current => {
        const optimisticJobs = current.filter(job => job.optimistic && !(jobs || []).some(savedJob => savedJob.id === job.id))
        return [...optimisticJobs, ...(jobs || [])]
      })
      const hasPending = (jobs || []).some(j => j.status === 'processing' || j.status === 'queued')
      if (hasPending && Date.now() - lastKieSyncAtRef.current >= 30_000) {
        lastKieSyncAtRef.current = Date.now()
        supabase.functions.invoke('generate-music', {
          body: { action: 'sync', studioId: activeStudio.id },
        }).then(({ data: syncResult }) => {
          if (syncResult?.synced > 0) {
            console.log('%c[FlowHits] Sincronização automática finalizou faixas!', 'color: #10b981; font-weight: bold;', syncResult)
            loadWorkspace()
          }
        }).catch(err => {
          console.debug('[FlowHits] Sync:', err)
        })
      }
    }

    const { data: savedTracks, error: tracksError } = await database
      .from('faixas')
      .select('id, title, subtitle, style, voice, lyrics, duration_seconds, audio_path, cover_path, audio_url, cover_url, status, is_public, generation_job_id, created_at, generation:geracoes(lyrics), estatisticas:estatisticas_faixas(curtidas_count, reproducoes_count)')
      .eq('studio_id', activeStudio.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })

    if (tracksError) {
      setToast('Nao foi possivel carregar suas faixas.')
      return
    }

    const mappedTracks = (savedTracks || []).map(mapTrack)
    setTracks(mappedTracks)
    setCurrentTrack(current => current
      ? mappedTracks.find(track => track.id === current.id) || null
      : null)
    if (!mappedTracks.length) setPlaying(false)

    const { data: sharedTracks, error: publicError } = await database
      .from('biblioteca_publica')
      .select('id, title, subtitle, style, voice, duration_seconds, audio_url, cover_url, status, created_at, curtidas_count, reproducoes_count, is_public, mine')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(100)

    if (publicError) {
      setToast('Nao foi possivel carregar a biblioteca publica.')
      return
    }

    const ownTrackIds = new Set(mappedTracks.map(track => track.id))
    setPublicTracks(
      (sharedTracks || []).map((track, index) =>
        mapTrack(
          {
            ...track,
            is_public: true,
            mine: track.mine ?? ownTrackIds.has(track.id),
          },
          index,
        ),
      ),
    )

    const { data: likes, error: likesError } = await database.rpc('minhas_curtidas_faixas')
    if (!likesError) setLikedTrackIds(new Set((likes || []).map(like => like.faixa_id)))

    const { data: adminCheck } = await database.rpc('is_current_user_admin')
    setIsAdmin(Boolean(adminCheck))
    } finally {
      setWorkspaceLoaded(true)
    }
  }, [session])

  useEffect(() => {
    if (!session) {
      setIsAdmin(false)
      setStudio(null)
      setTracks([])
      setPublicTracks([])
      setLikedTrackIds(new Set())
      setCredits(0)
      setGenerationJobs([])
      setCurrentTrack(null)
      setWorkspaceLoaded(false)
      workspaceUserIdRef.current = null
      return
    }

    const isDifferentUser = workspaceUserIdRef.current !== session.user.id
    if (isDifferentUser) setWorkspaceLoaded(false)
    loadWorkspace()
    workspaceUserIdRef.current = session.user.id
    // Refresh database-backed progress quickly; KIE polling remains throttled
    // to 30 seconds by lastKieSyncAtRef inside loadWorkspace.
    const timer = setInterval(loadWorkspace, 5_000)
    return () => clearInterval(timer)
  }, [loadWorkspace, session])

  const playTrack = (track) => {
    if (!track?.audioUrl) {
      setCurrentTrack(track)
      setPlaying(false)
      setToast('Esta faixa ainda nao possui audio pronto para reproduzir.')
      return
    }
    if (currentTrack?.id === track.id) {
      setPlaying(value => !value)
    } else {
      setCurrentTrack(track)
      setPlaying(true)
    }

    if (typeof track.id === 'string') {
      supabase.rpc('registrar_reproducao_faixa', { target_faixa_id: track.id })
        .then(({ data: totalPlays, error }) => {
          if (error || !Number.isFinite(Number(totalPlays))) return
          const plays = Number(totalPlays)
          const updatePlays = (list) => list.map((item) => item.id === track.id ? { ...item, plays } : item)
          setTracks(updatePlays)
          setPublicTracks(updatePlays)
          setCurrentTrack((current) => current?.id === track.id ? { ...current, plays } : current)
        })
        .catch(() => {})
    }
  }

  const addTracks = async (payload) => {
    if (!studio) {
      console.warn('[FlowHits] Tentativa de gerar sem estúdio carregado.')
      setToast('Estudio ainda carregando. Tente de novo em instantes.')
      return
    }

    const requestBody = {
      studioId: studio.id,
      title: payload.title,
      prompt: payload.prompt,
      lyrics: payload.lyrics,
      style: payload.style,
      voice: payload.voice,
      mode: payload.mode,
    }

    console.log('%c[FlowHits] Chamando Edge Function generate-music...', 'color: #8b5cf6; font-weight: bold;', requestBody)

    const optimisticJobId = `pending-${Date.now()}`
    setGenerationJobs(current => [{
      id: optimisticJobId,
      status: 'queued',
      created_at: new Date().toISOString(),
      optimistic: true,
    }, ...current])

    const { data, error } = await supabase.functions.invoke('generate-music', {
      body: requestBody,
    })

    if (error) {
      setGenerationJobs(current => current.filter(job => job.id !== optimisticJobId))
      console.error('%c[FlowHits] Erro na Edge Function generate-music:', 'color: #ef4444; font-weight: bold;', error)
      setToast(error.message || 'Nao foi possivel iniciar a geracao.')
      throw error
    }

    console.log('%c[FlowHits] Resposta da KIE recebida com sucesso:', 'color: #10b981; font-weight: bold;', data)
    setGenerationJobs(current => current.map(job => job.id === optimisticJobId
      ? { ...job, id: data.jobId, status: data.status || 'processing', optimistic: false }
      : job))
    setToast('Geração iniciada.')
    await loadWorkspace()
  }

  const toggleTrackPublic = async (track) => {
    if (!track?.id) return

    const nextPublic = !track.isPublic

    // Optimistic local update em tracks e publicTracks
    setTracks(list => list.map(item => item.id === track.id ? { ...item, isPublic: nextPublic } : item))
    setPublicTracks(list => {
      if (nextPublic) {
        const exists = list.some(item => item.id === track.id)
        if (exists) return list.map(item => item.id === track.id ? { ...item, isPublic: true } : item)
        return [{ ...track, isPublic: true, mine: true }, ...list]
      } else {
        return list.filter(item => item.id !== track.id)
      }
    })

    // Tentativa prioritária via RPC segura
    const { data: rpcData, error: rpcError } = await supabase.rpc('alternar_publicacao_faixa', {
      p_faixa_id: track.id,
      p_is_public: nextPublic,
    })

    if (rpcError) {
      console.error('[FlowHits] Falha ao atualizar visibilidade da faixa:', rpcError)
      // Reverter optimistic update
      setTracks(list => list.map(item => item.id === track.id ? { ...item, isPublic: !nextPublic } : item))
      setPublicTracks(list => {
        if (!nextPublic) {
          const exists = list.some(item => item.id === track.id)
          if (exists) return list.map(item => item.id === track.id ? { ...item, isPublic: true } : item)
          return [{ ...track, isPublic: true }, ...list]
        } else {
          return list.filter(item => item.id !== track.id)
        }
      })
      setToast(rpcError.message || 'Nao foi possivel alterar a publicacao.')
      return
    }

    setToast(rpcData?.message || (nextPublic ? 'Faixa publicada na biblioteca.' : 'Faixa removida da biblioteca publica.'))
  }

  const toggleTrackLike = async (track) => {
    if (!track?.id) return

    const wasLiked = likedTrackIds.has(track.id)
    const nextLiked = !wasLiked

    // Optimistic update
    setLikedTrackIds(ids => {
      const next = new Set(ids)
      if (nextLiked) next.add(track.id)
      else next.delete(track.id)
      return next
    })
    setPublicTracks(list => list.map(item => item.id === track.id
      ? { ...item, likes: Math.max(0, (item.likes || 0) + (nextLiked ? 1 : -1)) }
      : item,
    ))
    setTracks(list => list.map(item => item.id === track.id
      ? { ...item, likes: Math.max(0, (item.likes || 0) + (nextLiked ? 1 : -1)) }
      : item,
    ))

    const { data: liked, error } = await supabase.rpc('alternar_curtida_faixa', {
      target_faixa_id: track.id,
    })

    if (error) {
      console.error('[FlowHits] Erro ao alternar curtida:', error)
      // Rollback se falhar
      setLikedTrackIds(ids => {
        const rollback = new Set(ids)
        if (wasLiked) rollback.add(track.id)
        else rollback.delete(track.id)
        return rollback
      })
      setPublicTracks(list => list.map(item => item.id === track.id
        ? { ...item, likes: Math.max(0, (item.likes || 0) + (wasLiked ? 1 : -1)) }
        : item,
      ))
      setTracks(list => list.map(item => item.id === track.id
        ? { ...item, likes: Math.max(0, (item.likes || 0) + (wasLiked ? 1 : -1)) }
        : item,
      ))
      setToast(error.message || 'Nao foi possivel alterar a curtida.')
      return
    }

    setToast(liked ? 'Faixa adicionada aos favoritos.' : 'Faixa removida dos favoritos.')
  }

  const handleSelectTemplate = (prompt, style) => {
    setComposerTemplate({ prompt, style })
  }

  const shareTrack = async (track) => {
    const text = `${track.title} - ${track.subtitle}`
    try {
      if (navigator.share) {
        await navigator.share({ title: track.title, text, url: track.audioUrl || window.location.href })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(track.audioUrl || window.location.href)
        setToast('Link copiado para a area de transferencia.')
      } else {
        setToast('Compartilhamento nao disponivel neste navegador.')
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setToast('Nao foi possivel compartilhar esta faixa.')
    }
  }

  const downloadTrack = (track) => {
    if (!track.audioUrl) {
      setToast('Esta faixa ainda nao possui audio para baixar.')
      return
    }
    const link = document.createElement('a')
    link.href = track.audioUrl
    link.download = `${track.title || 'flowhits'}.mp3`
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setToast('Download iniciado.')
  }

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('flowhits_user_custom_name')
      localStorage.removeItem('flowhits_name_changed_at')
    } catch {}
    const { error } = await supabase.auth.signOut()
    if (error) setToast('Nao foi possivel encerrar a sessao. Tente novamente.')
  }

  // O conteúdo do produto só entra após a fonte final e a sessão estarem definidos.
  // Isso elimina o primeiro paint com métrica/tamanho de texto diferente.
  if (!fontsReady || session === undefined || (session && !workspaceLoaded)) {
    return <AppLoader />
  }

  if (legalRoute === 'privacy') {
    return <PrivacyPolicyPage onBack={() => { window.history.pushState({}, '', '/'); setLegalRoute(null); }} />
  }

  if (legalRoute === 'terms') {
    return <TermsPage onBack={() => { window.history.pushState({}, '', '/'); setLegalRoute(null); }} />
  }

  if (!session) {
    const openLegal = (type) => { window.history.pushState({}, '', `/${type}`); setLegalRoute(type) }
    if (publicScreen === 'landing') {
      return <LandingPage onStart={() => { window.history.pushState({}, '', '/entrar'); setPublicScreen('auth') }} onOpenLegal={openLegal} />
    }
    return <AuthPage onBack={() => { window.history.pushState({}, '', '/'); setPublicScreen('landing') }} onOpenLegal={openLegal} />
  }

  if (page === 'admin' && isAdmin) {
    return (
      <>
        <AdminPage
          onBack={() => setPage('home')}
          onToast={setToast}
          currentUser={session.user}
        />
        {toast && (
          <div className="toast" role="status">
            <span>OK</span>
            {toast}
          </div>
        )}
      </>
    )
  }

  return (
    <AppShell
      page={page}
      onNavigate={(nextPage) => {
        if (nextPage === 'plans') {
          setPricingModalOpen(true)
        } else {
          setPage(nextPage)
        }
      }}
      onOpenPricing={() => setPricingModalOpen(true)}
      onAction={setToast}
      user={session.user}
      onSignOut={handleSignOut}
      credits={credits}
      generationJobs={generationJobs}
      isAdmin={isAdmin}
    >
      {page === 'home' && (
        <HomePage
          tracks={tracks}
          onPlay={playTrack}
          onExpandPlayer={() => setPlayerExpanded(true)}
          currentTrack={currentTrack}
          playing={playing}
          onAction={setToast}
          onNavigate={setPage}
          onOpenPricing={() => setPricingModalOpen(true)}
          onSelectTemplate={handleSelectTemplate}
          onShare={shareTrack}
          onDownload={downloadTrack}
          likedTrackIds={likedTrackIds}
          onToggleLike={toggleTrackLike}
          onTogglePublic={toggleTrackPublic}
        />
      )}

      {page === 'studio' && (
        <StudioPage
          tracks={tracks}
          generationJobs={generationJobs}
          onGenerate={addTracks}
          onPlay={playTrack}
          onExpandPlayer={() => setPlayerExpanded(true)}
          currentTrack={currentTrack}
          playing={playing}
          onAction={setToast}
          onNavigate={setPage}
          onOpenPricing={() => setPricingModalOpen(true)}
          initialPrompt={composerTemplate.prompt}
          initialStyle={composerTemplate.style}
          onShare={shareTrack}
          onDownload={downloadTrack}
          likedTrackIds={likedTrackIds}
          onToggleLike={toggleTrackLike}
          onTogglePublic={toggleTrackPublic}
        />
      )}

      {(page === 'library' || page === 'explore' || page === 'plans') && (
        <CollectionPage
          page={page}
          tracks={tracks}
          publicTracks={publicTracks}
          onTogglePublic={toggleTrackPublic}
          onToggleLike={toggleTrackLike}
          likedTrackIds={likedTrackIds}
          onShare={shareTrack}
          onDownload={downloadTrack}
          credits={credits}
          onPlay={playTrack}
          onExpandPlayer={() => setPlayerExpanded(true)}
          currentTrack={currentTrack}
          playing={playing}
          onNavigate={setPage}
          onOpenPricing={() => setPricingModalOpen(true)}
          onAction={setToast}
        />
      )}

      <PlayerBar
          track={currentTrack}
          playing={playing}
          expanded={playerExpanded}
          onExpand={() => setPlayerExpanded(true)}
          onClose={() => setPlayerExpanded(false)}
          onDismiss={() => {
            setCurrentTrack(null)
            setPlaying(false)
            setPlayerExpanded(false)
          }}
          onToggle={() => setPlaying((v) => !v)}
          onAction={setToast}
          onPrevious={() => {
            const index = tracks.findIndex(item => item.id === currentTrack?.id)
            playTrack(tracks[(index - 1 + tracks.length) % tracks.length])
          }}
          onNext={() => {
            const index = tracks.findIndex(item => item.id === currentTrack?.id)
            playTrack(tracks[(index + 1) % tracks.length])
          }}
          onEnded={() => {
            const index = tracks.findIndex(item => item.id === currentTrack?.id)
            const nextTrack = tracks[(index + 1) % tracks.length]
            if (nextTrack?.audioUrl) playTrack(nextTrack)
            else setPlaying(false)
          }}
          onShare={shareTrack}
          onDownload={downloadTrack}
          liked={likedTrackIds.has(currentTrack?.id)}
          onToggleLike={() => toggleTrackLike(currentTrack)}
        />

      {/* Modal de Planos & Assinaturas Stripe */}
      <PricingModal
        isOpen={pricingModalOpen}
        onClose={() => setPricingModalOpen(false)}
        studioId={studio?.id}
        onToast={setToast}
      />

      {toast && (
        <div className="toast" role="status">
          <span>OK</span>
          {toast}
        </div>
      )}
    </AppShell>
  )
}
