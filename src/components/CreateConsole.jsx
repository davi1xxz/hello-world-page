import { useEffect, useState } from 'react'
import { FileText, Mic2, Music, Sliders, Sparkles, X, Zap } from 'lucide-react'
import { styles, voices } from '../data/mockData'

const initialCustomSettings = {
  titleText: '',
  style: 'Livre',
  freeStyle: '',
  voice: 'Masculino',
  lyricsText: '',
}

const customStyleStorageKey = 'flowhits-custom-style'

const getInitialCustomSettings = () => {
  try {
    const savedStyle = window.localStorage.getItem(customStyleStorageKey)
    const style = savedStyle === 'Livre' || styles.includes(savedStyle) ? savedStyle : initialCustomSettings.style
    return { ...initialCustomSettings, style }
  } catch {
    return { ...initialCustomSettings }
  }
}

export function CreateConsole({ onGenerate, initialPrompt = '', initialStyle = '' }) {
  const [mode, setMode] = useState('simple')
  const [prompt, setPrompt] = useState(initialPrompt)
  const [customSettings, setCustomSettings] = useState(getInitialCustomSettings)
  const [generating, setGenerating] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt)
  }, [initialPrompt])

  useEffect(() => {
    if (initialStyle && styles.includes(initialStyle)) {
      setMode('custom')
      setCustomSettings(current => ({ ...current, style: initialStyle }))
    }
  }, [initialStyle])

  useEffect(() => {
    try {
      window.localStorage.setItem(customStyleStorageKey, customSettings.style)
    } catch {
      // O app continua funcionando se o navegador bloquear armazenamento local.
    }
  }, [customSettings.style])

  useEffect(() => {
    if (!generating) return undefined
    const interval = setInterval(() => setStep(value => Math.min(value + 1, 3)), 650)
    return () => clearInterval(interval)
  }, [generating])

  const updateCustom = (key, value) => {
    setCustomSettings(current => ({ ...current, [key]: value }))
  }

  const generate = async () => {
    const title = mode === 'custom' ? customSettings.titleText.trim() : ''
    const lyrics = mode === 'custom' ? customSettings.lyricsText.trim() : ''
    const cleanPrompt = prompt.trim()

    if (mode === 'simple' && !cleanPrompt) return
    if (mode === 'custom' && (!title || !lyrics || (customSettings.style === 'Livre' && !customSettings.freeStyle.trim()))) return
    if (generating) return

    console.log('%c[FlowHits] Iniciando geração...', 'color: #0066ff; font-weight: bold;', {
      mode,
      title: mode === 'custom' ? title : undefined,
      prompt: mode === 'simple' ? cleanPrompt : undefined,
      lyrics: mode === 'custom' ? lyrics : undefined,
      style: mode === 'simple' ? 'Livre' : (customSettings.style === 'Livre' ? customSettings.freeStyle.trim() : customSettings.style),
      voice: mode === 'simple' ? 'Masculino' : customSettings.voice,
    })

    setGenerating(true)
    setStep(1)

    try {
      await onGenerate({
        mode,
        title,
        prompt: mode === 'simple' ? cleanPrompt : '',
        lyrics,
        style: mode === 'simple' ? 'Livre' : (customSettings.style === 'Livre' ? customSettings.freeStyle.trim() : customSettings.style),
        voice: mode === 'simple' ? 'Masculino' : customSettings.voice,
      })

      console.log('%c[FlowHits] Geração enviada com sucesso para o backend!', 'color: #10b981; font-weight: bold;')
      setPrompt('')
      setCustomSettings(current => ({ ...current, titleText: '', lyricsText: '' }))
    } catch (err) {
      console.error('[FlowHits] Erro na geração:', err)
    } finally {
      setGenerating(false)
      setStep(0)
    }
  }

  const disabled = generating ||
    (mode === 'simple' && !prompt.trim()) ||
    (mode === 'custom' && (!customSettings.titleText.trim() || !customSettings.lyricsText.trim() || (customSettings.style === 'Livre' && !customSettings.freeStyle.trim())))

  return (
    <div className="create-console">
      {/* Cabeçalho Desktop Estilo Suno */}
      <div className="suno-console-topbar">
        <div className="mode-segmented-control" role="tablist">
          <button
            role="tab"
            aria-selected={mode === 'simple'}
            className={`mode-tab-btn ${mode === 'simple' ? 'active' : ''}`}
            onClick={() => setMode('simple')}
          >
            <Zap size={14} />
            <span>Simples</span>
          </button>

          <button
            role="tab"
            aria-selected={mode === 'custom'}
            className={`mode-tab-btn ${mode === 'custom' ? 'active' : ''}`}
            onClick={() => setMode('custom')}
          >
            <Sliders size={14} />
            <span>Personalizado</span>
          </button>
        </div>

        <div className="suno-model-badge">
          <span>v5.5</span>
        </div>
      </div>

      {/* Modo Simples */}
      {mode === 'simple' && (
        <div className="console-mode-body simple-mode-pane">
          <div className="prompt-field suno-section-card">
            <div className="prompt-label">
              <div className="suno-label-left">
                <Sparkles size={14} />
                <span>Descreva a música ou o tema</span>
              </div>
              <small>{prompt.length}/500</small>
            </div>
            <textarea
              data-testid="music-prompt"
              value={prompt}
              maxLength={500}
              onChange={event => setPrompt(event.target.value)}
              placeholder="Ex: Um hino que conte a história do meu time e suas grandes conquistas, com refrão para a torcida cantar..."
            />
            {prompt && (
              <button className="clear-prompt" aria-label="Limpar prompt" onClick={() => setPrompt('')}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modo Personalizado */}
      {mode === 'custom' && (
        <div className="console-mode-body custom-mode-pane">
          <div className="prompt-field custom-title-field suno-section-card">
            <div className="prompt-label">
              <div className="suno-label-left">
                <Music size={14} />
                <span>Nome da música</span>
              </div>
              <small>{customSettings.titleText.length}/80</small>
            </div>
            <input
              data-testid="music-title"
              value={customSettings.titleText}
              maxLength={80}
              onChange={event => updateCustom('titleText', event.target.value)}
              placeholder="Ex: Coração Los Bravo"
            />
          </div>

          <div className="prompt-field custom-lyrics-field suno-section-card">
            <div className="prompt-label">
              <div className="suno-label-left">
                <FileText size={14} />
                <span>Escreva sua letra</span>
              </div>
            </div>
            <textarea
              value={customSettings.lyricsText}
              onChange={event => updateCustom('lyricsText', event.target.value)}
              placeholder="[Verso 1]&#10;Entramos em campo com a garra no peito...&#10;&#10;[Refrao]&#10;Ninguem vai nos parar, hoje e dia de vencer!"
              rows={5}
            />
          </div>

          <div className="style-selection-section suno-section-card">
            <div className="prompt-label">
              <div className="suno-label-left">
                <Music size={14} />
                <span>Estilo musical</span>
              </div>
            </div>
            <div className="style-chips-scroll">
              {['Livre', ...styles].map(styleName => (
                <button
                  key={styleName}
                  type="button"
                  className={`style-chip-item ${customSettings.style === styleName ? 'selected' : ''}`}
                  onClick={() => updateCustom('style', styleName)}
                >
                  <Music size={12} />
                  <span>{styleName}</span>
                </button>
              ))}
            </div>
            {customSettings.style === 'Livre' && (
              <div className="custom-free-style-field">
                <textarea
                  value={customSettings.freeStyle}
                  maxLength={120}
                  onChange={event => updateCustom('freeStyle', event.target.value)}
                  placeholder="Digite qual será o ritmo e estilo da sua música..."
                  aria-label="Ritmo e estilo personalizado"
                  rows={3}
                />
              </div>
            )}
          </div>

          <div className="custom-voice-selector-row suno-section-card">
            <span className="custom-voice-title">Vocal</span>
            <div className="custom-voice-buttons">
              {voices.map((voiceOption) => {
                const isSelected = customSettings.voice === voiceOption
                return (
                  <button
                    key={voiceOption}
                    type="button"
                    className={`voice-choice-btn ${isSelected ? 'active' : ''}`}
                    onClick={() => updateCustom('voice', voiceOption)}
                  >
                    <span>{voiceOption}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Botão de Criação Estilo Suno com Sticky Footer */}
      <div className="suno-create-action-footer">
        <button
          data-testid="generate-button"
          className="generate-button"
          disabled={disabled}
          onClick={generate}
        >
          {generating ? (
            <>
              <span className="generating-icon">
                <Mic2 size={18} />
              </span>
              <span>
                <strong>{['Preparando', 'Criando faixa', 'Finalizando envio'][step - 1]}</strong>
                <small>Etapa {step} de 3</small>
              </span>
              <span className="generate-progress" style={{ width: `${step * 33.33}%` }}></span>
            </>
          ) : (
            <>
              <span className="generate-button-icon">
                <Music size={17} />
              </span>
              <span>
                <strong>Gerar música</strong>
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
