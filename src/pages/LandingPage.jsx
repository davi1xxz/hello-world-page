import { ArrowRight, Check, LibraryBig, Play, Share2, Sparkles, WandSparkles } from 'lucide-react'

export function LandingPage({ onStart, onOpenLegal }) {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <a className="landing-brand" href="/" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} aria-label="FlowHits, início">
          <img src="/LOGO%202.webp" alt="" />
          <span>FLOW<span>HITS</span></span>
        </a>
        <button className="landing-login" type="button" onClick={onStart}>Já tenho conta</button>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <div className="landing-kicker"><Sparkles size={14} /> FLOWHITS STUDIO</div>
          <h1>Transforme a energia da sua torcida em música.</h1>
          <p>Crie hinos e cantos com IA, dê o seu toque e compartilhe quando a faixa estiver pronta.</p>
          <div className="landing-actions">
            <button className="landing-primary" type="button" onClick={onStart}>Criar minha música <ArrowRight size={18} /></button>
            <a className="landing-secondary" href="#como-funciona">Como funciona</a>
          </div>
          <div className="landing-reassurance"><Check size={16} /> Você começa dentro do seu próprio estúdio.</div>
        </div>

        <div className="landing-product-preview" aria-label="Prévia do estúdio FlowHits">
          <div className="preview-topbar"><span /><span /><span /><b>Seu estúdio</b></div>
          <div className="preview-content">
            <div className="preview-label">NOVA CRIAÇÃO</div>
            <div className="preview-prompt">"Um canto para levantar a arquibancada..."</div>
            <div className="preview-chips"><span>Estilo livre</span><span>Voz definida por você</span></div>
            <div className="preview-track">
              <div className="preview-art"><Play size={18} fill="currentColor" /></div>
              <div><strong>Sua nova faixa</strong><small>Pronta para ouvir e publicar</small></div>
              <div className="preview-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-flow" id="como-funciona" aria-label="Como funciona">
        <div className="landing-flow-intro"><span>COMO FUNCIONA</span><h2>Da ideia ao som, sem complicação.</h2></div>
        <article><WandSparkles size={21} /><b>1. Conte sua ideia</b><p>Descreva o clima que você quer criar.</p></article>
        <article><LibraryBig size={21} /><b>2. Ajuste no seu estúdio</b><p>Organize tudo em uma só biblioteca.</p></article>
        <article><Share2 size={21} /><b>3. Compartilhe a faixa</b><p>Publique quando estiver do seu jeito.</p></article>
      </section>

      <section className="landing-final-cta">
        <h2>Seu próximo canto começa com uma ideia.</h2>
        <button className="landing-primary" type="button" onClick={onStart}>Entrar no FlowHits <ArrowRight size={18} /></button>
      </section>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} FlowHits</span>
        <button type="button" onClick={() => onOpenLegal('terms')}>Termos</button>
        <button type="button" onClick={() => onOpenLegal('privacy')}>Privacidade</button>
      </footer>
    </main>
  )
}
