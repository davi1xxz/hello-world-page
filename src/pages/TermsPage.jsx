import { FileText, ArrowLeft } from 'lucide-react'

export function TermsPage({ onBack }) {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <header className="legal-header">
          <button 
            type="button" 
            className="legal-back-btn"
            onClick={onBack || (() => { window.location.href = '/' })}
          >
            <ArrowLeft size={16} />
            <span>Voltar ao FlowHits</span>
          </button>
          <div className="legal-badge">
            <FileText size={14} />
            <span>Termos de Uso</span>
          </div>
          <h1>Termos de Serviço</h1>
          <p className="legal-meta">Última atualização: 28 de Agosto de 2026 • FlowHits AI Studio</p>
        </header>

        <main className="legal-content">
          <section>
            <h2>1. Aceitação dos Termos</h2>
            <p>
              Ao acessar ou utilizar a plataforma <strong>FlowHits</strong> (<code>flow-hits.web.app</code>), você concorda expressamente em cumprir e estar vinculado a estes Termos de Serviço e a todas as leis e regulamentos aplicáveis. Se você não concordar com qualquer um destes termos, fica proibido de usar ou acessar este site.
            </p>
          </section>

          <section>
            <h2>2. Descrição do Serviço</h2>
            <p>
              O FlowHits é um estúdio digital alimentado por inteligência artificial projetado para criação, composição, arranjo e download de hinos, cantos de torcida e faixas musicais personalizadas.
            </p>
          </section>

          <section>
            <h2>3. Cadastro e Segurança da Conta</h2>
            <p>
              Para utilizar os recursos de criação e salvamento, o usuário deve se cadastrar via e-mail e senha ou através de autenticação com conta Google (OAuth). O usuário é o único responsável pela guarda e confidencialidade de suas credenciais de acesso.
            </p>
          </section>

          <section>
            <h2>4. Propriedade Intelectual e Uso das Músicas Geradas</h2>
            <p>
              As faixas e letras geradas através da plataforma são destinadas ao uso do usuário de acordo com o plano de créditos vigente. O usuário compromete-se a:
            </p>
            <ul>
              <li>Não utilizar o serviço para gerar conteúdos com discurso de ódio, violência, discriminação ou violação flagrante de direitos autorais de terceiros.</li>
              <li>Reconhecer que os modelos de IA operam com base em síntese generativa.</li>
            </ul>
          </section>

          <section>
            <h2>5. Créditos e Planos de Uso</h2>
            <p>
              A geração de novas faixas e download de arquivos em alta definição consome créditos da conta. Os créditos podem ser concedidos gratuitamente ou adquiridos através dos planos disponibilizados no estúdio.
            </p>
          </section>

          <section>
            <h2>6. Isenção de Garantias e Limitação de Responsabilidade</h2>
            <p>
              O serviço é fornecido "como está" e "conforme disponível". Embora nos esforcemos para garantir 99.9% de disponibilidade, o FlowHits não garante que a operação do serviço será ininterrupta ou livre de erros operacionais ou de rede temporários.
            </p>
          </section>

          <section>
            <h2>7. Alterações nestes Termos</h2>
            <p>
              O FlowHits reserva-se o direito de atualizar ou modificar estes Termos de Serviço a qualquer momento. O uso contínuo da plataforma após tais alterações constitui sua aceitação tácita dos novos termos.
            </p>
          </section>
        </main>
      </div>
    </div>
  )
}
