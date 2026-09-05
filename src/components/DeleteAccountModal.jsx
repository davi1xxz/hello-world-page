import { useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

export function DeleteAccountModal({ isOpen, onClose, userEmail, onSignOut, onToast }) {
  const [confirmText, setConfirmText] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const isConfirmed = confirmText.trim().toUpperCase() === 'EXCLUIR'

  const handleDeleteAccount = async () => {
    if (!isConfirmed) {
      onToast('Digite a palavra EXCLUIR para confirmar.')
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('excluir_minha_conta', {
        p_confirmacao_texto: confirmText.trim(),
        p_motivo: reason.trim() || 'Solicitado pelo usuário no app',
      })

      if (error) throw error

      onToast(data?.message || 'Conta excluída com sucesso.')
      onClose()
      setTimeout(async () => {
        await supabase.auth.signOut()
        if (onSignOut) onSignOut()
        window.location.href = '/'
      }, 1000)
    } catch (err) {
      console.error('[DeleteAccount] Erro ao excluir conta:', err)
      onToast(err.message || 'Erro ao excluir conta.')
      setLoading(false)
    }
  }

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal delete-account-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="admin-modal-header danger-header">
          <div className="danger-header-title">
            <div className="danger-icon-badge">
              <AlertTriangle size={20} />
            </div>
            <h3>Encerrar conta</h3>
          </div>
          <button className="admin-modal-close" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="admin-modal-body">
          <div className="danger-warning-banner">
            <p>
              <strong>Seu acesso será desativado agora.</strong>
            </p>
            <p>
              A conta <strong>{userEmail}</strong> ficará indisponível e suas músicas deixarão de ser públicas.
              Você poderá recuperar tudo entrando novamente nos próximos 30 dias. Após esse prazo, a exclusão será definitiva.
            </p>
          </div>

          <div className="form-group">
            <label>Motivo do encerramento (Opcional):</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Selecione um motivo...</option>
              <option value="Não uso com frequência">Não uso com frequência</option>
              <option value="Criei outra conta">Criei outra conta</option>
              <option value="Problemas técnicos">Problemas técnicos</option>
              <option value="Solicitação de Privacidade / LGPD">Solicitação de Privacidade / LGPD</option>
              <option value="Outro motivo">Outro motivo</option>
            </select>
          </div>

          <div className="form-group">
            <label>
              Para confirmar, digite <strong>EXCLUIR</strong> no campo abaixo:
            </label>
            <input
              type="text"
              placeholder="Digite EXCLUIR"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              className="danger-input-confirm"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="admin-modal-footer">
          <button className="btn-cancel" onClick={onClose} disabled={loading}>
            Cancelar e Manter Conta
          </button>
          <button
            className="btn-confirm danger"
            onClick={handleDeleteAccount}
            disabled={!isConfirmed || loading}
          >
            {loading && <Loader2 size={16} className="spin" />}
            <span>{loading ? 'Encerrando...' : 'Encerrar minha conta'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
