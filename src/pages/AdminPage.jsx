import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  Database,
  Download,
  FileText,
  Filter,
  Lock,
  Megaphone,
  Menu,
  Music,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  Unlock,
  Users,
  Wand2,
  X,
  XCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const tabTitles = {
  overview: 'Visão Geral & Métricas',
  users: 'Usuários & Estúdios',
  tracks: 'Moderação de Faixas',
  generations: 'Monitor de IA (KIE Pipeline)',
  credits: 'Livro-Razão de Créditos',
  audit: 'Logs de Auditoria Imutáveis',
  security: 'Segurança de IP & Rate Limits',
  subscriptions: 'Assinaturas & Faturamento Stripe',
  settings: 'Configurações Globais do Sistema',
  health: 'Saúde do Sistema & Integridade',
}

export function AdminPage({ onBack, onToast, currentUser }) {
  const [tab, setTab] = useState('overview')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [metrics, setMetrics] = useState(null)
  const [analytics, setAnalytics] = useState({ styles: [], daily: [] })
  const [settingsList, setSettingsList] = useState([])
  const [usersData, setUsersData] = useState({ total: 0, users: [] })
  const [tracksData, setTracksData] = useState({ total: 0, tracks: [] })
  const [generationsData, setGenerationsData] = useState({ total: 0, generations: [] })
  const [ledgerData, setLedgerData] = useState({ total: 0, movements: [] })
  const [auditData, setAuditData] = useState({ total: 0, logs: [] })
  const [ipSecurity, setIpSecurity] = useState({ top_ips: [], blocked_ips: [], active_limits: [] })
  const [subsData, setSubsData] = useState({ total: 0, mrr: 0, subscriptions: [] })

  // Search & Filters
  const [userSearch, setUserSearch] = useState('')
  const [trackSearch, setTrackSearch] = useState('')
  const [trackPublicFilter, setTrackPublicFilter] = useState('all')
  const [genSearch, setGenSearch] = useState('')
  const [genStatusFilter, setGenStatusFilter] = useState('all')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerReasonFilter, setLedgerReasonFilter] = useState('all')
  const [auditSearch, setAuditSearch] = useState('')
  const [auditActionFilter, setAuditActionFilter] = useState('all')
  const [subSearch, setSubSearch] = useState('')
  const [subStatusFilter, setSubStatusFilter] = useState('all')
  const [reconciling, setReconciling] = useState(false)

  // Modals & Action States
  const [creditModal, setCreditModal] = useState(null)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const [creditNote, setCreditNote] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const [roleModal, setRoleModal] = useState(null)
  const [roleReason, setRoleReason] = useState('')

  const [editNameModal, setEditNameModal] = useState(null) // { userId, currentName, userEmail }
  const [editNameNewValue, setEditNameNewValue] = useState('')
  const [editNameReason, setEditNameReason] = useState('')

  const [banModal, setBanModal] = useState(null) // { userId, userEmail, isBanned }
  const [banReason, setBanReason] = useState('')

  const [moderationModal, setModerationModal] = useState(null)
  const [moderationReason, setModerationReason] = useState('')

  const [deleteTrackModal, setDeleteTrackModal] = useState(null) // { trackId, trackTitle }
  const [deleteTrackReason, setDeleteTrackReason] = useState('')

  const [retryModal, setRetryModal] = useState(null)
  const [retryReason, setRetryReason] = useState('')

  const [settingEditModal, setSettingEditModal] = useState(null) // { key, value, desc }
  const [settingEditValue, setSettingEditValue] = useState('')
  const [settingEditReason, setSettingEditReason] = useState('')

  const [ipBlockModal, setIpBlockModal] = useState(null) // { ip, isBlocked }
  const [ipBlockReason, setIpBlockReason] = useState('')
  const [ipBlockHours, setIpBlockHours] = useState('24')

  const [subModal, setSubModal] = useState(null) // { userId, userEmail, currentPlan, currentInterval, currentStatus }
  const [subModalPlan, setSubModalPlan] = useState('lite')
  const [subModalInterval, setSubModalInterval] = useState('monthly')
  const [subModalStatus, setSubModalStatus] = useState('active')
  const [subModalGrantCredits, setSubModalGrantCredits] = useState(true)
  const [subModalReason, setSubModalReason] = useState('')

  // Broadcast Modal State
  const [openBroadcastModal, setOpenBroadcastModal] = useState(false)
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [broadcastCategory, setBroadcastCategory] = useState('announcement')
  const [broadcastLink, setBroadcastLink] = useState('')

  const [detailModal, setDetailModal] = useState(null)

  // Audio Preview State
  const [previewTrackId, setPreviewTrackId] = useState(null)
  const [audioElement, setAudioElement] = useState(null)

  const loadAllAdminData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      // 1. Overview Metrics & Advanced Analytics
      const { data: metricsRes } = await supabase.rpc('admin_get_overview_metrics')
      if (metricsRes) setMetrics(metricsRes)

      const { data: analyticsRes } = await supabase.rpc('admin_get_advanced_analytics')
      if (analyticsRes) setAnalytics(analyticsRes)

      // 2. Settings
      const { data: settingsRes } = await supabase.rpc('admin_get_system_settings')
      if (settingsRes) setSettingsList(settingsRes)

      // 3. IP Security & Rate Limits
      const { data: ipRes } = await supabase.rpc('admin_get_ip_security_overview')
      if (ipRes) setIpSecurity(ipRes)

      // 4. Users
      const { data: usersRes } = await supabase.rpc('admin_list_users', {
        p_search: userSearch,
        p_limit: 50,
        p_offset: 0,
      })
      if (usersRes) setUsersData(usersRes)

      // 5. Tracks
      const publicVal = trackPublicFilter === 'all' ? null : trackPublicFilter === 'true'
      const { data: tracksRes } = await supabase.rpc('admin_list_all_tracks', {
        p_search: trackSearch,
        p_filter_public: publicVal,
        p_limit: 50,
        p_offset: 0,
      })
      if (tracksRes) setTracksData(tracksRes)

      // 6. Generations
      const statusVal = genStatusFilter === 'all' ? null : genStatusFilter
      const { data: genRes } = await supabase.rpc('admin_list_generations', {
        p_status: statusVal,
        p_search: genSearch,
        p_limit: 50,
        p_offset: 0,
      })
      if (genRes) setGenerationsData(genRes)

      // 7. Credits Ledger
      const reasonVal = ledgerReasonFilter === 'all' ? null : ledgerReasonFilter
      const { data: ledgerRes } = await supabase.rpc('admin_list_credits_ledger', {
        p_search: ledgerSearch,
        p_reason: reasonVal,
        p_limit: 50,
        p_offset: 0,
      })
      if (ledgerRes) setLedgerData(ledgerRes)

      // 8. Audit Logs
      const actionVal = auditActionFilter === 'all' ? null : auditActionFilter
      const { data: auditRes } = await supabase.rpc('admin_get_audit_logs', {
        p_action_filter: actionVal,
        p_search: auditSearch,
        p_limit: 50,
        p_offset: 0,
      })
      if (auditRes) setAuditData(auditRes)

      // 9. Subscriptions
      const subStatusVal = subStatusFilter === 'all' ? null : subStatusFilter
      const { data: subsRes } = await supabase.rpc('admin_list_subscriptions', {
        p_status: subStatusVal,
        p_search: subSearch,
        p_limit: 50,
        p_offset: 0,
      })
      if (subsRes) setSubsData(subsRes)
    } catch (err) {
      console.error('[Admin] Falha ao carregar dados:', err)
      onToast('Falha ao carregar dados administrativos.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [
    userSearch,
    trackSearch,
    trackPublicFilter,
    genSearch,
    genStatusFilter,
    ledgerSearch,
    ledgerReasonFilter,
    auditSearch,
    auditActionFilter,
    subSearch,
    subStatusFilter,
    onToast,
  ])

  useEffect(() => {
    loadAllAdminData()
  }, [loadAllAdminData])

  // Player preview
  const togglePreview = (track) => {
    if (!track.audio_url) {
      onToast('Faixa sem arquivo de áudio disponível.')
      return
    }

    if (previewTrackId === track.id) {
      if (audioElement) {
        audioElement.pause()
        setAudioElement(null)
      }
      setPreviewTrackId(null)
    } else {
      if (audioElement) {
        audioElement.pause()
      }
      const newAudio = new Audio(track.audio_url)
      newAudio.play().catch(() => onToast('Não foi possível reproduzir áudio.'))
      newAudio.onended = () => {
        setPreviewTrackId(null)
        setAudioElement(null)
      }
      setAudioElement(newAudio)
      setPreviewTrackId(track.id)
    }
  }

  useEffect(() => {
    return () => {
      if (audioElement) audioElement.pause()
    }
  }, [audioElement])

  // --- CSV EXPORT UTILITY ---
  const exportToCSV = (filename, rows, headers) => {
    if (!rows || !rows.length) {
      onToast('Nenhum dado disponível para exportar.')
      return
    }

    const headerKeys = Object.keys(headers)
    const headerLabels = Object.values(headers)

    const csvContent = [
      headerLabels.join(','),
      ...rows.map((row) =>
        headerKeys
          .map((key) => {
            let val = row[key]
            if (val === null || val === undefined) val = ''
            if (typeof val === 'object') val = JSON.stringify(val)
            val = String(val).replace(/"/g, '""')
            return `"${val}"`
          })
          .join(',')
      ),
    ].join('\r\n')

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    onToast(`Relatório ${filename}.csv exportado com sucesso!`)
  }

  // --- ACTIONS ---

  const handleAdjustCredits = async () => {
    const amountNum = parseInt(creditAmount, 10)
    if (isNaN(amountNum) || amountNum === 0) {
      onToast('Informe uma quantia válida.')
      return
    }
    if (!creditReason.trim()) {
      onToast('A justificativa é obrigatória.')
      return
    }

    setActionLoading(true)
    try {
      const { data, error } = await supabase.rpc('admin_adjust_credits', {
        p_studio_id: creditModal.studioId,
        p_amount: amountNum,
        p_reason: creditReason.trim(),
        p_admin_note: creditNote.trim() || 'Ajuste manual via Painel Admin',
      })

      if (error) throw error

      onToast(`Créditos ajustados! Novo saldo: ${data.new_balance}`)
      setCreditModal(null)
      setCreditAmount('')
      setCreditReason('')
      setCreditNote('')
      loadAllAdminData(true)
    } catch (err) {
      onToast(err.message || 'Erro ao ajustar créditos.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleAdminRole = async () => {
    if (!roleReason.trim()) {
      onToast('A justificativa é obrigatória.')
      return
    }

    setActionLoading(true)
    try {
      const makeAdmin = !roleModal.isAdmin
      const { error } = await supabase.rpc('admin_toggle_user_admin', {
        p_target_user_id: roleModal.userId,
        p_make_admin: makeAdmin,
        p_reason: roleReason.trim(),
      })

      if (error) throw error

      onToast(makeAdmin ? 'Usuário promovido a Admin!' : 'Acesso de Admin removido.')
      setRoleModal(null)
      setRoleReason('')
      loadAllAdminData(true)
    } catch (err) {
      onToast(err.message || 'Erro ao alterar papel.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUpdateUserName = async () => {
    if (!editNameModal?.userId) return

    const trimmed = editNameNewValue.trim()
    if (trimmed.length < 2 || trimmed.length > 50) {
      onToast('O nome deve conter entre 2 e 50 caracteres.')
      return
    }

    setActionLoading(true)
    try {
      const { error } = await supabase.rpc('admin_update_user_name', {
        p_target_user_id: editNameModal.userId,
        p_new_name: trimmed,
        p_reason: editNameReason.trim() || 'Alteração pelo painel administrativo',
      })

      if (error) throw error

      onToast(`Nome de ${editNameModal.userEmail} alterado para "${trimmed}" com sucesso!`)
      setEditNameModal(null)
      loadAllAdminData(true)
    } catch (err) {
      console.error('[Admin] Erro ao alterar nome:', err)
      onToast(err.message || 'Erro ao alterar nome do usuário.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleBanUser = async () => {
    if (!banReason.trim()) {
      onToast('A justificativa do banimento/desbanimento é obrigatória.')
      return
    }

    setActionLoading(true)
    try {
      const makeBan = !banModal.isBanned
      const { error } = await supabase.rpc('admin_toggle_user_ban', {
        p_target_user_id: banModal.userId,
        p_banned: makeBan,
        p_reason: banReason.trim(),
      })

      if (error) throw error

      onToast(makeBan ? 'Conta do usuário suspensa/banida!' : 'Suspensão do usuário revogada com sucesso.')
      setBanModal(null)
      setBanReason('')
      loadAllAdminData(true)
    } catch (err) {
      onToast(err.message || 'Erro ao banir usuário.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleModerateTrack = async () => {
    if (!moderationReason.trim()) {
      onToast('O motivo da moderação é obrigatório.')
      return
    }

    setActionLoading(true)
    try {
      const nextPublic = !moderationModal.currentPublic
      const { error } = await supabase.rpc('admin_moderate_track', {
        p_track_id: moderationModal.trackId,
        p_is_public: nextPublic,
        p_reason: moderationReason.trim(),
      })

      if (error) throw error

      onToast(nextPublic ? 'Faixa tornada pública!' : 'Faixa ocultada da biblioteca.')
      setModerationModal(null)
      setModerationReason('')
      loadAllAdminData(true)
    } catch (err) {
      onToast(err.message || 'Erro na moderação.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteTrack = async () => {
    if (!deleteTrackReason.trim()) {
      onToast('A justificativa para exclusão é obrigatória.')
      return
    }

    setActionLoading(true)
    try {
      const { error } = await supabase.rpc('admin_delete_track', {
        p_track_id: deleteTrackModal.trackId,
        p_reason: deleteTrackReason.trim(),
      })

      if (error) throw error

      onToast('Faixa excluída e removida da plataforma.')
      setDeleteTrackModal(null)
      setDeleteTrackReason('')
      loadAllAdminData(true)
    } catch (err) {
      onToast(err.message || 'Erro ao excluir faixa.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRetryGeneration = async () => {
    if (!retryReason.trim()) {
      onToast('A justificativa é obrigatória.')
      return
    }

    setActionLoading(true)
    try {
      const { error } = await supabase.rpc('admin_retry_generation', {
        p_generation_id: retryModal.genId,
        p_reason: retryReason.trim(),
      })

      if (error) throw error

      onToast('Geração reenfileirada para reprocessamento!')
      setRetryModal(null)
      setRetryReason('')
      loadAllAdminData(true)
    } catch (err) {
      onToast(err.message || 'Erro ao reenfileirar.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUpdateSetting = async () => {
    if (!settingEditReason.trim()) {
      onToast('A justificativa é obrigatória para alteração de configuração.')
      return
    }

    let parsedVal = settingEditValue
    try {
      parsedVal = JSON.parse(settingEditValue)
    } catch {
      // Se não for JSON estrito, mantém como string
    }

    setActionLoading(true)
    try {
      const { error } = await supabase.rpc('admin_update_system_setting', {
        p_chave: settingEditModal.key,
        p_valor: parsedVal,
        p_reason: settingEditReason.trim(),
      })

      if (error) throw error

      onToast(`Configuração "${settingEditModal.key}" atualizada!`)
      setSettingEditModal(null)
      setSettingEditValue('')
      setSettingEditReason('')
      loadAllAdminData(true)
    } catch (err) {
      onToast(err.message || 'Erro ao atualizar configuração.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleBlockIp = async () => {
    if (!ipBlockReason.trim()) {
      onToast('A justificativa do bloqueio/desbloqueio de IP é obrigatória.')
      return
    }

    const hoursNum = parseInt(ipBlockHours, 10) || null
    const makeBlock = !ipBlockModal.isBlocked

    setActionLoading(true)
    try {
      const { error } = await supabase.rpc('admin_toggle_block_ip', {
        p_ip: ipBlockModal.ip,
        p_block: makeBlock,
        p_reason: ipBlockReason.trim(),
        p_duration_hours: hoursNum,
      })

      if (error) throw error

      onToast(makeBlock ? `IP ${ipBlockModal.ip} bloqueado na Blacklist!` : `IP ${ipBlockModal.ip} desbloqueado.`)
      setIpBlockModal(null)
      setIpBlockReason('')
      loadAllAdminData(true)
    } catch (err) {
      onToast(err.message || 'Erro ao bloquear/desbloquear IP.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleResetRateLimit = async (key) => {
    try {
      const { error } = await supabase.rpc('admin_reset_rate_limit', {
        p_key: key,
        p_reason: 'Reset manual via Painel Admin',
      })

      if (error) throw error

      onToast(`Rate limit para "${key}" resetado com sucesso!`)
      loadAllAdminData(true)
    } catch (err) {
      onToast(err.message || 'Erro ao resetar rate limit.')
    }
  }

  const handleReconcileJobs = async () => {
    setReconciling(true)
    try {
      const { data, error } = await supabase.functions.invoke('reconcile-stuck-jobs')
      if (error) throw error

      if (data?.total_checked > 0) {
        onToast(`Reconciliação: ${data.total_checked} checados (${data.completed} concluídos, ${data.failed} falhos/estornados).`)
      } else {
        onToast('Nenhum job pendente precisava de reconciliação.')
      }
      loadAllAdminData(true)
    } catch (err) {
      console.error('[Admin] Erro na reconciliação:', err)
      onToast('Erro ao reconciliar jobs de IA.')
    } finally {
      setReconciling(false)
    }
  }

  const handleChangeSubscription = async () => {
    if (!subModalReason.trim()) {
      onToast('Justificativa obrigatória para auditoria.')
      return
    }

    setActionLoading(true)
    try {
      const { data, error } = await supabase.rpc('admin_change_user_subscription', {
        p_target_user_id: subModal.userId,
        p_plan_tier: subModalPlan,
        p_billing_interval: subModalInterval,
        p_status: subModalStatus,
        p_grant_credits: subModalGrantCredits,
        p_reason: subModalReason.trim(),
      })

      if (error) throw error

      onToast(data?.message || 'Plano atualizado com sucesso!')
      setSubModal(null)
      setSubModalReason('')
      loadAllAdminData(true)
    } catch (err) {
      console.error('[Admin] Erro ao alterar assinatura:', err)
      onToast(err.message || 'Erro ao alterar assinatura.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSendBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      onToast('Título e mensagem da notificação são obrigatórios.')
      return
    }

    setActionLoading(true)
    try {
      const { data, error } = await supabase.rpc('admin_send_broadcast_notification', {
        p_titulo: broadcastTitle.trim(),
        p_mensagem: broadcastMessage.trim(),
        p_categoria: broadcastCategory,
        p_link: broadcastLink.trim() || null,
      })

      if (error) throw error

      onToast(data?.message || 'Notificação transmitida com sucesso para todos os usuários!')
      setOpenBroadcastModal(false)
      setBroadcastTitle('')
      setBroadcastMessage('')
      setBroadcastLink('')
      loadAllAdminData(true)
    } catch (err) {
      console.error('[Admin] Erro ao enviar broadcast:', err)
      onToast(err.message || 'Erro ao transmitir notificação.')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="admin-root-layout">
      {/* Backdrop para fechar o menu mobile */}
      {mobileSidebarOpen && (
        <div
          className="admin-sidebar-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 1. SIDEBAR VERTICAL DE NAVEGAÇÃO */}
      <aside className={`admin-sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
        <div className="admin-sidebar-top">
          <div className="admin-brand">
            <div className="admin-badge-icon">
              <Shield size={20} className="shield-icon" />
            </div>
            <div className="admin-brand-info">
              <div className="admin-title-row">
                <h2>FlowHits</h2>
                <span className="admin-tag">ADMIN</span>
              </div>
              <span className="admin-subtitle">Console Enterprise</span>
            </div>
          </div>

          <button
            className="admin-sidebar-close-btn"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Botão de Retorno ao App */}
        <div className="admin-sidebar-back">
          <button className="admin-back-btn" onClick={onBack} title="Voltar ao FlowHits">
            <ArrowLeft size={16} />
            <span>Voltar ao App</span>
          </button>
        </div>

        {/* Links de Navegação Agrupados */}
        <nav className="admin-sidebar-nav" aria-label="Navegação do Painel Admin">
          <div className="nav-group">
            <span className="nav-group-title">DASHBOARD</span>
            <button
              className={`admin-nav-btn ${tab === 'overview' ? 'active' : ''}`}
              onClick={() => {
                setTab('overview')
                setMobileSidebarOpen(false)
              }}
            >
              <Activity size={17} />
              <span>Visão Geral</span>
            </button>
          </div>

          <div className="nav-group">
            <span className="nav-group-title">GESTÃO & OPERAÇÕES</span>
            <button
              className={`admin-nav-btn ${tab === 'users' ? 'active' : ''}`}
              onClick={() => {
                setTab('users')
                setMobileSidebarOpen(false)
              }}
            >
              <Users size={17} />
              <span>Usuários & Estúdios</span>
              <span className="tab-pill">{usersData.total}</span>
            </button>

            <button
              className={`admin-nav-btn ${tab === 'tracks' ? 'active' : ''}`}
              onClick={() => {
                setTab('tracks')
                setMobileSidebarOpen(false)
              }}
            >
              <Music size={17} />
              <span>Moderação de Faixas</span>
              <span className="tab-pill">{tracksData.total}</span>
            </button>

            <button
              className={`admin-nav-btn ${tab === 'generations' ? 'active' : ''}`}
              onClick={() => {
                setTab('generations')
                setMobileSidebarOpen(false)
              }}
            >
              <Wand2 size={17} />
              <span>Monitor de IA (KIE)</span>
              <span className="tab-pill">{generationsData.total}</span>
            </button>

            <button
              className={`admin-nav-btn ${tab === 'credits' ? 'active' : ''}`}
              onClick={() => {
                setTab('credits')
                setMobileSidebarOpen(false)
              }}
            >
              <Coins size={17} />
              <span>Livro-Razão</span>
              <span className="tab-pill">{ledgerData.total}</span>
            </button>
          </div>

          <div className="nav-group">
            <span className="nav-group-title">FINANCEIRO & FATURAMENTO</span>
            <button
              className={`admin-nav-btn ${tab === 'subscriptions' ? 'active' : ''}`}
              onClick={() => {
                setTab('subscriptions')
                setMobileSidebarOpen(false)
              }}
            >
              <CreditCard size={17} />
              <span>Assinaturas & MRR</span>
              <span className="tab-pill highlight">{subsData.total}</span>
            </button>
          </div>

          <div className="nav-group">
            <span className="nav-group-title">SEGURANÇA & SISTEMA</span>
            <button
              className={`admin-nav-btn ${tab === 'audit' ? 'active' : ''}`}
              onClick={() => {
                setTab('audit')
                setMobileSidebarOpen(false)
              }}
            >
              <FileText size={17} />
              <span>Logs de Auditoria</span>
              <span className="tab-pill highlight">{auditData.total}</span>
            </button>

            <button
              className={`admin-nav-btn ${tab === 'security' ? 'active' : ''}`}
              onClick={() => {
                setTab('security')
                setMobileSidebarOpen(false)
              }}
            >
              <Lock size={17} />
              <span>Segurança & Rate Limits</span>
              {ipSecurity.blocked_ips?.length > 0 && (
                <span className="tab-pill danger">{ipSecurity.blocked_ips.length}</span>
              )}
            </button>

            <button
              className={`admin-nav-btn ${tab === 'settings' ? 'active' : ''}`}
              onClick={() => {
                setTab('settings')
                setMobileSidebarOpen(false)
              }}
            >
              <Settings size={17} />
              <span>Configurações Globais</span>
            </button>

            <button
              className={`admin-nav-btn ${tab === 'health' ? 'active' : ''}`}
              onClick={() => {
                setTab('health')
                setMobileSidebarOpen(false)
              }}
            >
              <Server size={17} />
              <span>Saúde do Sistema</span>
            </button>
          </div>
        </nav>

        {/* Rodapé da Sidebar: Perfil do Administrador */}
        <div className="admin-sidebar-footer">
          <div className="admin-user-profile-badge">
            <div className="admin-user-avatar">
              {currentUser?.email ? currentUser.email.slice(0, 2).toUpperCase() : 'AD'}
            </div>
            <div className="admin-user-info">
              <span className="admin-user-email">{currentUser?.email || 'Administrador'}</span>
              <span className="admin-user-role">Superadmin Ativo</span>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. ÁREA PRINCIPAL DE CONTEÚDO (FULL WIDTH) */}
      <div className="admin-main-wrapper">
        {/* Topbar Superior */}
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              className="admin-mobile-toggle-btn"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Abrir menu lateral"
            >
              <Menu size={20} />
            </button>

            <div className="admin-breadcrumb">
              <span className="breadcrumb-root">Admin</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">{tabTitles[tab] || 'Visão Geral'}</span>
            </div>
          </div>

          <div className="admin-topbar-right">
            <div className="admin-status-indicator">
              <span className="pulse-dot green" />
              <span>Supabase RLS Blindado</span>
            </div>

            <button
              className="admin-broadcast-btn"
              onClick={() => setOpenBroadcastModal(true)}
              title="Enviar notificação para todos os usuários da plataforma"
            >
              <Megaphone size={15} />
              <span>Enviar Notificação</span>
            </button>

            <button
              className={`admin-refresh-btn ${refreshing ? 'spinning' : ''}`}
              onClick={() => loadAllAdminData(true)}
              disabled={refreshing}
              title="Atualizar dados agora"
            >
              <RefreshCw size={15} />
              <span>{refreshing ? 'Atualizando...' : 'Atualizar'}</span>
            </button>
          </div>
        </header>

        {/* Conteúdo Dinâmico com Máximo Aproveitamento de Espaço */}
        <main className="admin-content-viewport">
          {loading && !refreshing ? (
            <div className="admin-loading-state">
            <div className="spinner-glow" />
            <p>Carregando dados protegidos do sistema...</p>
          </div>
        ) : (
          <>
            {/* 1. ABA VISÃO GERAL */}
            {tab === 'overview' && (
              <div className="admin-view-overview">
                {/* Metric Cards Grid */}
                <div className="kpi-grid">
                  <div className="kpi-card emerald">
                    <div className="kpi-icon-wrap">
                      <CreditCard size={24} />
                    </div>
                    <div className="kpi-info">
                      <span className="kpi-label">Receita Recorrente (MRR)</span>
                      <strong className="kpi-value">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(metrics?.mrr_estimado || 0)}
                      </strong>
                      <span className="kpi-meta">{metrics?.total_active_subscribers || 0} assinantes ativos</span>
                    </div>
                  </div>

                  <div className="kpi-card blue">
                    <div className="kpi-icon-wrap">
                      <Users size={24} />
                    </div>
                    <div className="kpi-info">
                      <span className="kpi-label">Total de Usuários</span>
                      <strong className="kpi-value">{metrics?.total_users ?? '—'}</strong>
                      <span className="kpi-meta">{metrics?.total_studios ?? 0} estúdios vinculados</span>
                    </div>
                  </div>

                  <div className="kpi-card purple">
                    <div className="kpi-icon-wrap">
                      <Music size={24} />
                    </div>
                    <div className="kpi-info">
                      <span className="kpi-label">Faixas Criadas</span>
                      <strong className="kpi-value">{metrics?.total_tracks ?? '—'}</strong>
                      <span className="kpi-meta">{metrics?.public_tracks ?? 0} na biblioteca pública</span>
                    </div>
                  </div>

                  <div className="kpi-card acid">
                    <div className="kpi-icon-wrap">
                      <Wand2 size={24} />
                    </div>
                    <div className="kpi-info">
                      <span className="kpi-label">Gerações de IA Concluídas</span>
                      <strong className="kpi-value">{metrics?.jobs_completed ?? '—'}</strong>
                      <span className="kpi-meta">
                        {metrics?.jobs_processing ?? 0} processando • {metrics?.jobs_queued ?? 0} na fila
                      </span>
                    </div>
                  </div>

                  <div className="kpi-card gold">
                    <div className="kpi-icon-wrap">
                      <Coins size={24} />
                    </div>
                    <div className="kpi-info">
                      <span className="kpi-label">Créditos em Circulação</span>
                      <strong className="kpi-value">{metrics?.total_credits_balance ?? '—'}</strong>
                      <span className="kpi-meta">Saldo ativo total</span>
                    </div>
                  </div>

                  <div className="kpi-card emerald">
                    <div className="kpi-icon-wrap">
                      <Activity size={24} />
                    </div>
                    <div className="kpi-info">
                      <span className="kpi-label">Engajamento Musical</span>
                      <strong className="kpi-value">{metrics?.total_plays ?? 0} plays</strong>
                      <span className="kpi-meta">{metrics?.total_likes ?? 0} curtidas registradas</span>
                    </div>
                  </div>

                  <div className="kpi-card rose">
                    <div className="kpi-icon-wrap">
                      <Shield size={24} />
                    </div>
                    <div className="kpi-info">
                      <span className="kpi-label">Auditoria (Últimas 24h)</span>
                      <strong className="kpi-value">{metrics?.total_audit_events_24h ?? 0}</strong>
                      <span className="kpi-meta">Ações administrativas seguras</span>
                    </div>
                  </div>
                </div>

                {/* Queue Health & Analytics Breakdown */}
                <div className="overview-split-row">
                  {/* Status da Fila IA */}
                  <div className="admin-card">
                    <div className="card-header-row">
                      <div className="card-header-title">
                        <Sparkles size={18} className="text-acid" />
                        <h3>Status do Motor de IA (KIE Pipeline)</h3>
                      </div>
                    </div>

                    <div className="queue-bars-wrap">
                      <div className="queue-bar-item">
                        <div className="queue-bar-label">
                          <span>Concluídas com Sucesso</span>
                          <strong>{metrics?.jobs_completed ?? 0}</strong>
                        </div>
                        <div className="progress-track">
                          <div
                            className="progress-fill green"
                            style={{
                              width: `${Math.min(
                                100,
                                ((metrics?.jobs_completed || 0) /
                                  Math.max(1, (metrics?.jobs_completed || 0) + (metrics?.jobs_failed || 0))) *
                                  100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="queue-bar-item">
                        <div className="queue-bar-label">
                          <span>Em Processamento Ativo</span>
                          <strong>{metrics?.jobs_processing ?? 0}</strong>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill blue" style={{ width: metrics?.jobs_processing ? '100%' : '0%' }} />
                        </div>
                      </div>

                      <div className="queue-bar-item">
                        <div className="queue-bar-label">
                          <span>Na Fila de Espera</span>
                          <strong>{metrics?.jobs_queued ?? 0}</strong>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill yellow" style={{ width: metrics?.jobs_queued ? '100%' : '0%' }} />
                        </div>
                      </div>

                      <div className="queue-bar-item">
                        <div className="queue-bar-label">
                          <span>Falhas Registradas</span>
                          <strong>{metrics?.jobs_failed ?? 0}</strong>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill red" style={{ width: metrics?.jobs_failed ? '100%' : '0%' }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Distribuição por Estilos Mais Tocados */}
                  <div className="admin-card">
                    <div className="card-header-row">
                      <div className="card-header-title">
                        <Music size={18} className="text-purple" />
                        <h3>Estilos Mais Populares</h3>
                      </div>
                    </div>

                    <div className="styles-analytics-list">
                      {analytics.styles?.map((s) => (
                        <div key={s.style} className="style-stat-row">
                          <div className="style-stat-name">
                            <span className="style-pill">{s.style}</span>
                          </div>
                          <strong className="style-stat-count">{s.count} faixas</strong>
                        </div>
                      ))}
                      {(!analytics.styles || analytics.styles.length === 0) && (
                        <p className="empty-notice">Nenhum dado de estilo disponível.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. ABA USUÁRIOS E ESTÚDIOS */}
            {tab === 'users' && (
              <div className="admin-view-table">
                <div className="table-controls-bar">
                  <div className="search-input-wrap">
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Pesquisar por email, nome de exibição ou ID..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                    {userSearch && (
                      <button className="clear-btn" onClick={() => setUserSearch('')}>
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <button
                    className="btn-export-csv"
                    onClick={() =>
                      exportToCSV('usuarios_flowhits', usersData.users, {
                        id: 'ID Usuário',
                        email: 'Email',
                        display_name: 'Nome',
                        is_admin: 'Administrador',
                        admin_role: 'Cargo Admin',
                        is_banned: 'Banido',
                        created_at: 'Cadastrado Em',
                      })
                    }
                    title="Exportar tabela de usuários em CSV"
                  >
                    <Download size={15} />
                    <span>Exportar CSV</span>
                  </button>

                  <div className="table-count-badge">Total: {usersData.total} usuários</div>
                </div>

                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Usuário & Status</th>
                        <th>Papel & Permissão</th>
                        <th>Plano / Assinatura</th>
                        <th>Estúdios & Saldo</th>
                        <th>Métricas</th>
                        <th>Criado em</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersData.users.map((u) => (
                        <tr key={u.id} className={u.is_banned ? 'row-banned' : ''}>
                          <td>
                            <div className="user-cell">
                              <div className={`user-avatar-circle ${u.is_banned ? 'banned' : ''}`}>
                                {u.display_name?.slice(0, 2).toUpperCase() || 'U'}
                              </div>
                              <div>
                                <div className="user-name-line">
                                  <strong>{u.display_name}</strong>
                                  {u.is_banned && <span className="badge-banned"><Ban size={11} /> BANIDO</span>}
                                </div>
                                <span className="cell-subtext">{u.email}</span>
                                <code className="cell-id">{u.id.slice(0, 8)}...</code>
                              </div>
                            </div>
                          </td>

                          <td>
                            {u.is_admin ? (
                              <span className="badge-admin">
                                <Shield size={12} /> {u.admin_role?.toUpperCase()}
                              </span>
                            ) : (
                              <span className="badge-user">Usuário Comum</span>
                            )}
                          </td>

                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span className={`tab-pill ${u.active_subscription?.status === 'active' ? 'highlight' : ''}`}>
                                {u.active_subscription?.plan_tier ? `${u.active_subscription.plan_tier.toUpperCase()} (${u.active_subscription.billing_interval === 'yearly' ? 'Anual' : 'Mensal'})` : 'GRATUITO'}
                              </span>
                              {u.active_subscription?.status === 'active' && (
                                <span style={{ fontSize: '10px', color: '#34d399', fontWeight: 'bold' }}>● Ativa</span>
                              )}
                            </div>
                          </td>

                          <td>
                            <div className="studios-list-cell">
                              {u.studios?.map((s) => (
                                <div key={s.id} className="studio-pill-tag">
                                  <span>{s.name}</span>
                                  <strong className="credits-highlight">
                                    <Coins size={12} /> {s.credits} créditos
                                  </strong>
                                </div>
                              )) || <span className="text-muted">Sem estúdio</span>}
                            </div>
                          </td>

                          <td>
                            <div className="cell-metrics-col">
                              <span>🎵 {u.studios?.reduce((acc, s) => acc + s.tracks_count, 0) || 0} faixas</span>
                              <span>⚡ {u.studios?.reduce((acc, s) => acc + s.jobs_count, 0) || 0} gerações</span>
                            </div>
                          </td>

                          <td>
                            <span className="cell-date">
                              {new Date(u.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          </td>

                          <td>
                            <div className="action-buttons-cell">
                              <button
                                className="btn-action-sm promote"
                                onClick={() => {
                                  setEditNameModal({
                                    userId: u.id,
                                    userEmail: u.email,
                                    currentName: u.display_name,
                                  })
                                  setEditNameNewValue(u.display_name === 'Sem nome' ? '' : (u.display_name || ''))
                                  setEditNameReason('')
                                }}
                                title="Alterar nome do usuário"
                              >
                                <Pencil size={13} /> Nome
                              </button>

                              <button
                                className="btn-action-sm promote"
                                onClick={() => {
                                  setSubModal({
                                    userId: u.id,
                                    userEmail: u.email,
                                    currentPlan: u.active_subscription?.plan_tier || 'none',
                                    currentInterval: u.active_subscription?.billing_interval || 'monthly',
                                    currentStatus: u.active_subscription?.status || 'active',
                                  })
                                  setSubModalPlan(u.active_subscription?.plan_tier || 'lite')
                                  setSubModalInterval(u.active_subscription?.billing_interval || 'monthly')
                                  setSubModalStatus(u.active_subscription?.status || 'active')
                                  setSubModalGrantCredits(true)
                                  setSubModalReason('')
                                }}
                                title="Alterar plano ou assinatura do usuário"
                              >
                                <CreditCard size={13} /> Plano
                              </button>

                              {u.studios?.[0] && (
                                <button
                                  className="btn-action-sm credit"
                                  onClick={() =>
                                    setCreditModal({
                                      studioId: u.studios[0].id,
                                      studioName: u.studios[0].name,
                                      currentBalance: u.studios[0].credits,
                                    })
                                  }
                                  title="Ajustar saldo de créditos"
                                >
                                  <Coins size={13} /> Créditos
                                </button>
                              )}

                              <button
                                className={`btn-action-sm ${u.is_admin ? 'demote' : 'promote'}`}
                                onClick={() =>
                                  setRoleModal({
                                    userId: u.id,
                                    userEmail: u.email,
                                    isAdmin: u.is_admin,
                                  })
                                }
                                title={u.is_admin ? 'Remover acesso admin' : 'Promover a admin'}
                              >
                                {u.is_admin ? <XCircle size={13} /> : <Shield size={13} />}
                                {u.is_admin ? 'Rebaixar' : 'Admin'}
                              </button>

                              {!u.is_admin && (
                                <button
                                  className={`btn-action-sm ${u.is_banned ? 'unban' : 'ban'}`}
                                  onClick={() =>
                                    setBanModal({
                                      userId: u.id,
                                      userEmail: u.email,
                                      isBanned: u.is_banned,
                                    })
                                  }
                                  title={u.is_banned ? 'Remover banimento' : 'Suspender/Banir conta'}
                                >
                                  {u.is_banned ? <Unlock size={13} /> : <Ban size={13} />}
                                  {u.is_banned ? 'Desbanir' : 'Banir'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. ABA MODERAÇÃO DE FAIXAS */}
            {tab === 'tracks' && (
              <div className="admin-view-table">
                <div className="table-controls-bar">
                  <div className="search-input-wrap">
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Pesquisar por título, estilo ou estúdio..."
                      value={trackSearch}
                      onChange={(e) => setTrackSearch(e.target.value)}
                    />
                  </div>

                  <div className="filter-select-wrap">
                    <Filter size={15} />
                    <select
                      value={trackPublicFilter}
                      onChange={(e) => setTrackPublicFilter(e.target.value)}
                    >
                      <option value="all">Todas as Faixas</option>
                      <option value="true">Apenas Públicas</option>
                      <option value="false">Apenas Privadas</option>
                    </select>
                  </div>

                  <button
                    className="btn-export-csv"
                    onClick={() =>
                      exportToCSV('faixas_flowhits', tracksData.tracks, {
                        id: 'ID',
                        title: 'Título',
                        subtitle: 'Subtítulo',
                        style: 'Estilo',
                        voice: 'Voz',
                        is_public: 'Pública',
                        creator_email: 'Criador',
                        plays_count: 'Plays',
                        likes_count: 'Curtidas',
                        created_at: 'Criada Em',
                      })
                    }
                    title="Exportar faixas em CSV"
                  >
                    <Download size={15} />
                    <span>Exportar CSV</span>
                  </button>

                  <div className="table-count-badge">Total: {tracksData.total} faixas</div>
                </div>

                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Prévia & Faixa</th>
                        <th>Estilo & Voz</th>
                        <th>Criador / Estúdio</th>
                        <th>Visibilidade</th>
                        <th>Estatísticas</th>
                        <th>Criado em</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tracksData.tracks.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <div className="track-cell">
                              <button
                                className={`preview-play-btn ${previewTrackId === t.id ? 'playing' : ''}`}
                                onClick={() => togglePreview(t)}
                                title={previewTrackId === t.id ? 'Pausar' : 'Ouvir'}
                              >
                                {previewTrackId === t.id ? <Pause size={14} /> : <Play size={14} />}
                              </button>
                              <div className="track-info-col">
                                <strong>{t.title}</strong>
                                <span className="cell-subtext">{t.subtitle || 'FlowHits'}</span>
                              </div>
                            </div>
                          </td>

                          <td>
                            <div className="style-pill">{t.style}</div>
                            <span className="voice-label">{t.voice || '—'}</span>
                          </td>

                          <td>
                            <div className="cell-info-stack">
                              <strong>{t.studio_name}</strong>
                              <span className="cell-subtext">{t.creator_email}</span>
                            </div>
                          </td>

                          <td>
                            {t.is_public ? (
                              <span className="badge-public">PÚBLICA</span>
                            ) : (
                              <span className="badge-private">PRIVADA</span>
                            )}
                          </td>

                          <td>
                            <div className="stats-inline">
                              <span>▶️ {t.plays_count}</span>
                              <span>❤️ {t.likes_count}</span>
                            </div>
                          </td>

                          <td>
                            <span className="cell-date">
                              {new Date(t.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          </td>

                          <td>
                            <div className="action-buttons-cell">
                              <button
                                className={`btn-action-sm ${t.is_public ? 'unpublish' : 'publish'}`}
                                onClick={() =>
                                  setModerationModal({
                                    trackId: t.id,
                                    trackTitle: t.title,
                                    currentPublic: t.is_public,
                                  })
                                }
                              >
                                {t.is_public ? 'Ocultar' : 'Publicar'}
                              </button>

                              <button
                                className="btn-action-sm danger"
                                onClick={() =>
                                  setDeleteTrackModal({
                                    trackId: t.id,
                                    trackTitle: t.title,
                                  })
                                }
                                title="Excluir faixa permanentemente"
                              >
                                <Trash2 size={13} /> Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. ABA MONITOR DE IA (KIE) */}
            {tab === 'generations' && (
              <div className="admin-view-table">
                <div className="table-controls-bar">
                  <div className="search-input-wrap">
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Pesquisar por prompt, letra ou estúdio..."
                      value={genSearch}
                      onChange={(e) => setGenSearch(e.target.value)}
                    />
                  </div>

                  <div className="filter-select-wrap">
                    <Filter size={15} />
                    <select
                      value={genStatusFilter}
                      onChange={(e) => setGenStatusFilter(e.target.value)}
                    >
                      <option value="all">Todos os Status</option>
                      <option value="queued">Na Fila (Queued)</option>
                      <option value="processing">Processando</option>
                      <option value="completed">Concluídos</option>
                      <option value="failed">Com Falha</option>
                    </select>
                  </div>

                  <button
                    className="btn-export-csv"
                    onClick={() =>
                      exportToCSV('geracoes_ia_flowhits', generationsData.generations, {
                        id: 'ID Job',
                        status: 'Status',
                        requested_by_email: 'Solicitante',
                        studio_name: 'Estúdio',
                        style: 'Estilo',
                        voice: 'Voz',
                        mode: 'Modo',
                        prompt: 'Prompt',
                        failure_reason: 'Motivo Falha',
                        created_at: 'Criado Em',
                      })
                    }
                    title="Exportar gerações em CSV"
                  >
                    <Download size={15} />
                    <span>Exportar CSV</span>
                  </button>

                  <button
                    className="btn-export-csv"
                    onClick={handleReconcileJobs}
                    disabled={reconciling}
                    title="Consultar API da KIE e destravar gerações pendentes"
                  >
                    <RefreshCw size={15} className={reconciling ? 'spinning' : ''} />
                    <span>{reconciling ? 'Reconciliando...' : 'Reconciliar Jobs'}</span>
                  </button>

                  <div className="table-count-badge">Total: {generationsData.total} jobs</div>
                </div>

                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Job ID & Status</th>
                        <th>Solicitante / Estúdio</th>
                        <th>Estilo / Modo</th>
                        <th>Prompt / Letra</th>
                        <th>Faixas</th>
                        <th>Data</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generationsData.generations.map((g) => (
                        <tr key={g.id}>
                          <td>
                            <div className="cell-job-status">
                              <span className={`status-badge-job ${g.status}`}>
                                {g.status === 'completed' && <CheckCircle2 size={12} />}
                                {g.status === 'processing' && <Clock size={12} className="spin" />}
                                {g.status === 'queued' && <Clock size={12} />}
                                {g.status === 'failed' && <AlertTriangle size={12} />}
                                {g.status.toUpperCase()}
                              </span>
                              <code className="cell-id">{g.id.slice(0, 8)}</code>
                            </div>
                          </td>

                          <td>
                            <div className="cell-info-stack">
                              <strong>{g.studio_name}</strong>
                              <span className="cell-subtext">{g.requested_by_email}</span>
                            </div>
                          </td>

                          <td>
                            <div className="style-pill">{g.style}</div>
                            <span className="cell-subtext">{g.mode} • {g.voice}</span>
                          </td>

                          <td>
                            <div className="prompt-preview-cell">
                              <p className="prompt-text-truncate">{g.prompt || g.lyrics || '—'}</p>
                              {(g.prompt || g.lyrics) && (
                                <button
                                  className="btn-view-details"
                                  onClick={() =>
                                    setDetailModal({
                                      title: 'Detalhes da Geração de Música',
                                      data: {
                                        id: g.id,
                                        prompt: g.prompt,
                                        lyrics: g.lyrics,
                                        style: g.style,
                                        voice: g.voice,
                                        mode: g.mode,
                                        provider_task_id: g.provider_task_id,
                                        failure_reason: g.failure_reason,
                                      },
                                    })
                                  }
                                >
                                  Ver completo
                                </button>
                              )}
                            </div>
                          </td>

                          <td>
                            <span className="badge-count">{g.generated_tracks_count} faixa(s)</span>
                          </td>

                          <td>
                            <span className="cell-date">
                              {new Date(g.created_at).toLocaleString('pt-BR')}
                            </span>
                          </td>

                          <td>
                            {g.status === 'failed' && (
                              <button
                                className="btn-action-sm retry"
                                onClick={() =>
                                  setRetryModal({
                                    genId: g.id,
                                    prompt: g.prompt || g.style,
                                  })
                                }
                              >
                                <RefreshCw size={12} /> Reprocessar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. ABA LIVRO-RAZÃO DE CRÉDITOS */}
            {tab === 'credits' && (
              <div className="admin-view-table">
                <div className="table-controls-bar">
                  <div className="search-input-wrap">
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Pesquisar por estúdio ou slug..."
                      value={ledgerSearch}
                      onChange={(e) => setLedgerSearch(e.target.value)}
                    />
                  </div>

                  <div className="filter-select-wrap">
                    <Filter size={15} />
                    <select
                      value={ledgerReasonFilter}
                      onChange={(e) => setLedgerReasonFilter(e.target.value)}
                    >
                      <option value="all">Todos os Motivos</option>
                      <option value="initial_grant">Concessão Inicial (initial_grant)</option>
                      <option value="adjustment">Ajuste Manual (adjustment)</option>
                      <option value="generation">Geração de Música (generation)</option>
                      <option value="purchase">Compra de Pacote (purchase)</option>
                      <option value="refund">Reembolso (refund)</option>
                    </select>
                  </div>

                  <button
                    className="btn-export-csv"
                    onClick={() =>
                      exportToCSV('livro_razao_creditos', ledgerData.movements, {
                        id: 'ID Transação',
                        studio_name: 'Estúdio',
                        studio_slug: 'Slug',
                        amount: 'Quantia',
                        reason: 'Motivo',
                        created_at: 'Data',
                      })
                    }
                    title="Exportar livro-razão em CSV"
                  >
                    <Download size={15} />
                    <span>Exportar CSV</span>
                  </button>

                  <div className="table-count-badge">Total: {ledgerData.total} movimentações</div>
                </div>

                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Estúdio</th>
                        <th>Quantia de Créditos</th>
                        <th>Motivo / Origem</th>
                        <th>ID da Transação</th>
                        <th>Data e Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerData.movements.map((m) => (
                        <tr key={m.id}>
                          <td>
                            <div className="cell-info-stack">
                              <strong>{m.studio_name}</strong>
                              <span className="cell-subtext">{m.studio_slug}</span>
                            </div>
                          </td>

                          <td>
                            <span className={`credit-delta-badge ${m.amount > 0 ? 'positive' : 'negative'}`}>
                              {m.amount > 0 ? `+${m.amount}` : m.amount} créditos
                            </span>
                          </td>

                          <td>
                            <span className="reason-pill">{m.reason}</span>
                          </td>

                          <td>
                            <code className="cell-id">{m.id}</code>
                          </td>

                          <td>
                            <span className="cell-date">
                              {new Date(m.created_at).toLocaleString('pt-BR')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 6. ABA LOGS DE AUDITORIA */}
            {tab === 'audit' && (
              <div className="admin-view-table">
                <div className="audit-security-banner">
                  <div className="audit-shield-icon">
                    <Lock size={20} />
                  </div>
                  <div>
                    <h4>Trilha de Auditoria Blindada & Criptograficamente Imutável</h4>
                    <p>
                      Gatilhos no PostgreSQL impedem UPDATE e DELETE. Toda e qualquer ação de administrador é
                      auditada permanentemente.
                    </p>
                  </div>
                </div>

                <div className="table-controls-bar">
                  <div className="search-input-wrap">
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Pesquisar por email do autor, ação, ID ou detalhes..."
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                    />
                  </div>

                  <div className="filter-select-wrap">
                    <Filter size={15} />
                    <select
                      value={auditActionFilter}
                      onChange={(e) => setAuditActionFilter(e.target.value)}
                    >
                      <option value="all">Todas as Ações</option>
                      <option value="CREDIT_ADJUSTMENT">CREDIT_ADJUSTMENT (Ajuste de Crédito)</option>
                      <option value="TRACK_MODERATION">TRACK_MODERATION (Moderação de Música)</option>
                      <option value="TRACK_DELETION">TRACK_DELETION (Exclusão de Música)</option>
                      <option value="USER_ROLE_CHANGE">USER_ROLE_CHANGE (Alteração de Cargo)</option>
                      <option value="USER_SUSPENSION">USER_SUSPENSION (Banimento)</option>
                      <option value="SYSTEM_SETTING_CHANGE">SYSTEM_SETTING_CHANGE (Configurações)</option>
                      <option value="GENERATION_RETRY">GENERATION_RETRY (Reprocessamento)</option>
                    </select>
                  </div>

                  <button
                    className="btn-export-csv"
                    onClick={() =>
                      exportToCSV('auditoria_flowhits', auditData.logs, {
                        id: 'ID Log',
                        created_at: 'Data Hora',
                        actor_email: 'Administrador',
                        action: 'Ação',
                        target_type: 'Tipo Alvo',
                        target_id: 'ID Alvo',
                        details: 'Detalhes JSON',
                      })
                    }
                    title="Exportar logs em CSV"
                  >
                    <Download size={15} />
                    <span>Exportar CSV</span>
                  </button>

                  <div className="table-count-badge highlight">Total: {auditData.total} logs</div>
                </div>

                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Data & Hora</th>
                        <th>Administrador / Autor</th>
                        <th>Ação Realizada</th>
                        <th>Entidade / Alvo</th>
                        <th>Justificativa & Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditData.logs.map((log) => (
                        <tr key={log.id}>
                          <td>
                            <span className="cell-date">
                              {new Date(log.created_at).toLocaleString('pt-BR')}
                            </span>
                          </td>

                          <td>
                            <div className="cell-info-stack">
                              <strong>{log.actor_email}</strong>
                              <code className="cell-id">{log.actor_id?.slice(0, 8) || 'SISTEMA'}</code>
                            </div>
                          </td>

                          <td>
                            <span className="audit-action-tag">{log.action}</span>
                          </td>

                          <td>
                            <div className="target-pill">
                              <span>{log.target_type}</span>
                              {log.target_id && <code>{log.target_id.slice(0, 8)}</code>}
                            </div>
                          </td>

                          <td>
                            <div className="audit-details-cell">
                              {log.details?.reason && (
                                <p className="audit-reason-text">
                                  <strong>Motivo:</strong> {log.details.reason}
                                </p>
                              )}
                              <button
                                className="btn-view-details"
                                onClick={() =>
                                  setDetailModal({
                                    title: `Detalhes do Log: ${log.action}`,
                                    data: log,
                                  })
                                }
                              >
                                Inspecionar JSON
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 7. ABA SEGURANÇA DE IP & RATE LIMITS */}
            {tab === 'security' && (
              <div className="admin-view-security">
                {/* Security Rules Cards */}
                <div className="security-rules-grid">
                  <div className="rule-card">
                    <div className="rule-header">
                      <span className="rule-tag green">ATIVO</span>
                      <h4>⚡ Gerações Simultâneas</h4>
                    </div>
                    <p className="rule-limit"><strong>Máximo 2 jobs</strong> em andamento por usuário/estúdio</p>
                    <span className="rule-subtext">Bloqueia criação do 3º job até conclusão do anterior</span>
                  </div>

                  <div className="rule-card">
                    <div className="rule-header">
                      <span className="rule-tag blue">ATIVO</span>
                      <h4>🔑 Tentativas de Login</h4>
                    </div>
                    <p className="rule-limit"><strong>Máximo 5 tentativas</strong> por minuto por IP</p>
                    <span className="rule-subtext">Proteção ativa contra ataques de força bruta</span>
                  </div>

                  <div className="rule-card">
                    <div className="rule-header">
                      <span className="rule-tag purple">ATIVO</span>
                      <h4>📝 Limite de Contas / IP</h4>
                    </div>
                    <p className="rule-limit"><strong>Máximo 3 cadastros</strong> por dia por IP</p>
                    <span className="rule-subtext">Anti-farming de créditos bônus de cadastro</span>
                  </div>

                  <div className="rule-card">
                    <div className="rule-header">
                      <span className="rule-tag acid">ATIVO</span>
                      <h4>❤️ Interações & Plays</h4>
                    </div>
                    <p className="rule-limit"><strong>Máximo 60 requisições</strong> por minuto por IP</p>
                    <span className="rule-subtext">Prevenção contra bots inflando métricas</span>
                  </div>
                </div>

                {/* Tabela de IPs Mais Ativos e Multi-Contas */}
                <div className="admin-card">
                  <div className="card-header-row">
                    <div className="card-header-title">
                      <Users size={18} className="text-purple" />
                      <h3>IPs Monitorados & Detecção de Multi-Contas</h3>
                    </div>
                    <button
                      className="btn-export-csv"
                      onClick={() =>
                        exportToCSV('ips_monitorados_flowhits', ipSecurity.top_ips, {
                          ip_address: 'Endereço IP',
                          total_requests: 'Total Requisições',
                          distinct_users_count: 'Usuários Distintos',
                          is_blocked: 'Bloqueado',
                          last_seen_at: 'Última Atividade',
                        })
                      }
                    >
                      <Download size={14} />
                      <span>Exportar IPs</span>
                    </button>
                  </div>

                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Endereço IP</th>
                          <th>Total Requisições</th>
                          <th>Contas Distintas no IP</th>
                          <th>Status</th>
                          <th>Última Atividade</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ipSecurity.top_ips?.map((item) => (
                          <tr key={item.ip_address}>
                            <td>
                              <code className="ip-code">{item.ip_address}</code>
                            </td>

                            <td>
                              <strong>{item.total_requests} reqs</strong>
                            </td>

                            <td>
                              <span className={`multi-account-badge ${item.distinct_users_count > 2 ? 'warning' : ''}`}>
                                👥 {item.distinct_users_count} conta(s)
                              </span>
                            </td>

                            <td>
                              {item.is_blocked ? (
                                <span className="badge-banned"><Ban size={11} /> BLOQUEADO</span>
                              ) : (
                                <span className="badge-public">NORMAL</span>
                              )}
                            </td>

                            <td>
                              <span className="cell-date">
                                {new Date(item.last_seen_at).toLocaleString('pt-BR')}
                              </span>
                            </td>

                            <td>
                              <button
                                className={`btn-action-sm ${item.is_blocked ? 'unban' : 'ban'}`}
                                onClick={() =>
                                  setIpBlockModal({
                                    ip: item.ip_address,
                                    isBlocked: item.is_blocked,
                                  })
                                }
                              >
                                {item.is_blocked ? <Unlock size={12} /> : <Ban size={12} />}
                                {item.is_blocked ? 'Desbloquear IP' : 'Bloquear IP'}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {(!ipSecurity.top_ips || ipSecurity.top_ips.length === 0) && (
                          <tr>
                            <td colSpan={6} className="text-center">Nenhum IP monitorado ainda.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tabela de IPs Bloqueados na Blacklist */}
                <div className="admin-card">
                  <div className="card-header-row">
                    <div className="card-header-title">
                      <Ban size={18} className="text-red" />
                      <h3>Blacklist de IPs Bloqueados</h3>
                    </div>
                  </div>

                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Endereço IP</th>
                          <th>Motivo do Bloqueio</th>
                          <th>Bloqueado Em</th>
                          <th>Bloqueado Até</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ipSecurity.blocked_ips?.map((b) => (
                          <tr key={b.ip}>
                            <td>
                              <code className="ip-code text-red">{b.ip}</code>
                            </td>
                            <td>
                              <strong>{b.motivo}</strong>
                            </td>
                            <td>
                              <span className="cell-date">{new Date(b.bloqueado_em).toLocaleString('pt-BR')}</span>
                            </td>
                            <td>
                              <span className="cell-date">
                                {b.bloqueado_ate ? new Date(b.bloqueado_ate).toLocaleString('pt-BR') : 'Permanente'}
                              </span>
                            </td>
                            <td>
                              <button
                                className="btn-action-sm unban"
                                onClick={() =>
                                  setIpBlockModal({
                                    ip: b.ip,
                                    isBlocked: true,
                                  })
                                }
                              >
                                <Unlock size={12} /> Desbloquear
                              </button>
                            </td>
                          </tr>
                        ))}
                        {(!ipSecurity.blocked_ips || ipSecurity.blocked_ips.length === 0) && (
                          <tr>
                            <td colSpan={5} className="text-center">Nenhum IP bloqueado no momento.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Rate Limits Ativos */}
                <div className="admin-card">
                  <div className="card-header-row">
                    <div className="card-header-title">
                      <Clock size={18} className="text-acid" />
                      <h3>Rate Limits Ativos em Memória</h3>
                    </div>
                  </div>

                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Chave Identificadora</th>
                          <th>Requisições na Janela</th>
                          <th>Início da Janela</th>
                          <th>Expira Em</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ipSecurity.active_limits?.map((rl) => (
                          <tr key={rl.chave}>
                            <td>
                              <code>{rl.chave}</code>
                            </td>
                            <td>
                              <strong className="credits-highlight">{rl.contador} requisições</strong>
                            </td>
                            <td>
                              <span className="cell-date">{new Date(rl.janela_inicio).toLocaleTimeString('pt-BR')}</span>
                            </td>
                            <td>
                              <span className="cell-date">{new Date(rl.expires_at).toLocaleTimeString('pt-BR')}</span>
                            </td>
                            <td>
                              <button
                                className="btn-action-sm retry"
                                onClick={() => handleResetRateLimit(rl.chave)}
                              >
                                <RefreshCw size={12} /> Resetar
                              </button>
                            </td>
                          </tr>
                        ))}
                        {(!ipSecurity.active_limits || ipSecurity.active_limits.length === 0) && (
                          <tr>
                            <td colSpan={5} className="text-center">Nenhum rate limit ativo no momento.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 8. ABA ASSINATURAS & FATURAMENTO STRIPE */}
            {tab === 'subscriptions' && (
              <div className="admin-view-table">
                {/* Financial KPI Cards */}
                <div className="kpi-grid">
                  <div className="kpi-card emerald">
                    <div className="kpi-icon-wrap">
                      <CreditCard size={24} />
                    </div>
                    <div className="kpi-info">
                      <span className="kpi-label">MRR Estimado (Receita Mensal)</span>
                      <strong className="kpi-value">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subsData.mrr || 0)}
                      </strong>
                      <span className="kpi-meta">Base de assinaturas ativas</span>
                    </div>
                  </div>

                  <div className="kpi-card acid">
                    <div className="kpi-icon-wrap">
                      <Users size={24} />
                    </div>
                    <div className="kpi-info">
                      <span className="kpi-label">Total de Assinaturas</span>
                      <strong className="kpi-value">{subsData.total}</strong>
                      <span className="kpi-meta">Lite, Plus e Pro</span>
                    </div>
                  </div>
                </div>

                <div className="table-controls-bar">
                  <div className="search-input-wrap">
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Pesquisar por email, estúdio ou plano..."
                      value={subSearch}
                      onChange={(e) => setSubSearch(e.target.value)}
                    />
                  </div>

                  <div className="filter-select-wrap">
                    <Filter size={15} />
                    <select
                      value={subStatusFilter}
                      onChange={(e) => setSubStatusFilter(e.target.value)}
                    >
                      <option value="all">Todos os Status</option>
                      <option value="active">Ativas (active)</option>
                      <option value="past_due">Inadimplentes (past_due)</option>
                      <option value="canceled">Canceladas (canceled)</option>
                      <option value="trialing">Em Teste (trialing)</option>
                    </select>
                  </div>

                  <button
                    className="btn-export-csv"
                    onClick={() =>
                      exportToCSV('assinaturas_stripe_flowhits', subsData.subscriptions, {
                        id: 'ID',
                        user_email: 'Email Usuário',
                        studio_name: 'Estúdio',
                        plan_tier: 'Plano',
                        billing_interval: 'Intervalo',
                        credits_per_interval: 'Créditos/Ciclo',
                        status: 'Status',
                        current_period_end: 'Próxima Fatura',
                        stripe_subscription_id: 'Stripe Sub ID',
                        created_at: 'Criada Em',
                      })
                    }
                  >
                    <Download size={15} />
                    <span>Exportar CSV</span>
                  </button>

                  <div className="table-count-badge">Total: {subsData.total} assinaturas</div>
                </div>

                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Usuário & Estúdio</th>
                        <th>Plano & Ciclo</th>
                        <th>Créditos Recorrentes</th>
                        <th>Status</th>
                        <th>Vigência / Próx. Fatura</th>
                        <th>Stripe Sub ID</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subsData.subscriptions?.map((sub) => (
                        <tr key={sub.id}>
                          <td>
                            <div className="cell-info-stack">
                              <strong>{sub.user_email}</strong>
                              <span className="cell-subtext">{sub.studio_name || 'Estúdio'}</span>
                            </div>
                          </td>

                          <td>
                            <div className="style-pill">
                              {sub.plan_tier?.toUpperCase()} ({sub.billing_interval === 'yearly' ? 'Anual' : 'Mensal'})
                            </div>
                          </td>

                          <td>
                            <span className="credits-highlight">
                              <Coins size={13} /> {sub.credits_per_interval} créditos
                            </span>
                          </td>

                          <td>
                            <span className={`status-badge-job ${sub.status === 'active' ? 'completed' : sub.status === 'past_due' ? 'failed' : 'queued'}`}>
                              {sub.status?.toUpperCase()}
                            </span>
                          </td>

                          <td>
                            <span className="cell-date">
                              {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('pt-BR') : '—'}
                            </span>
                          </td>

                          <td>
                            <code className="cell-id">{sub.stripe_subscription_id}</code>
                          </td>

                          <td>
                            <button
                              className="btn-action-sm promote"
                              onClick={() => {
                                setSubModal({
                                  userId: sub.user_id,
                                  userEmail: sub.user_email,
                                  currentPlan: sub.plan_tier,
                                  currentInterval: sub.billing_interval,
                                  currentStatus: sub.status,
                                })
                                setSubModalPlan(sub.plan_tier)
                                setSubModalInterval(sub.billing_interval)
                                setSubModalStatus(sub.status)
                                setSubModalGrantCredits(false)
                                setSubModalReason('')
                              }}
                              title="Alterar plano de assinatura"
                            >
                              <CreditCard size={13} /> Alterar
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(!subsData.subscriptions || subsData.subscriptions.length === 0) && (
                        <tr>
                          <td colSpan={7} className="text-center">Nenhuma assinatura encontrada.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 9. ABA CONFIGURAÇÕES GLOBAIS DO SISTEMA */}
            {tab === 'settings' && (
              <div className="admin-view-settings">
                <div className="settings-grid">
                  {settingsList.map((cfg) => (
                    <div key={cfg.chave} className="setting-card">
                      <div className="setting-card-header">
                        <div className="setting-card-title">
                          <Settings size={18} className="text-acid" />
                          <h4><code>{cfg.chave}</code></h4>
                        </div>
                        <button
                          className="btn-action-sm promote"
                          onClick={() => {
                            setSettingEditModal({
                              key: cfg.chave,
                              value: cfg.valor,
                              desc: cfg.descricao,
                            })
                            setSettingEditValue(
                              typeof cfg.valor === 'object'
                                ? JSON.stringify(cfg.valor, null, 2)
                                : String(cfg.valor)
                            )
                          }}
                        >
                          Editar
                        </button>
                      </div>

                      <p className="setting-desc">{cfg.descricao}</p>

                      <div className="setting-value-box">
                        <span className="setting-label">Valor Atual:</span>
                        <code className="setting-val-code">{JSON.stringify(cfg.valor)}</code>
                      </div>

                      <span className="setting-updated-at">
                        Última alteração: {new Date(cfg.updated_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 8. ABA SAÚDE DO SISTEMA */}
            {tab === 'health' && (
              <div className="admin-view-health">
                <div className="health-cards-grid">
                  <div className="health-card active">
                    <div className="health-icon-wrap green">
                      <Database size={24} />
                    </div>
                    <div className="health-info">
                      <h4>Supabase PostgreSQL</h4>
                      <p>Conexão ativa e tabelas indexadas com RLS estrito.</p>
                      <span className="health-badge green">OPERACIONAL</span>
                    </div>
                  </div>

                  <div className="health-card active">
                    <div className="health-icon-wrap blue">
                      <Lock size={24} />
                    </div>
                    <div className="health-info">
                      <h4>Segurança & RBAC</h4>
                      <p>Políticas RLS e funções SECURITY DEFINER ativas.</p>
                      <span className="health-badge blue">BLINDADO</span>
                    </div>
                  </div>

                  <div className="health-card active">
                    <div className="health-icon-wrap purple">
                      <Shield size={24} />
                    </div>
                    <div className="health-info">
                      <h4>Imutabilidade de Auditoria</h4>
                      <p>Gatilhos de proteção contra UPDATE e DELETE funcionando.</p>
                      <span className="health-badge purple">ATIVO</span>
                    </div>
                  </div>

                  <div className="health-card active">
                    <div className="health-icon-wrap acid">
                      <Wand2 size={24} />
                    </div>
                    <div className="health-info">
                      <h4>Edge Functions (KIE IA)</h4>
                      <p>Integração de geração e sincronização automática.</p>
                      <span className="health-badge green">ONLINE</span>
                    </div>
                  </div>
                </div>

                <div className="admin-card">
                  <h3>Checklist de Integridade do Sistema</h3>
                  <ul className="integrity-checklist">
                    <li>
                      <CheckCircle2 size={16} className="text-green" />
                      <span>Tabela de Administradores configurada com RLS estrito</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="text-green" />
                      <span>Trilha de Auditoria persistida em <code>public.admin_audit_logs</code></span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="text-green" />
                      <span>Gatilho de proteção contra adulteração de logs ativo</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="text-green" />
                      <span>Sistema de Banimento/Suspensão de contas configurado</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="text-green" />
                      <span>Exportação para planilhas CSV integrada em todos os módulos</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="text-green" />
                      <span>Tabela de Configurações Globais dinâmicas ativa</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
        </main>
      </div>

      {/* --- MODAIS --- */}

      {/* Modal Ajuste de Créditos */}
      {creditModal && (
        <div className="admin-modal-backdrop" onClick={() => setCreditModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Ajustar Créditos do Estúdio</h3>
              <button className="admin-modal-close" onClick={() => setCreditModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body">
              <p>
                Estúdio: <strong>{creditModal.studioName}</strong>
              </p>
              <p>
                Saldo Atual: <strong>{creditModal.currentBalance} créditos</strong>
              </p>

              <div className="form-group">
                <label>Quantidade a Adicionar ou Deduzir (Ex: 10 ou -5):</label>
                <input
                  type="number"
                  placeholder="Ex: 10"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Justificativa Obrigatória (Auditoria):</label>
                <input
                  type="text"
                  placeholder="Ex: Bonificação promocional, Correção de falha..."
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Nota Adicional / Observação (Opcional):</label>
                <textarea
                  placeholder="Detalhes adicionais..."
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-cancel" onClick={() => setCreditModal(null)}>
                Cancelar
              </button>
              <button
                className="btn-confirm primary"
                onClick={handleAdjustCredits}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processando...' : 'Confirmar Ajuste'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Alternar Cargo Admin */}
      {roleModal && (
        <div className="admin-modal-backdrop" onClick={() => setRoleModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{roleModal.isAdmin ? 'Remover Acesso Administrador' : 'Promover a Administrador'}</h3>
              <button className="admin-modal-close" onClick={() => setRoleModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body">
              <p>
                Usuário: <strong>{roleModal.userEmail}</strong>
              </p>
              <p>
                Ação:{' '}
                <strong>{roleModal.isAdmin ? 'Revogar privilégios' : 'Conceder privilégios'}</strong>
              </p>

              <div className="form-group">
                <label>Justificativa Obrigatória para Auditoria:</label>
                <input
                  type="text"
                  placeholder="Ex: Membro da equipe técnica..."
                  value={roleReason}
                  onChange={(e) => setRoleReason(e.target.value)}
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-cancel" onClick={() => setRoleModal(null)}>
                Cancelar
              </button>
              <button
                className={`btn-confirm ${roleModal.isAdmin ? 'danger' : 'primary'}`}
                onClick={handleToggleAdminRole}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processando...' : 'Confirmar Alteração'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Banimento de Usuário */}
      {banModal && (
        <div className="admin-modal-backdrop" onClick={() => setBanModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{banModal.isBanned ? 'Remover Suspensão (Desbanir)' : 'Suspender / Banir Usuário'}</h3>
              <button className="admin-modal-close" onClick={() => setBanModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body">
              <p>
                Usuário: <strong>{banModal.userEmail}</strong>
              </p>
              <p>
                Status Atual:{' '}
                <strong className={banModal.isBanned ? 'text-red' : 'text-green'}>
                  {banModal.isBanned ? 'CONTA SUSPENSA' : 'CONTA ATIVA'}
                </strong>
              </p>

              <div className="form-group">
                <label>Justificativa Obrigatória do Banimento / Desbanimento:</label>
                <input
                  type="text"
                  placeholder="Ex: Violação de termos de uso, Abuso de prompts..."
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-cancel" onClick={() => setBanModal(null)}>
                Cancelar
              </button>
              <button
                className={`btn-confirm ${banModal.isBanned ? 'primary' : 'danger'}`}
                onClick={handleToggleBanUser}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processando...' : banModal.isBanned ? 'Desbanir Usuário' : 'Suspender Conta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Moderação de Faixa */}
      {moderationModal && (
        <div className="admin-modal-backdrop" onClick={() => setModerationModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Moderação de Faixa</h3>
              <button className="admin-modal-close" onClick={() => setModerationModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body">
              <p>
                Faixa: <strong>{moderationModal.trackTitle}</strong>
              </p>
              <p>
                Ação:{' '}
                <strong>
                  {moderationModal.currentPublic
                    ? 'Ocultar da Biblioteca Pública'
                    : 'Tornar Pública na Biblioteca Global'}
                </strong>
              </p>

              <div className="form-group">
                <label>Motivo da Moderação (Obrigatório):</label>
                <input
                  type="text"
                  placeholder="Ex: Solicitação do autor, Destaque da semana..."
                  value={moderationReason}
                  onChange={(e) => setModerationReason(e.target.value)}
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-cancel" onClick={() => setModerationModal(null)}>
                Cancelar
              </button>
              <button
                className="btn-confirm primary"
                onClick={handleModerateTrack}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processando...' : 'Confirmar Moderação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Exclusão de Faixa */}
      {deleteTrackModal && (
        <div className="admin-modal-backdrop" onClick={() => setDeleteTrackModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Excluir Faixa Permanentemente</h3>
              <button className="admin-modal-close" onClick={() => setDeleteTrackModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body">
              <p>
                Faixa: <strong>{deleteTrackModal.trackTitle}</strong>
              </p>
              <p className="text-red">
                ⚠️ Esta ação removerá a música de forma definitiva do catálogo.
              </p>

              <div className="form-group">
                <label>Justificativa da Exclusão (Auditoria):</label>
                <input
                  type="text"
                  placeholder="Ex: Conteúdo impróprio, Direitos autorais..."
                  value={deleteTrackReason}
                  onChange={(e) => setDeleteTrackReason(e.target.value)}
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-cancel" onClick={() => setDeleteTrackModal(null)}>
                Cancelar
              </button>
              <button
                className="btn-confirm danger"
                onClick={handleDeleteTrack}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processando...' : 'Excluir Faixa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Configuração do Sistema */}
      {settingEditModal && (
        <div className="admin-modal-backdrop" onClick={() => setSettingEditModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Editar Configuração do Sistema</h3>
              <button className="admin-modal-close" onClick={() => setSettingEditModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body">
              <p>
                Chave: <code>{settingEditModal.key}</code>
              </p>
              <p className="cell-subtext">{settingEditModal.desc}</p>

              <div className="form-group">
                <label>Novo Valor (JSON ou Texto/Número):</label>
                <textarea
                  value={settingEditValue}
                  onChange={(e) => setSettingEditValue(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label>Justificativa da Alteração (Obrigatória):</label>
                <input
                  type="text"
                  placeholder="Ex: Ajuste de preço, Ativação de comunicado..."
                  value={settingEditReason}
                  onChange={(e) => setSettingEditReason(e.target.value)}
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-cancel" onClick={() => setSettingEditModal(null)}>
                Cancelar
              </button>
              <button
                className="btn-confirm primary"
                onClick={handleUpdateSetting}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processando...' : 'Salvar Configuração'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reprocessar Geração */}
      {retryModal && (
        <div className="admin-modal-backdrop" onClick={() => setRetryModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Reenfileirar Geração</h3>
              <button className="admin-modal-close" onClick={() => setRetryModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body">
              <p>
                Geração: <code>{retryModal.genId}</code>
              </p>
              <p>
                Prompt / Estilo: <em>{retryModal.prompt}</em>
              </p>

              <div className="form-group">
                <label>Justificativa do Reprocessamento:</label>
                <input
                  type="text"
                  placeholder="Ex: Instabilidade temporária da API de IA resolvida..."
                  value={retryReason}
                  onChange={(e) => setRetryReason(e.target.value)}
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-cancel" onClick={() => setRetryModal(null)}>
                Cancelar
              </button>
              <button
                className="btn-confirm primary"
                onClick={handleRetryGeneration}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processando...' : 'Reenfileirar Job'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Bloquear/Desbloquear IP */}
      {ipBlockModal && (
        <div className="admin-modal-backdrop" onClick={() => setIpBlockModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{ipBlockModal.isBlocked ? 'Desbloquear Endereço IP' : 'Bloquear IP na Blacklist'}</h3>
              <button className="admin-modal-close" onClick={() => setIpBlockModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body">
              <p>
                Endereço IP: <code>{ipBlockModal.ip}</code>
              </p>
              <p>
                Ação:{' '}
                <strong className={ipBlockModal.isBlocked ? 'text-green' : 'text-red'}>
                  {ipBlockModal.isBlocked ? 'Remover da Blacklist (Permitir Acesso)' : 'Bloquear Acesso Total do IP'}
                </strong>
              </p>

              {!ipBlockModal.isBlocked && (
                <div className="form-group">
                  <label>Duração do Bloqueio:</label>
                  <select
                    value={ipBlockHours}
                    onChange={(e) => setIpBlockHours(e.target.value)}
                  >
                    <option value="1">1 hora</option>
                    <option value="6">6 horas</option>
                    <option value="24">24 horas (1 dia)</option>
                    <option value="168">7 dias</option>
                    <option value="720">30 dias</option>
                    <option value="0">Permanente (Sem expiração)</option>
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Justificativa Obrigatória (Auditoria):</label>
                <input
                  type="text"
                  placeholder="Ex: Ataque de força bruta, Abuso de requisições, Bot..."
                  value={ipBlockReason}
                  onChange={(e) => setIpBlockReason(e.target.value)}
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-cancel" onClick={() => setIpBlockModal(null)}>
                Cancelar
              </button>
              <button
                className={`btn-confirm ${ipBlockModal.isBlocked ? 'primary' : 'danger'}`}
                onClick={handleToggleBlockIp}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processando...' : ipBlockModal.isBlocked ? 'Desbloquear IP' : 'Bloquear IP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Alterar Assinatura do Usuário */}
      {subModal && (
        <div className="admin-modal-backdrop" onClick={() => setSubModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Alterar Assinatura do Usuário</h3>
              <button className="admin-modal-close" onClick={() => setSubModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body">
              <p>
                Usuário: <strong>{subModal.userEmail}</strong>
              </p>
              <p>
                Plano Atual:{' '}
                <strong className="text-purple">
                  {subModal.currentPlan ? subModal.currentPlan.toUpperCase() : 'NENHUM (GRATUITO)'} ({subModal.currentInterval === 'yearly' ? 'Anual' : 'Mensal'}) - {subModal.currentStatus}
                </strong>
              </p>

              <div className="form-group">
                <label>Novo Plano:</label>
                <select
                  value={subModalPlan}
                  onChange={(e) => setSubModalPlan(e.target.value)}
                >
                  <option value="none">Nenhum (Gratuito / Cancelar)</option>
                  <option value="lite">Lite (200 créditos/mês - R$ 30/mês)</option>
                  <option value="plus">Plus (600 créditos/mês - R$ 90/mês)</option>
                  <option value="pro">Pro (1.600 créditos/mês - R$ 240/mês)</option>
                </select>
              </div>

              {subModalPlan !== 'none' && (
                <>
                  <div className="form-group">
                    <label>Ciclo de Cobrança:</label>
                    <select
                      value={subModalInterval}
                      onChange={(e) => setSubModalInterval(e.target.value)}
                    >
                      <option value="monthly">Mensal</option>
                      <option value="yearly">Anual (20% OFF)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Status da Assinatura:</label>
                    <select
                      value={subModalStatus}
                      onChange={(e) => setSubModalStatus(e.target.value)}
                    >
                      <option value="active">Ativa (active)</option>
                      <option value="canceled">Cancelada (canceled)</option>
                      <option value="past_due">Inadimplente (past_due)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
                    <input
                      type="checkbox"
                      id="grantCreditsCheck"
                      checked={subModalGrantCredits}
                      onChange={(e) => setSubModalGrantCredits(e.target.checked)}
                    />
                    <label htmlFor="grantCreditsCheck" style={{ fontSize: '12px', color: '#f1f5f9', cursor: 'pointer' }}>
                      Injetar créditos do plano imediatamente no estúdio
                    </label>
                  </div>
                </>
              )}

              <div className="form-group">
                <label>Justificativa Obrigatória (Auditoria):</label>
                <input
                  type="text"
                  placeholder="Ex: Upgrade de cortesia, Migração manual, Troca solicitada..."
                  value={subModalReason}
                  onChange={(e) => setSubModalReason(e.target.value)}
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-cancel" onClick={() => setSubModal(null)}>
                Cancelar
              </button>
              <button
                className="btn-confirm primary"
                onClick={handleChangeSubscription}
                disabled={actionLoading}
              >
                {actionLoading ? 'Salvando...' : 'Salvar Assinatura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Alterar Nome do Usuário */}
      {editNameModal && (
        <div className="admin-modal-backdrop" onClick={() => setEditNameModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>✏️ Alterar Nome do Usuário</h3>
              <button className="admin-modal-close" onClick={() => setEditNameModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body">
              <p>
                Usuário: <strong>{editNameModal.userEmail}</strong>
              </p>
              <p>
                Nome Atual: <strong>{editNameModal.currentName || 'Sem nome'}</strong>
              </p>

              <div className="form-group">
                <label>Novo Nome Próprio / Exibição:</label>
                <input
                  type="text"
                  placeholder="Ex: João da Silva ou DJ Flow"
                  value={editNameNewValue}
                  onChange={(e) => setEditNameNewValue(e.target.value)}
                  maxLength={50}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>Justificativa Opcional (Auditoria):</label>
                <input
                  type="text"
                  placeholder="Ex: Solicitação do usuário, correção de apelido..."
                  value={editNameReason}
                  onChange={(e) => setEditNameReason(e.target.value)}
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-cancel" onClick={() => setEditNameModal(null)}>
                Cancelar
              </button>
              <button
                className="btn-confirm primary"
                onClick={handleUpdateUserName}
                disabled={actionLoading || !editNameNewValue.trim()}
              >
                {actionLoading ? 'Salvando...' : 'Salvar Novo Nome'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Transmissão de Notificação Global (Broadcast) */}
      {openBroadcastModal && (
        <div className="admin-modal-backdrop" onClick={() => setOpenBroadcastModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>📢 Transmitir Notificação Global</h3>
              <button className="admin-modal-close" onClick={() => setOpenBroadcastModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body">
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 10px' }}>
                Esta mensagem aparecerá instantaneamente na <strong>Central de Notificações</strong> de todos os usuários da plataforma.
              </p>

              <div className="form-group">
                <label>Categoria do Aviso:</label>
                <select
                  value={broadcastCategory}
                  onChange={(e) => setBroadcastCategory(e.target.value)}
                >
                  <option value="announcement">📢 Comunicado Oficial</option>
                  <option value="promo">🎁 Novidade / Promoção</option>
                  <option value="info">ℹ️ Informativo Geral</option>
                  <option value="warning">⚠️ Aviso Importante / Manutenção</option>
                </select>
              </div>

              <div className="form-group">
                <label>Título da Notificação:</label>
                <input
                  type="text"
                  placeholder="Ex: 🔥 Novos Estilos e Recursos Disponíveis!"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Mensagem Completa:</label>
                <textarea
                  rows={3}
                  placeholder="Ex: Acabamos de adicionar novos modelos de geração de áudio. Experimente agora no Estúdio..."
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Link de Destino Opcional (ao clicar na notificação):</label>
                <input
                  type="text"
                  placeholder="Ex: /studio ou /plans"
                  value={broadcastLink}
                  onChange={(e) => setBroadcastLink(e.target.value)}
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-cancel" onClick={() => setOpenBroadcastModal(false)}>
                Cancelar
              </button>
              <button
                className="btn-confirm primary"
                onClick={handleSendBroadcast}
                disabled={actionLoading}
              >
                {actionLoading ? 'Transmitindo...' : 'Transmitir para Todos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Visualizador de JSON Detalhado */}
      {detailModal && (
        <div className="admin-modal-backdrop" onClick={() => setDetailModal(null)}>
          <div className="admin-modal large" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{detailModal.title}</h3>
              <button className="admin-modal-close" onClick={() => setDetailModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body">
              <pre className="json-viewer">{JSON.stringify(detailModal.data, null, 2)}</pre>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-cancel" onClick={() => setDetailModal(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
