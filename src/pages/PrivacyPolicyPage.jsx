import { Shield, ArrowLeft } from 'lucide-react'

export function PrivacyPolicyPage({ onBack }) {
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
            <Shield size={14} />
            <span>Documento Oficial</span>
          </div>
          <h1>Política de Privacidade</h1>
          <p className="legal-meta">Última atualização: 28 de Agosto de 2026 • FlowHits AI Studio</p>
        </header>

        <main className="legal-content">
          <section>
            <h2>1. Informações Gerais</h2>
            <p>
              A presente Política de Privacidade contém informações sobre coleta, uso, armazenamento, tratamento e proteção dos dados pessoais dos usuários do <strong>FlowHits</strong> (disponível em <code>flow-hits.web.app</code>), com a finalidade de demonstrar absoluta transparência quanto ao assunto e esclarecer a todos os interessados sobre os tipos de dados que são coletados, os motivos da coleta e a forma como os usuários podem gerenciar ou excluir suas informações pessoais.
            </p>
          </section>

          <section>
            <h2>2. Dados Coletados</h2>
            <p>Coletamos as seguintes informações quando você utiliza nossa plataforma:</p>
            <ul>
              <li><strong>Dados de Autenticação:</strong> Ao criar uma conta ou fazer login via Google OAuth, recebemos seu nome completo, endereço de e-mail e foto de perfil fornecidos pelo provedor de autenticação.</li>
              <li><strong>Dados de Criação Musical:</strong> Histórico de prompts, estilos musicais selecionados, letras geradas e faixas criadas no estúdio.</li>
              <li><strong>Dados de Navegação e Logs:</strong> Endereço IP, tipo de navegador, registros de data/hora e páginas visitadas para fins de segurança e prevenção a fraudes.</li>
            </ul>
          </section>

          <section>
            <h2>3. Finalidade do Tratamento dos Dados</h2>
            <p>Os dados pessoais do usuário coletados e armazenados pelo FlowHits têm por finalidade:</p>
            <ul>
              <li>Permitir o acesso autenticado ao estúdio de criação musical com IA.</li>
              <li>Salvar, reproduzir e gerenciar suas faixas, coleções e créditos na nuvem.</li>
              <li>Garantir a segurança da conta e prevenir acessos não autorizados.</li>
              <li>Cumprir obrigações legais e regulatórias aplicáveis (LGPD / GDPR).</li>
            </ul>
          </section>

          <section>
            <h2>4. Compartilhamento de Dados com Terceiros</h2>
            <p>
              Não vendemos nem alugamos seus dados pessoais. O compartilhamento ocorre estritamente com parceiros de infraestrutura necessários para a operação do serviço:
            </p>
            <ul>
              <li><strong>Supabase:</strong> Provedor seguro de banco de dados e autenticação criptografada.</li>
              <li><strong>Google OAuth:</strong> Serviço de autenticação segura caso você opte por entrar com sua conta Google.</li>
              <li><strong>Firebase Hosting:</strong> Entrega segura e hospedagem de alta disponibilidade da aplicação web.</li>
            </ul>
          </section>

          <section>
            <h2>5. Segurança e Armazenamento</h2>
            <p>
              Empregamos medidas técnicas e organizacionais adequadas para proteger seus dados, incluindo criptografia SSL/TLS em trânsito e armazenamento seguro em servidores com controles rigorosos de acesso.
            </p>
          </section>

          <section>
            <h2>6. Seus Direitos e Exclusão de Conta</h2>
            <p>
              Você tem direito de solicitar o acesso, retificação ou exclusão permanente dos seus dados pessoais e faixas geradas a qualquer momento. Para exercer seus direitos ou solicitar a exclusão de sua conta, envie um e-mail para o suporte do desenvolvedor disponível em nossa plataforma.
            </p>
          </section>

          <section>
            <h2>7. Contato</h2>
            <p>
              Para dúvidas sobre esta Política de Privacidade, entre em contato através do e-mail oficial de suporte do FlowHits.
            </p>
          </section>
        </main>
      </div>
    </div>
  )
}
