import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Coins,
  Compass,
  CreditCard,
  ExternalLink,
  Home,
  Library,
  Loader2,
  LogOut,
  Megaphone,
  Menu,
  MoreHorizontal,
  Music,
  Music2,
  Pencil,
  Shield,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DeleteAccountModal } from './DeleteAccountModal'

const navigation = [
  { id: 'home', label: 'Início', icon: Home },
  { id: 'studio', label: 'Criar', icon: Wand2 },
  { id: 'library', label: 'Biblioteca', icon: Library },
  { id: 'explore', label: 'Explorar', icon: Compass },
]

function InstagramIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

function WhatsappIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </svg>
  )
}

function YoutubeIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <polygon points="10 15 15 12 10 9 10 15" fill="currentColor" />
    </svg>
  )
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return ''
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Agora mesmo'
  if (diffMins < 60) return `há ${diffMins} min`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `há ${diffHours} h`
  const diffDays = Math.floor(diffHours / 24)
  return `há ${diffDays} d`
}

export function AppShell({ page, onNavigate, onOpenPricing, onAction, user, onSignOut, credits = 0, generationJobs: _generationJobs = [], isAdmin = false, children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuClosing, setMenuClosing] = useState(false)
  const closeTimerRef = useRef(null)
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [isEditingName, setIsEditingName] = useState(false)
  const [customName, setCustomName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [desktopNotifsOpen, setDesktopNotifsOpen] = useState(false)
  const notifsPopoverRef = useRef(null)

  useEffect(() => {
    if (!desktopNotifsOpen) return undefined
    const handleClickOutside = (e) => {
      if (notifsPopoverRef.current && !notifsPopoverRef.current.contains(e.target) && !e.target.closest('.suno-notifs-trigger')) {
        setDesktopNotifsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [desktopNotifsOpen])

  const handleCloseMenu = useCallback((callback) => {
    if (!menuOpen || menuClosing) return
    setMenuClosing(true)
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => {
      setMenuOpen(false)
      setMenuClosing(false)
      if (typeof callback === 'function') callback()
    }, 280)
  }, [menuOpen, menuClosing])

  const toggleMenu = useCallback(() => {
    if (menuOpen) {
      handleCloseMenu()
    } else {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
      setMenuClosing(false)
      setMenuOpen(true)
    }
  }, [menuOpen, handleCloseMenu])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return undefined

    const scrollY = window.scrollY
    const bodyStyle = document.body.style
    const previous = {
      position: bodyStyle.position,
      top: bodyStyle.top,
      width: bodyStyle.width,
      overflow: bodyStyle.overflow,
    }

    Object.assign(bodyStyle, {
      position: 'fixed',
      top: `-${scrollY}px`,
      width: '100%',
      overflow: 'hidden',
    })

    return () => {
      Object.assign(bodyStyle, previous)
      window.scrollTo(0, scrollY)
    }
  }, [menuOpen])

  // Limpar chaves legadas não vinculadas a um usuário específico
  useEffect(() => {
    try {
      localStorage.removeItem('flowhits_user_custom_name')
      localStorage.removeItem('flowhits_name_changed_at')
    } catch {}
  }, [])

  const [localDisplayName, setLocalDisplayName] = useState(() => {
    if (!user?.id) return ''
    try {
      return localStorage.getItem(`flowhits_${user.id}_custom_name`) || user?.user_metadata?.display_name?.trim() || ''
    } catch {
      return user?.user_metadata?.display_name?.trim() || ''
    }
  })

  const [notifsCollapsed, setNotifsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('flowhits_notifs_collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleNotifsCollapsed = () => {
    setNotifsCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('flowhits_notifs_collapsed', String(next))
      } catch {}
      return next
    })
  }

  const profileName = localDisplayName || user?.user_metadata?.display_name?.trim() || user?.user_metadata?.full_name?.trim() || user?.user_metadata?.name?.trim() || user?.email?.split('@')[0] || 'Perfil'
  const initials = profileName.slice(0, 2).toUpperCase()

  const [lastNameChangedAt, setLastNameChangedAt] = useState(() => {
    if (!user?.id) return ''
    try {
      return localStorage.getItem(`flowhits_${user.id}_name_changed_at`) || user?.user_metadata?.name_changed_at || ''
    } catch {
      return user?.user_metadata?.name_changed_at || ''
    }
  })

  // Sincronizar nome e cooldown sempre que o usuário ativo mudar
  useEffect(() => {
    if (!user?.id) {
      setLocalDisplayName('')
      setLastNameChangedAt('')
      return
    }

    try {
      const cachedName = localStorage.getItem(`flowhits_${user.id}_custom_name`)
      setLocalDisplayName(cachedName || user?.user_metadata?.display_name?.trim() || '')
      const cachedChangedAt = localStorage.getItem(`flowhits_${user.id}_name_changed_at`)
      setLastNameChangedAt(cachedChangedAt || user?.user_metadata?.name_changed_at || '')
    } catch {
      setLocalDisplayName(user?.user_metadata?.display_name?.trim() || '')
      setLastNameChangedAt(user?.user_metadata?.name_changed_at || '')
    }
  }, [user?.id, user?.user_metadata?.display_name, user?.user_metadata?.name_changed_at])

  const getCooldownRemaining = useCallback(() => {
    const raw = lastNameChangedAt || user?.user_metadata?.name_changed_at
    if (!raw) return null
    const lastDate = new Date(raw).getTime()
    if (Number.isNaN(lastDate)) return null
    const diff = Date.now() - lastDate
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
    if (diff < SEVEN_DAYS) {
      const remainingMs = SEVEN_DAYS - diff
      const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000))
      return days
    }
    return null
  }, [lastNameChangedAt, user?.user_metadata?.name_changed_at])

  const startEditingName = () => {
    const remainingDays = getCooldownRemaining()
    if (remainingDays) {
      onAction(`Você só pode alterar seu nome a cada 7 dias. Próxima alteração disponível em ${remainingDays} dia${remainingDays > 1 ? 's' : ''}.`)
      return
    }
    setCustomName(profileName)
    setIsEditingName(true)
  }

  const cancelEditingName = () => {
    setIsEditingName(false)
    setCustomName('')
  }

  const saveCustomName = async (e) => {
    e?.preventDefault?.()
    const trimmed = customName.trim()
    if (!trimmed) return

    if (trimmed === profileName) {
      setIsEditingName(false)
      return
    }

    const remainingDays = getCooldownRemaining()
    if (remainingDays) {
      onAction(`Você só pode alterar seu nome a cada 7 dias. Próxima alteração disponível em ${remainingDays} dia${remainingDays > 1 ? 's' : ''}.`)
      setIsEditingName(false)
      return
    }

    if (trimmed.length < 2) {
      onAction('O nome deve ter pelo menos 2 caracteres.')
      return
    }

    if (trimmed.length > 25) {
      onAction('O nome pode ter no máximo 25 caracteres.')
      return
    }

    setSavingName(true)
    try {
      const nowIso = new Date().toISOString()
      const { error } = await supabase.auth.updateUser({
        data: {
          display_name: trimmed,
          name: trimmed,
          full_name: trimmed,
          name_changed_at: nowIso,
        },
      })
      if (error) throw error

      setLocalDisplayName(trimmed)
      setLastNameChangedAt(nowIso)
      if (user?.id) {
        try {
          localStorage.setItem(`flowhits_${user.id}_name_changed_at`, nowIso)
          localStorage.setItem(`flowhits_${user.id}_custom_name`, trimmed)
        } catch {}
      }

      setIsEditingName(false)
      onAction('Nome atualizado com sucesso! Próxima alteração disponível em 7 dias.')
    } catch (err) {
      console.error('[Profile] Erro ao atualizar nome:', err)
      onAction(err.message || 'Erro ao atualizar o nome.')
    } finally {
      setSavingName(false)
    }
  }

  const loadNotifications = useCallback(async () => {
    if (!user?.id) return
    try {
      const { data, error } = await supabase.rpc('get_minhas_notificacoes', { p_limit: 5 })
      if (!error && Array.isArray(data)) {
        setNotifications(data.slice(0, 5))
      }
    } catch (err) {
      console.error('[Notifications] Erro ao carregar:', err)
    }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    loadNotifications()

    const channel = supabase
      .channel('app-realtime-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes' }, (payload) => {
        loadNotifications()
        if (payload?.eventType === 'INSERT') {
          const isForMe = payload.new?.user_id === user?.id || payload.new?.is_broadcast
          if (isForMe) {
            setNotifsCollapsed(false)
            try {
              localStorage.setItem('flowhits_notifs_collapsed', 'false')
            } catch {}
          }
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, loadNotifications])

  const unreadCount = notifications.filter((n) => !n.lida).length

  const handleMarkAllReadQuiet = useCallback(async () => {
    if (unreadCount === 0) return
    setNotifications((prev) => prev.map((n) => ({ ...n, lida: true })))
    try {
      await supabase.rpc('marcar_todas_notificacoes_lidas')
    } catch (err) {
      console.error('[Notifications] Erro ao marcar lidas:', err)
    }
  }, [unreadCount])

  const handleMarkAsRead = async (notif) => {
    handleMarkAllReadQuiet()

    if (notif.link) {
      setMenuOpen(false)
      if (notif.link === '/studio') onNavigate('studio')
      else if (notif.link === '/library') onNavigate('library')
      else if (notif.link === '/plans') {
        if (onOpenPricing) onOpenPricing()
        else onNavigate('plans')
      }
    }
  }

  const handleMarkAllRead = async () => {
    handleMarkAllReadQuiet()
  }

  const openExternalLink = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer')
    setMenuOpen(false)
  }

  return (
    <div className="app-shell">
      {/* Sidebar Desktop Estilo Suno (visível em desktop >= 1024px) */}
      <aside className="desktop-suno-sidebar" aria-label="Navegação lateral desktop">
        <div className="suno-sidebar-header">
          <button
            className="suno-sidebar-brand"
            onClick={() => onNavigate('home')}
            aria-label="FlowHits Início"
          >
            <span className="brand-icon">
              <img src="/LOGO%202.webp" alt="FlowHits Logo" />
            </span>
            <span className="suno-brand-text">
              FLOW<span>HITS</span>
            </span>
          </button>
        </div>

        {/* Links Principais de Navegação */}
        <nav className="suno-sidebar-nav" aria-label="Navegação principal">
          <button
            className={`suno-nav-btn ${page === 'home' ? 'active' : ''}`}
            onClick={() => onNavigate('home')}
          >
            <Home size={18} />
            <span>Início</span>
          </button>

          <button
            className={`suno-nav-btn ${page === 'explore' ? 'active' : ''}`}
            onClick={() => onNavigate('explore')}
          >
            <Compass size={18} />
            <span>Explorar</span>
          </button>

          <button
            className={`suno-nav-btn suno-create-btn ${page === 'studio' ? 'active' : ''}`}
            onClick={() => onNavigate('studio')}
          >
            <Wand2 size={18} />
            <span>Criar</span>
          </button>

          <button
            className={`suno-nav-btn ${page === 'library' ? 'active' : ''}`}
            onClick={() => onNavigate('library')}
          >
            <Library size={18} />
            <span>Biblioteca</span>
          </button>

          {/* Perfil do Usuário com avatar estilo Suno */}
          <div
            className="suno-user-profile-row"
            onClick={() => setMenuOpen(true)}
            role="button"
            tabIndex={0}
            title="Abrir perfil e configurações"
          >
            <span className="suno-user-avatar-dot" />
            <span className="suno-user-name">{profileName}</span>
          </div>
        </nav>

        {/* Rodapé da Sidebar */}
        <div className="suno-sidebar-footer">
          {isAdmin && (
            <button
              className={`suno-footer-btn ${page === 'admin' ? 'active' : ''}`}
              onClick={() => onNavigate('admin')}
            >
              <Shield size={16} />
              <span>Painel Admin</span>
            </button>
          )}

          <button
            className="suno-footer-btn"
            onClick={() => (onOpenPricing ? onOpenPricing() : onNavigate('plans'))}
            title="Ver saldo de faixas e recargas"
          >
            <Coins size={16} />
            <span>{credits} faixas</span>
          </button>

          <button
            className={`suno-footer-btn suno-notifs-trigger ${desktopNotifsOpen ? 'active' : ''}`}
            onClick={() => setDesktopNotifsOpen((v) => !v)}
            title="Notificações"
          >
            <Bell size={16} />
            <span>Notificações</span>
            {unreadCount > 0 && <span className="suno-notif-badge">{unreadCount}</span>}
          </button>

          <button
            className="suno-footer-btn"
            onClick={() => setMenuOpen(true)}
            title="Mais opções e configurações"
          >
            <MoreHorizontal size={16} />
            <span>Mais</span>
          </button>

          {/* Botão de Upgrade / CTA Estilo Suno Update Billing */}
          <button
            className="suno-cta-btn"
            onClick={() => (onOpenPricing ? onOpenPricing() : onNavigate('plans'))}
          >
            <span>Planos & Recargas</span>
          </button>
        </div>

        {/* Popover de Notificações Desktop */}
        {desktopNotifsOpen && (
          <div className="suno-desktop-notifs-popover" ref={notifsPopoverRef}>
            <div className="suno-notifs-popover-header">
              <div className="suno-notifs-popover-title">
                <Bell size={14} />
                <strong>Notificações</strong>
                {unreadCount > 0 && <span className="notif-unread-count-tag">{unreadCount} novas</span>}
              </div>
              {unreadCount > 0 && (
                <button className="btn-mark-all-read" onClick={handleMarkAllReadQuiet}>
                  <CheckCheck size={12} />
                  <span>Marcar lidas</span>
                </button>
              )}
            </div>

            <div className="suno-notifs-popover-list" onScroll={handleMarkAllReadQuiet}>
              {notifications.length > 0 ? (
                notifications.slice(0, 5).map((n) => (
                  <div
                    key={n.id}
                    className={`notif-card-item ${n.lida ? 'read' : 'unread'} ${n.tipo}`}
                    onClick={() => {
                      handleMarkAsRead(n)
                      setDesktopNotifsOpen(false)
                    }}
                  >
                    <div className={`notif-icon-box ${n.tipo} ${n.categoria}`}>
                      {n.tipo === 'broadcast' && <Megaphone size={14} />}
                      {n.tipo === 'credit_purchase' && <Coins size={14} />}
                      {n.tipo === 'subscription' && <CreditCard size={14} />}
                      {n.tipo === 'generation' && <Music size={14} />}
                      {n.tipo === 'system' && <Sparkles size={14} />}
                    </div>

                    <div className="notif-content-col">
                      <div className="notif-top-line">
                        {n.is_broadcast && <span className={`notif-type-tag ${n.categoria}`}>{n.categoria?.toUpperCase() || 'AVISO'}</span>}
                        {!n.lida && <span className="notif-unread-dot" />}
                      </div>
                      <strong className="notif-title">{n.titulo}</strong>
                      <p className="notif-message">{n.mensagem}</p>
                      <span className="notif-time">{formatRelativeTime(n.created_at)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="notif-empty-state">
                  <p>Nenhuma notificação recente.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Header em Ilha Flutuante (Mobile) */}
      <header className="island-header-wrap">
        <div className="island-header">
          <button
            className="brand-pill"
            onClick={() => onNavigate('home')}
            aria-label="FlowHits Início"
          >
            <span className="brand-icon">
              <img src="/LOGO%202.webp" alt="" />
            </span>
            <span className="brand-text">
              FLOW<span>HITS</span>
            </span>
          </button>

          {/* Navegação Desktop embutida no Header em Ilha (mantida para fallback) */}
          <nav className="desktop-island-nav" aria-label="Navegação desktop">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = page === item.id
              return (
                <button
                  key={item.id}
                  className={`nav-pill-item ${isActive ? 'active' : ''}`}
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Ações da Direita: Ícone de Música + Créditos e Botão Menu (com bolinha de notificação) */}
          <div className="header-actions">
            {isAdmin && (
              <button
                className={`admin-header-pill ${page === 'admin' ? 'active' : ''}`}
                onClick={() => onNavigate('admin')}
                aria-label="Painel Administrativo"
                title="Acessar Painel Administrativo"
              >
                <Shield size={14} />
                <span>Admin</span>
              </button>
            )}

            <button
              className="credits-pill"
              onClick={() => onNavigate('plans')}
              aria-label={`${credits} faixas disponíveis`}
              title={`${credits} faixas disponíveis • Recarregar`}
            >
              <Music2 size={14} className="credits-music-icon" />
              <span>{credits}</span>
            </button>

            {/* Botão Hambúrguer (3 Tracinhos com bolinha vermelha quando houver notificação) */}
            <button
              className={`menu-toggle-btn ${menuOpen && !menuClosing ? 'active' : ''}`}
              aria-label="Menu principal"
              onClick={toggleMenu}
            >
              {menuOpen && !menuClosing ? <X size={18} /> : <Menu size={18} />}
              {unreadCount > 0 && <span className="menu-notif-dot" />}
            </button>
          </div>
        </div>
      </header>

      {/* Menu Modal Centralizado com Animação */}
      {menuOpen && (
        <div className={`menu-backdrop ${menuClosing ? 'is-closing' : ''}`} onClick={() => handleCloseMenu()}>
          <aside
            className={`island-center-menu ${menuClosing ? 'is-closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
            aria-label="Menu de opções"
          >
            <div className="drawer-header">
              <div className="drawer-brand-center">
                <span className="brand-icon">
                  <img src="/LOGO%202.webp" alt="FlowHits Logo" />
                </span>
                <span className="brand-text">
                  FLOW<span>HITS</span>
                </span>
              </div>
              <button
                className="drawer-close-btn"
                aria-label="Fechar menu"
                onClick={() => handleCloseMenu()}
              >
                <X size={18} />
              </button>
            </div>

            {/* Card de Perfil */}
            <div className="drawer-profile-card">
              <div className="drawer-avatar">
                {initials}
                <span className="drawer-online-dot" />
              </div>
              <div className="drawer-profile-info">
                {isEditingName ? (
                  <form className="drawer-name-edit-form" onSubmit={saveCustomName}>
                    <input
                      type="text"
                      className="drawer-name-input"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Seu nome"
                      autoFocus
                      maxLength={25}
                      disabled={savingName}
                    />
                    <div className="drawer-name-edit-actions">
                      <button
                        type="submit"
                        className="drawer-name-action-btn save"
                        disabled={savingName || !customName.trim()}
                        title="Salvar nome"
                      >
                        {savingName ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                      </button>
                      <button
                        type="button"
                        className="drawer-name-action-btn cancel"
                        onClick={cancelEditingName}
                        disabled={savingName}
                        title="Cancelar"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="drawer-name-display-row">
                    <strong title={profileName}>{profileName}</strong>
                    <button
                      type="button"
                      className="drawer-edit-name-btn"
                      onClick={startEditingName}
                      title="Alterar seu nome"
                      aria-label="Editar nome próprio"
                    >
                      <Pencil size={11} />
                    </button>
                  </div>
                )}
                <span className="drawer-profile-email">{user?.email}</span>
              </div>
            </div>

            {/* Central de Notificações Reais (com opção de minimizar) */}
            <section className={`drawer-real-notifications ${notifsCollapsed ? 'collapsed' : ''}`} aria-label="Central de Notificações">
              <div className="drawer-notif-header">
                <div
                  className="drawer-real-notifications-title"
                  onClick={toggleNotifsCollapsed}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  title={notifsCollapsed ? 'Clique para expandir' : 'Clique para minimizar'}
                >
                  <Bell size={15} />
                  <strong>Notificações</strong>
                  {unreadCount > 0 && <span className="notif-unread-count-tag">{unreadCount} novas</span>}
                  <button className="btn-toggle-notifs" aria-label="Alternar exibição">
                    {notifsCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>
                </div>

                {unreadCount > 0 && !notifsCollapsed && (
                  <button className="btn-mark-all-read" onClick={handleMarkAllRead} title="Marcar todas como lidas">
                    <CheckCheck size={13} />
                    <span>Marcar lidas</span>
                  </button>
                )}
              </div>

              {!notifsCollapsed && (
                <div
                  className="drawer-notif-list"
                  onScroll={handleMarkAllReadQuiet}
                  onWheel={handleMarkAllReadQuiet}
                  onTouchMove={handleMarkAllReadQuiet}
                >
                  {notifications.length > 0 ? (
                    notifications.slice(0, 5).map((n) => (
                      <div
                        key={n.id}
                        className={`notif-card-item ${n.lida ? 'read' : 'unread'} ${n.tipo}`}
                        onClick={() => handleMarkAsRead(n)}
                      >
                        <div className={`notif-icon-box ${n.tipo} ${n.categoria}`}>
                          {n.tipo === 'broadcast' && <Megaphone size={14} />}
                          {n.tipo === 'credit_purchase' && <Coins size={14} />}
                          {n.tipo === 'subscription' && <CreditCard size={14} />}
                          {n.tipo === 'generation' && <Music size={14} />}
                          {n.tipo === 'system' && <Sparkles size={14} />}
                        </div>

                        <div className="notif-content-col">
                          <div className="notif-top-line">
                            {n.is_broadcast && <span className={`notif-type-tag ${n.categoria}`}>{n.categoria?.toUpperCase() || 'AVISO'}</span>}
                            {!n.lida && <span className="notif-unread-dot" />}
                          </div>
                          <strong className="notif-title">{n.titulo}</strong>
                          <p className="notif-message">{n.mensagem}</p>
                          <span className="notif-time">{formatRelativeTime(n.created_at)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="notif-empty-state">
                      <p>Nenhuma notificação recente.</p>
                    </div>
                  )}
                </div>
              )}
            </section>

            <div className="drawer-nav-list">
              {isAdmin && (
                <button
                  className="drawer-nav-item admin-entry"
                  onClick={() => handleCloseMenu(() => onNavigate('admin'))}
                >
                  <div className="drawer-nav-icon admin-icon"><Shield size={17} /></div>
                  <div className="drawer-nav-text">
                    <strong>Painel Administrativo</strong>
                    <span>Superadmin & Logs de Auditoria</span>
                  </div>
                </button>
              )}

              <button
                className="drawer-nav-item pricing-entry"
                onClick={() => handleCloseMenu(() => {
                  if (onOpenPricing) onOpenPricing()
                  else onNavigate('plans')
                })}
              >
                <div className="drawer-nav-icon"><Sparkles size={17} /></div>
                <div className="drawer-nav-text">
                  <strong>Planos & Assinaturas</strong>
                  <span>Planos e créditos avulsos</span>
                </div>
              </button>

              <button
                className="drawer-nav-item"
                onClick={() => handleCloseMenu(() => onSignOut())}
              >
                <div className="drawer-nav-icon"><LogOut size={17} /></div>
                <div className="drawer-nav-text">
                  <strong>Sair da conta</strong>
                  <span>Desconectar deste dispositivo</span>
                </div>
              </button>

            </div>

            {/* Seção Redes Sociais & Contato */}
            <div className="drawer-social-section">
              <span className="drawer-section-label">REDES SOCIAIS & SUPORTE</span>
              
              <div className="social-links-list">
                <button
                  className="social-link-item insta"
                  onClick={() => openExternalLink('https://www.instagram.com/flow.hits/')}
                >
                  <div className="social-icon-box">
                    <InstagramIcon size={17} />
                  </div>
                  <div className="social-link-text">
                    <strong>Instagram</strong>
                    <span>Acompanhe novidades e promoções</span>
                  </div>
                  <ExternalLink size={14} className="social-ext-icon" />
                </button>

                <button
                  className="social-link-item wpp"
                  onClick={() => openExternalLink('https://wa.me/5516981285601')}
                >
                  <div className="social-icon-box">
                    <WhatsappIcon size={17} />
                  </div>
                  <div className="social-link-text">
                    <strong>WhatsApp</strong>
                    <span>Contato e suporte</span>
                  </div>
                  <ExternalLink size={14} className="social-ext-icon" />
                </button>

                <button
                  className="social-link-item ytb"
                  onClick={() => openExternalLink('https://www.youtube.com/@flowhitsofc')}
                >
                  <div className="social-icon-box">
                    <YoutubeIcon size={17} />
                  </div>
                  <div className="social-link-text">
                    <strong>YouTube</strong>
                    <span>Vídeos, hinos e muita emoção</span>
                  </div>
                  <ExternalLink size={14} className="social-ext-icon" />
                </button>
              </div>

              <button
                className="drawer-nav-item delete-account-entry"
                onClick={() => handleCloseMenu(() => setDeleteAccountModalOpen(true))}
              >
                <div className="drawer-nav-icon delete-icon"><Trash2 size={17} /></div>
                <div className="drawer-nav-text">
                  <strong className="text-red">Excluir conta</strong>
                  <span>Recuperação disponível por 30 dias</span>
                </div>
              </button>
            </div>

            {/* Rodapé do Menu */}
          </aside>
        </div>
      )}

      {/* Conteúdo Principal */}
      <main className="main-content-container">
        {children}
      </main>

      {/* Navbar em Ilha Flutuante (Mobile & Dock) */}
      <div className="floating-dock-wrap">
        <nav className="island-dock" aria-label="Menu flutuante">
          {navigation.map(item => {
            const Icon = item.icon
            const isActive = page === item.id
            return (
              <button
                key={item.id}
                className={`dock-btn ${isActive ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
                aria-label={item.label}
              >
                <div className="dock-icon-box">
                  <Icon size={20} />
                </div>
                <span className="dock-label">{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Modal de Exclusão de Conta com Confirmação e LGPD */}
      <DeleteAccountModal
        isOpen={deleteAccountModalOpen}
        onClose={() => setDeleteAccountModalOpen(false)}
        userEmail={user?.email}
        onSignOut={onSignOut}
        onToast={onAction}
      />
    </div>
  )
}
