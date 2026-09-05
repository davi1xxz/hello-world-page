# FlowHits 1.0

FlowHits e um estudio musical web para criar, organizar e reproduzir faixas de torcida com IA.

## Funcionalidades

- Login e cadastro com Supabase Auth.
- Criacao/carregamento automatico do estudio do usuario.
- Estudio de criacao com modo simples e modo personalizavel.
- Envio de geracoes para Edge Function `generate-music`.
- Callback da KIE pela Edge Function `kie-callback`.
- Persistencia das faixas geradas no banco.
- Biblioteca publica entre usuarios autenticados.
- Publicacao/despublicacao de faixas pelo dono.
- Saldo de creditos calculado em tempo real pelas movimentacoes do estudio.
- Biblioteca com busca e filtros.
- Player de audio real com play/pausa, progresso, volume, repeticao e navegacao.
- Compartilhamento nativo/copia de link e download quando a faixa tiver audio disponivel.
- Layout responsivo para desktop e mobile.

## Banco de Dados

As tabelas publicas foram renomeadas para portugues:

| Tabela | Funcao |
| --- | --- |
| `perfis` | Perfil basico do usuario autenticado. |
| `estudios` | Espacos de criacao do usuario. |
| `membros_estudio` | Relacao entre usuarios e estudios. |
| `faixas` | Musicas salvas no estudio. |
| `geracoes` | Jobs enviados para o provedor de IA. |
| `creditos_movimentacoes` | Livro de entradas, gastos e reembolsos de creditos. |
| `biblioteca_publica` | View com faixas publicadas por usuarios. |

Todas as tabelas estao com RLS ativo. A biblioteca publica mostra apenas faixas `ready` marcadas com `is_public = true`, e a view expoe somente campos seguros.

## Supabase

Variaveis locais esperadas em `.env.local`:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_DB_URL=
```

Secrets remotos usados pelas Edge Functions:

```text
KIE_API_KEY
KIE_WEBHOOK_HMAC_KEY
APP_ORIGIN
```

Para configurar a KIE sem salvar chave em arquivo:

```powershell
.\scripts\set-kie-secret.ps1
```

## Executar Localmente

```bash
npm install
npm run dev
```

Abra o endereco mostrado pelo Vite, normalmente `http://localhost:5173`.

## Comandos

```bash
npm run dev      # inicia o ambiente de desenvolvimento
npm run build    # gera a versao de producao
npm run preview  # visualiza a versao de producao
npm run lint     # executa o linter
```

## Estrutura

```text
src/
  App.jsx                    # estado global, auth, estudio, faixas e player
  components/
    AppShell.jsx             # cabecalho, menu e navegacao responsiva
    CreateConsole.jsx        # formulario de criacao conectado a Edge Function
    PlayerBar.jsx            # player persistente
    TrackRow.jsx             # item reutilizavel de faixa
  data/mockData.js           # dados de fallback e catalogos de estilos/vozes
  pages/
    AuthPage.jsx             # login e cadastro
    HomePage.jsx             # feed e criacao rapida
    StudioPage.jsx           # estudio e criacoes recentes
    CollectionPage.jsx       # biblioteca, busca, filtros e planos

supabase/
  functions/
    generate-music/          # inicia geracao na KIE
    kie-callback/            # recebe callback assinado e salva faixas
  migrations/                # historico SQL versionado
```
