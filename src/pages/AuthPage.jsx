import { useEffect, useMemo, useRef, useState } from 'react'
import { 
  AudioLines, 
  ArrowRight, 
  LockKeyhole, 
  Mail, 
  UserRound, 
  Eye, 
  EyeOff, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  Music, 
  ArrowLeft, 
  ShieldCheck
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const generateNonce = async () => {
  const rawNonce = crypto.randomUUID()
  const encoder = new TextEncoder()
  const encoded = encoder.encode(rawNonce)
  const buffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashedNonce = Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return { rawNonce, hashedNonce }
}

export function AuthPage({ onOpenLegal, onBack }) {
  const googleButtonRef = useRef(null)
  const googleInitializedRef = useRef(false)
  const googleRawNonceRef = useRef('')
  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'forgot'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const isSignup = mode === 'signup'
  const isForgot = mode === 'forgot'

  useEffect(() => {
    if (isForgot) return undefined

    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!googleClientId) return undefined

    let interval
    let resizeTimer
    let lastRenderedWidth = 0

    const renderGoogleButton = () => {
      if (!googleButtonRef.current || !window.google?.accounts?.id) return

      const container = googleButtonRef.current
      if (container.hasChildNodes()) return

      window.google.accounts.id.renderButton(container, {
        type: 'standard',
        size: 'large',
        shape: 'pill',
        width: 380,
      })
    }

    const onWindowResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        if (!googleButtonRef.current) return
        const currentWidth = Math.floor(googleButtonRef.current.getBoundingClientRect().width || 0)
        if (currentWidth >= 120) {
          const targetWidth = Math.max(200, Math.min(currentWidth, 380))
          if (Math.abs(targetWidth - lastRenderedWidth) > 10) {
            renderGoogleButton()
          }
        }
      }, 150)
    }

    const initGsi = async () => {
      try {
        if (!window.google?.accounts?.id) return
        if (!googleInitializedRef.current) {
          const { rawNonce, hashedNonce } = await generateNonce()
          googleRawNonceRef.current = rawNonce
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            nonce: hashedNonce,
            callback: async (response) => {
              try {
                setSocialLoading(true)
                setError('')
                const { data, error: idTokenError } = await supabase.auth.signInWithIdToken({
                  provider: 'google',
                  token: response.credential,
                  nonce: googleRawNonceRef.current,
                })
                if (idTokenError) throw idTokenError
                if (!data.session) throw new Error('O Google não retornou uma sessão válida. Tente novamente.')
              } catch (err) {
                setError(err.message || 'Erro ao autenticar com o Google.')
              } finally {
                setSocialLoading(false)
              }
            },
          })
          googleInitializedRef.current = true
        }

        renderGoogleButton()
        window.addEventListener('resize', onWindowResize, { passive: true })
      } catch (error) {
        console.error('GSI Init Error:', error)
      }
    }

    if (window.google?.accounts?.id) {
      initGsi()
    } else {
      interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval)
          initGsi()
        }
      }, 300)
    }

    return () => {
      if (interval) clearInterval(interval)
      clearTimeout(resizeTimer)
      window.removeEventListener('resize', onWindowResize)
    }
  }, [isForgot])

  const switchMode = (nextMode) => {
    setMode(nextMode)
    setError('')
    setMessage('')
  }

  // Password strength calculation
  const passwordStrength = useMemo(() => {
    if (!password) return { score: 0, label: '', color: '' }
    let score = 0
    if (password.length >= 6) score += 1
    if (password.length >= 8) score += 1
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
    if (/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1

    switch (score) {
      case 1:
        return { score: 1, label: 'Fraca', color: '#ef4444' }
      case 2:
        return { score: 2, label: 'Razoável', color: '#f59e0b' }
      case 3:
        return { score: 3, label: 'Boa', color: '#3b82f6' }
      case 4:
        return { score: 4, label: 'Excelente', color: '#10b981' }
      default:
        return { score: 0, label: 'Muito curta', color: '#94a3b8' }
    }
  }, [password])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (isForgot) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        })
        if (resetError) throw resetError
        setMessage('Link de recuperação enviado com sucesso! Verifique sua caixa de entrada e spam.')
      } else if (isSignup) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() } },
        })
        if (signUpError) throw signUpError
        setMessage('Conta criada com sucesso! Verifique seu e-mail para confirmar seu acesso.')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signInError) throw signInError
      }
    } catch (authError) {
      setError(authError.message || 'Não foi possível concluir a ação. Verifique suas credenciais e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-container">
      {/* Dynamic Background Glows */}
      <div className="auth-ambient-glow auth-glow-1" aria-hidden="true" />
      <div className="auth-ambient-glow auth-glow-2" aria-hidden="true" />
      <div className="auth-ambient-grid" aria-hidden="true" />

      <div className="auth-wrapper">
        {/* Left Side: Creative Music Studio Hero Showcase */}
        <section className="auth-hero-panel">
          <div className="auth-hero-header">
            <div className="auth-logo-badge">
              <span className="auth-logo-icon">
                <AudioLines size={24} />
              </span>
              <span className="auth-logo-text">
                FLOW<span>HITS</span>
              </span>
              <span className="auth-version-pill">2.0 STUDIO</span>
            </div>
            <div className="auth-live-status">
              <span className="live-dot" />
              <span>Estúdio Online</span>
            </div>
          </div>

          <div className="auth-hero-content">
            <div className="auth-hero-tag">
              <Sparkles size={14} />
              <span>Crie Hinos com Inteligência Artificial</span>
            </div>
            <h2 className="auth-hero-title">
              A voz da sua torcida ganha vida no estúdio.
            </h2>
            <p className="auth-hero-desc">
              Gere letras autênticas, arranjos vibrantes e produções de estádio prontas para incendiar a arquibancada.
            </p>

            {/* Feature Highlights Grid */}
            <div className="auth-features-list">
              <div className="auth-feature-item">
                <div className="feature-icon"><Zap size={16} /></div>
                <div>
                  <strong>Geração Instantânea</strong>
                  <span>Faixas completas em segundos</span>
                </div>
              </div>
              <div className="auth-feature-item">
                <div className="feature-icon"><Music size={16} /></div>
                <div>
                  <strong>Vozes de Estádio</strong>
                  <span>Efeito coro e torcida realista</span>
                </div>
              </div>
              <div className="auth-feature-item">
                <div className="feature-icon"><ShieldCheck size={16} /></div>
                <div>
                  <strong>Áudio em Alta Definição</strong>
                  <span>Download em WAV e MP3 Masterizado</span>
                </div>
              </div>
            </div>
          </div>

        </section>

        {/* Right Side: Sleek Glassmorphism Auth Card */}
        <section className="auth-card-panel" aria-labelledby="auth-form-title">
          {onBack && <button className="auth-landing-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Voltar</button>}
          {/* Mobile Header Brand */}
          <div className="auth-mobile-brand">
            <div className="auth-logo-badge">
              <span className="auth-logo-icon">
                <AudioLines size={20} />
              </span>
              <span className="auth-logo-text">FLOW<span>HITS</span></span>
            </div>
          </div>

          {/* Top Form Header */}
          <div className="auth-card-header">
            {isForgot ? (
              <button 
                type="button" 
                className="auth-back-btn" 
                onClick={() => switchMode('signin')}
              >
                <ArrowLeft size={16} />
                <span>Voltar para o login</span>
              </button>
            ) : (
              <div className="auth-pill-tabs" role="tablist" aria-label="Opções de autenticação">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isSignup}
                  className={`pill-tab ${!isSignup ? 'active' : ''}`}
                  onClick={() => switchMode('signin')}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isSignup}
                  className={`pill-tab ${isSignup ? 'active' : ''}`}
                  onClick={() => switchMode('signup')}
                >
                  Criar conta
                </button>
              </div>
            )}

            <div className="auth-title-box">
              <h1 id="auth-form-title">
                {isForgot 
                  ? 'Recuperar Senha' 
                  : isSignup 
                  ? 'Comece a Criar Hinos' 
                  : 'Bem-vindo de Volta'}
              </h1>
              {isForgot && (
                <p>
                  Digite seu e-mail cadastrado e enviaremos um link de recuperação.
                </p>
              )}
            </div>
          </div>

          {/* Quick Social Login */}
          {!isForgot && (
            <>
              <div className={`google-btn-wrapper${socialLoading || loading ? ' loading' : ''}`}>
                <button
                  type="button"
                  className="auth-google-custom-btn"
                  disabled={socialLoading || loading}
                  aria-label="Continuar com o Google"
                  tabIndex={-1}
                >
                  <svg className="google-svg-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.37 7.31 24 12 24z"/>
                    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.17 0 9.99 0 12s.46 3.83 1.26 5.42l4.02-3.15z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.63 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                  </svg>
                  <span>Continuar com o Google</span>
                </button>
                <div
                  ref={googleButtonRef}
                  className="google-gsi-layer"
                  aria-label="Continuar com o Google"
                  aria-busy={socialLoading}
                />
              </div>

              <div className="auth-divider">
                <span>ou continue com e-mail</span>
              </div>
            </>
          )}

          {/* Form */}
          <form className="auth-form" onSubmit={handleSubmit}>
            {isSignup && (
              <div className="auth-field-group">
                <label htmlFor="auth-name">Nome ou Apelido</label>
                <div className="auth-input-wrapper">
                  <UserRound size={17} className="input-icon" />
                  <input
                    id="auth-name"
                    required
                    minLength={2}
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Gabriel Silva"
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div className="auth-field-group">
              <label htmlFor="auth-email">E-mail</label>
              <div className="auth-input-wrapper">
                <Mail size={17} className="input-icon" />
                <input
                  id="auth-email"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seuemail@exemplo.com"
                  autoComplete="email"
                />
              </div>
            </div>

            {!isForgot && (
              <div className="auth-field-group">
                <div className="auth-label-row">
                  <label htmlFor="auth-password">Senha</label>
                  {!isSignup && (
                    <button 
                      type="button" 
                      className="auth-link-btn"
                      onClick={() => switchMode('forgot')}
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <div className="auth-input-wrapper">
                  <LockKeyhole size={17} className="input-icon" />
                  <input
                    id="auth-password"
                    required
                    type={showPassword ? 'text' : 'password'}
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignup ? 'Crie uma senha forte (mín. 6 dígitos)' : 'Digite sua senha'}
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Real-time Password Strength Meter on Sign Up */}
                {isSignup && password.length > 0 && (
                  <div className="password-strength-box">
                    <div className="strength-bars">
                      {[1, 2, 3, 4].map((step) => (
                        <div 
                          key={step} 
                          className="strength-bar-step"
                          style={{
                            backgroundColor: step <= passwordStrength.score ? passwordStrength.color : '#e2e8f0'
                          }}
                        />
                      ))}
                    </div>
                    <div className="strength-caption">
                      <span>Segurança da senha:</span>
                      <strong style={{ color: passwordStrength.color }}>{passwordStrength.label}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Checkbox and helper row */}
            {!isForgot && !isSignup && (
              <div className="auth-options-row">
                <label className="auth-checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={rememberMe} 
                    onChange={(e) => setRememberMe(e.target.checked)} 
                  />
                  <span className="checkbox-custom" />
                  <span>Manter conectado neste navegador</span>
                </label>
              </div>
            )}

            {/* Feedback Notifications */}
            {error && (
              <div className="auth-alert error" role="alert">
                <AlertCircle size={17} className="alert-icon" />
                <span>{error}</span>
              </div>
            )}

            {message && (
              <div className="auth-alert success" role="status">
                <CheckCircle2 size={17} className="alert-icon" />
                <span>{message}</span>
              </div>
            )}

            {/* Submit Action */}
            <button className="auth-main-submit" disabled={loading || socialLoading} type="submit">
              <span>
                {loading 
                  ? 'Processando...' 
                  : isForgot 
                  ? 'Enviar link de recuperação' 
                  : isSignup 
                  ? 'Criar minha conta gratuita' 
                  : 'Acessar Estúdio FlowHits'}
              </span>
              <ArrowRight size={18} className="btn-arrow" />
            </button>
          </form>

          {/* Card Footer Note */}
          <footer className="auth-card-footer">
            {isSignup ? (
              <p>
                Já possui uma conta?{' '}
                <button type="button" className="auth-link-highlight" onClick={() => switchMode('signin')}>
                  Faça login aqui
                </button>
              </p>
            ) : isForgot ? (
              <p>
                Lembrou da senha?{' '}
                <button type="button" className="auth-link-highlight" onClick={() => switchMode('signin')}>
                  Voltar ao login
                </button>
              </p>
            ) : (
              <p>
                Ainda não tem conta?{' '}
                <button type="button" className="auth-link-highlight" onClick={() => switchMode('signup')}>
                  Cadastre-se grátis
                </button>
              </p>
            )}

            <div className="auth-terms-note">
              Ao continuar, você concorda com nossos <span onClick={() => onOpenLegal ? onOpenLegal('terms') : (window.location.href = '/termos')}>Termos de Uso</span> e <span onClick={() => onOpenLegal ? onOpenLegal('privacy') : (window.location.href = '/privacidade')}>Política de Privacidade</span>.
            </div>
          </footer>
        </section>
      </div>
    </main>
  )
}
