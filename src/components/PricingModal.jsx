import { useEffect, useState } from 'react'
import {
  Check,
  Coins,
  CreditCard,
  ExternalLink,
  Flame,
  Loader2,
  Shield,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

export function PricingModal({ isOpen, onClose, studioId, onToast }) {
  const [billingInterval, setBillingInterval] = useState('monthly') // 'monthly' | 'yearly'
  const [loadingAction, setLoadingAction] = useState(null)
  const [currentSub, setCurrentSub] = useState(null)

  useEffect(() => {
    if (!isOpen) return

    async function loadSubscription() {
      try {
        const { data, error } = await supabase.rpc('obter_minha_assinatura')
        if (!error && data) {
          setCurrentSub(data)
        }
      } catch (err) {
        console.error('[PricingModal] Erro ao carregar assinatura:', err)
      }
    }

    loadSubscription()
  }, [isOpen])

  if (!isOpen) return null

  const handleCheckout = async ({ planId, packageId }) => {
    if (!studioId) {
      onToast('Nenhum estúdio selecionado.')
      return
    }

    setLoadingAction(planId || packageId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        onToast('Faça login para assinar ou comprar créditos.')
        return
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://iuvnugyisayxaxnmmbvy.supabase.co'
      const response = await fetch(`${supabaseUrl}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'create-checkout-session',
          studioId,
          planId: planId || undefined,
          packageId: packageId || undefined,
        }),
      })

      const resData = await response.json()
      if (!response.ok) {
        throw new Error(resData.error || 'Erro ao iniciar checkout.')
      }

      if (resData.url) {
        window.location.href = resData.url
      } else {
        throw new Error('URL de checkout não retornada.')
      }
    } catch (err) {
      console.error('[PricingModal] Checkout error:', err)
      onToast(err.message || 'Não foi possível conectar ao Stripe.')
    } finally {
      setLoadingAction(null)
    }
  }

  const handleOpenPortal = async () => {
    setLoadingAction('portal')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://iuvnugyisayxaxnmmbvy.supabase.co'
      const response = await fetch(`${supabaseUrl}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'create-portal-session',
          studioId,
        }),
      })

      const resData = await response.json()
      if (!response.ok) throw new Error(resData.error || 'Erro ao abrir portal.')

      if (resData.url) {
        window.location.href = resData.url
      }
    } catch (err) {
      onToast(err.message || 'Erro ao acessar portal de faturamento.')
    } finally {
      setLoadingAction(null)
    }
  }

  const isYearly = billingInterval === 'yearly'

  return (
    <div className="pricing-modal-backdrop" onClick={onClose}>
      <div className="pricing-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pricing-modal-header">
          <div className="pricing-header-title">
            <span className="pricing-pill-badge">
              <Sparkles size={14} /> PLANOS & RECARGAS OFICIAIS
            </span>
            <h2>Evolua sua Produção Musical</h2>
            <p>Crie hits profissionais com inteligência artificial de última geração.</p>
          </div>
          <button className="pricing-close-btn" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        {/* Current Active Plan Notice */}
        {currentSub && (
          <div className="active-plan-banner">
            <div className="active-plan-info">
              <Zap size={18} className="text-acid" />
              <div>
                <strong>Você é assinante do Plano {currentSub.plan_tier?.toUpperCase()} ({currentSub.billing_interval === 'yearly' ? 'Anual' : 'Mensal'})</strong>
                <span>Renova em {new Date(currentSub.current_period_end).toLocaleDateString('pt-BR')} • {currentSub.credits_per_interval} créditos por ciclo</span>
              </div>
            </div>
            <button
              className="btn-manage-sub"
              onClick={handleOpenPortal}
              disabled={loadingAction === 'portal'}
            >
              {loadingAction === 'portal' ? <Loader2 size={14} className="spin" /> : <CreditCard size={14} />}
              <span>Gerenciar no Stripe</span>
              <ExternalLink size={12} />
            </button>
          </div>
        )}

        {/* Interval Selector Toggle */}
        <div className="billing-toggle-container">
          <div className="billing-toggle-pill">
            <button
              className={`toggle-btn ${!isYearly ? 'active' : ''}`}
              onClick={() => setBillingInterval('monthly')}
            >
              Mensal
            </button>
            <button
              className={`toggle-btn ${isYearly ? 'active' : ''}`}
              onClick={() => setBillingInterval('yearly')}
            >
              <span>Anual</span>
              <span className="discount-pill">20% OFF</span>
            </button>
          </div>
        </div>

        {/* Plans Cards Grid */}
        <div className="pricing-cards-grid">
          {/* 1. LITE */}
          <div className={`pricing-card ${currentSub?.plan_tier === 'lite' ? 'current' : ''}`}>
            <div className="card-top">
              <h3 className="plan-name">Lite</h3>
              <p className="plan-tagline">Ideal para explorar e criar suas primeiras faixas.</p>
              <div className="price-display">
                <span className="currency">R$</span>
                <strong className="amount">{isYearly ? '24' : '30'}</strong>
                <span className="period">/mês</span>
              </div>
              {isYearly && <span className="billed-yearly-note">Cobrado R$ 288 / ano</span>}
            </div>

            <div className="credits-badge-highlight">
              <Coins size={16} />
              <span><strong>{isYearly ? '2.400' : '200'} créditos</strong> {isYearly ? 'anuais' : '/ mês'}</span>
            </div>

            <ul className="plan-features-list">
              <li>
                <Check size={16} className="text-blue" />
                <span><strong>{isYearly ? '240' : '20'} músicas</strong> completas</span>
              </li>
              <li>
                <Check size={16} className="text-blue" />
                <span>Geração rápida com KIE AI v5</span>
              </li>
              <li>
                <Check size={16} className="text-blue" />
                <span>Download em alta definição</span>
              </li>
              <li>
                <Check size={16} className="text-blue" />
                <span>Uso pessoal & comercial</span>
              </li>
            </ul>

            <button
              className="btn-select-plan"
              onClick={() => handleCheckout({ planId: isYearly ? 'lite_yearly' : 'lite_monthly' })}
              disabled={loadingAction !== null}
            >
              {loadingAction === (isYearly ? 'lite_yearly' : 'lite_monthly') ? (
                <Loader2 size={16} className="spin" />
              ) : currentSub?.plan_tier === 'lite' ? (
                'Plano Atual'
              ) : (
                'Assinar Lite'
              )}
            </button>
          </div>

          {/* 2. PLUS (POPULAR) */}
          <div className={`pricing-card featured ${currentSub?.plan_tier === 'plus' ? 'current' : ''}`}>
            <div className="featured-ribbon">
              <Flame size={13} /> MAIS POPULAR
            </div>

            <div className="card-top">
              <h3 className="plan-name">Plus</h3>
              <p className="plan-tagline">Para produtores e artistas frequentes.</p>
              <div className="price-display">
                <span className="currency">R$</span>
                <strong className="amount">{isYearly ? '72' : '90'}</strong>
                <span className="period">/mês</span>
              </div>
              {isYearly && <span className="billed-yearly-note">Cobrado R$ 864 / ano</span>}
            </div>

            <div className="credits-badge-highlight blue">
              <Coins size={16} />
              <span><strong>{isYearly ? '7.200' : '600'} créditos</strong> {isYearly ? 'anuais' : '/ mês'}</span>
            </div>

            <ul className="plan-features-list">
              <li>
                <Check size={16} className="text-blue" />
                <span><strong>{isYearly ? '720' : '60'} músicas</strong> completas</span>
              </li>
              <li>
                <Check size={16} className="text-blue" />
                <span>Fila prioritária de processamento</span>
              </li>
              <li>
                <Check size={16} className="text-blue" />
                <span>Vozes e estilos ilimitados</span>
              </li>
              <li>
                <Check size={16} className="text-blue" />
                <span>Downloads ilimitados de áudio e capa</span>
              </li>
              <li>
                <Check size={16} className="text-blue" />
                <span>Suporte prioritário</span>
              </li>
            </ul>

            <button
              className="btn-select-plan primary"
              onClick={() => handleCheckout({ planId: isYearly ? 'plus_yearly' : 'plus_monthly' })}
              disabled={loadingAction !== null}
            >
              {loadingAction === (isYearly ? 'plus_yearly' : 'plus_monthly') ? (
                <Loader2 size={16} className="spin" />
              ) : currentSub?.plan_tier === 'plus' ? (
                'Plano Atual'
              ) : (
                'Assinar Plus'
              )}
            </button>
          </div>

          {/* 3. PRO */}
          <div className={`pricing-card ${currentSub?.plan_tier === 'pro' ? 'current' : ''}`}>
            <div className="card-top">
              <h3 className="plan-name">Pro</h3>
              <p className="plan-tagline">Para estúdios, gravadoras e criadores intensivos.</p>
              <div className="price-display">
                <span className="currency">R$</span>
                <strong className="amount">{isYearly ? '192' : '240'}</strong>
                <span className="period">/mês</span>
              </div>
              {isYearly && <span className="billed-yearly-note">Cobrado R$ 2.304 / ano</span>}
            </div>

            <div className="credits-badge-highlight">
              <Coins size={16} />
              <span><strong>{isYearly ? '19.200' : '1.600'} créditos</strong> {isYearly ? 'anuais' : '/ mês'}</span>
            </div>

            <ul className="plan-features-list">
              <li>
                <Check size={16} className="text-blue" />
                <span><strong>{isYearly ? '1.920' : '160'} músicas</strong> completas</span>
              </li>
              <li>
                <Check size={16} className="text-blue" />
                <span>Máxima prioridade em renderização</span>
              </li>
              <li>
                <Check size={16} className="text-blue" />
                <span>Direitos comerciais plenos</span>
              </li>
              <li>
                <Check size={16} className="text-blue" />
                <span>Acesso antecipado a novos modelos de IA</span>
              </li>
              <li>
                <Check size={16} className="text-blue" />
                <span>Suporte VIP dedicado</span>
              </li>
            </ul>

            <button
              className="btn-select-plan"
              onClick={() => handleCheckout({ planId: isYearly ? 'pro_yearly' : 'pro_monthly' })}
              disabled={loadingAction !== null}
            >
              {loadingAction === (isYearly ? 'pro_yearly' : 'pro_monthly') ? (
                <Loader2 size={16} className="spin" />
              ) : currentSub?.plan_tier === 'pro' ? (
                'Plano Atual'
              ) : (
                'Assinar Pro'
              )}
            </button>
          </div>
        </div>

        {/* One-Time Top-Up Credit Packages */}
        <div className="topup-packages-section">
          <div className="topup-title-row">
            <div>
              <h3>Pacotes Avulsos de Créditos</h3>
              <p>Compre créditos avulsos quando precisar, sem mensalidade. Apenas <strong>R$ 0,15 por crédito</strong>.</p>
            </div>
            <div className="stripe-secure-badge">
              <Shield size={16} className="text-green" />
              <span>Pagamento Seguro via Stripe</span>
            </div>
          </div>

          <div className="topup-grid">
            <div className="topup-card">
              <div className="topup-info">
                <strong>100 Créditos</strong>
                <span>10 músicas completas</span>
              </div>
              <div className="topup-price-action">
                <span className="topup-price">R$ 15,00</span>
                <button
                  className="btn-buy-topup"
                  onClick={() => handleCheckout({ packageId: 'pack_10' })}
                  disabled={loadingAction !== null}
                >
                  {loadingAction === 'pack_10' ? <Loader2 size={14} className="spin" /> : 'Comprar'}
                </button>
              </div>
            </div>

            <div className="topup-card featured">
              <div className="topup-info">
                <div className="badge-best-value">POPULAR</div>
                <strong>300 Créditos</strong>
                <span>30 músicas completas</span>
              </div>
              <div className="topup-price-action">
                <span className="topup-price">R$ 45,00</span>
                <button
                  className="btn-buy-topup primary"
                  onClick={() => handleCheckout({ packageId: 'pack_30' })}
                  disabled={loadingAction !== null}
                >
                  {loadingAction === 'pack_30' ? <Loader2 size={14} className="spin" /> : 'Comprar'}
                </button>
              </div>
            </div>

            <div className="topup-card">
              <div className="topup-info">
                <strong>1.000 Créditos</strong>
                <span>100 músicas completas</span>
              </div>
              <div className="topup-price-action">
                <span className="topup-price">R$ 150,00</span>
                <button
                  className="btn-buy-topup"
                  onClick={() => handleCheckout({ packageId: 'pack_100' })}
                  disabled={loadingAction !== null}
                >
                  {loadingAction === 'pack_100' ? <Loader2 size={14} className="spin" /> : 'Comprar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
