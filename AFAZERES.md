# Checklist de Produção & Afazeres — FlowHits

---

## ✅ CONCLUÍDO (Pronto & Testado)

- [x] **1. Impedir crédito grátis infinito por criação de estúdios**
  - Bônus inicial limitado estritamente por conta/usuário (anti-farming).
- [x] **2. Adicionar limites de geração & Rate Limiting**
  - Trava estrita de no máximo 2 gerações simultâneas por usuário/estúdio bloqueado no PostgreSQL.
  - Rate limiting dinâmico (5 logins/min, 3 cadastros/dia por IP, 4 gerações/min, 60 plays/min).
  - Blacklist de IPs com bloqueio temporário ou definitivo.
- [x] **3. Painel Administrativo Superadmin & Auditoria**
  - Métricas e KPIs ao vivo (MRR, usuários, faixas, gerações, saldo de créditos).
  - Trilha de auditoria criptograficamente imutável (gatilhos no PostgreSQL que impedem `UPDATE` e `DELETE`).
  - Gestão de usuários, estúdios, banimentos em 1 clique e moderação de músicas.
  - Tabela de configurações globais dinâmicas (`public.configuracoes_sistema`).
  - Exportação em CSV/Excel em todas as tabelas.
- [x] **4. Implementar pagamentos e ciclo comercial (Stripe Segurança 500%)**
  - 3 Assinaturas: Lite (20 cr/mês), Plus (60 cr/mês) e Pro (160 cr/mês) com 20% OFF no anual.
  - Pacotes avulsos de recarga a R$ 1,50 / crédito (10, 30 e 100 créditos).
  - Webhooks blindados com verificação de assinatura HMAC SHA-256 e proteção de idempotência.
  - Modal de Planos (`PricingModal.jsx`) e Stripe Customer Portal integrado.
  - Aba de Faturamento & MRR no Painel Admin.
- [x] **5. Suporte, LGPD e Exclusão de Dados**
  - Botão no menu drawer e modal com aviso de perigo, seleção de motivo e confirmação obrigatória digitando "EXCLUIR".
  - Execução segura no banco com cancelamento de assinaturas, exclusão em cascata e log de auditoria permanente.
- [x] **6. Reconciliação automática dos jobs da KIE em background (Cron/Worker)**
  - Edge Function `reconcile-stuck-jobs` que busca jobs pendentes, consulta a KIE, salva faixas prontas, estorna créditos de jobs com falha e aplica timeout de 15 minutos.
  - Botão manual "Reconciliar Jobs" integrado no Painel Admin (Monitor de IA).
- [x] **7. Central de Notificações Reais & Broadcast Global**
  - Notificações automáticas de recarga de créditos (`purchase`), assinaturas (`subscription`) e músicas geradas (`generation`).
  - Painel Admin: botão e modal para transmitir comunicados instantâneos a todos os usuários (`admin_send_broadcast_notification`).
  - Central no AppShell com sino pulsante, contador de não lidas, marcar todas como lidas e sincronização Realtime.

---

## ⏳ PENDENTE (Próximos Passos)

- [ ] **7. Configurar Cloudflare (WAF, DNS & CDN)**
  - Apontamento de DNS com proxy ativo (nuvem laranja).
  - Configuração de SSL/TLS (Full / Strict).
  - Regras de WAF (Web Application Firewall), proteção contra DDoS e Rate Limiting no Edge.
  - Otimização de cache de assets estáticos e headers de segurança (HSTS, CSP).
- [ ] **8. Salvar áudio e capa no Supabase Storage Próprio**
  - Fazer download automático do `.mp3` e imagem da KIE e salvar nos buckets `faixas-audio` e `faixas-capas` para as músicas nunca expirarem.
- [ ] **9. Validar webhook da KIE em produção**
  - Confirmar segredo HMAC, timestamp e resposta nos testes com a API oficial em produção.
- [ ] **10. Configurar Secrets de Produção no Supabase**
  - Inserir as chaves reais de produção: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e `KIE_API_KEY`.
- [ ] **11. Revisar Auth de produção**
  - Confirmar SMTP de e-mail transacional, confirmação de e-mail, login Google OAuth em produção.
- [ ] **12. Backup, PITR e Security Advisor**
  - Validar rotinas de backup no Supabase e rodar Security Advisor antes do lançamento oficial.
- [ ] **13. Arrumar link de compartilhamento**
