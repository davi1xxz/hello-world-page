begin;

-- Corrige auth_rls_initplan: chamadas auth/private em policies devem ser
-- avaliadas uma vez por query via initPlan, nao uma vez por linha.
drop policy if exists "Usuarios podem ver apenas seu proprio stripe_customer_id" on public.stripe_clientes;
create policy "Usuarios podem ver apenas seu proprio stripe_customer_id"
  on public.stripe_clientes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Usuarios podem ver suas proprias assinaturas" on public.assinaturas;
create policy "Usuarios podem ver suas proprias assinaturas"
  on public.assinaturas
  for select
  to authenticated
  using ((select auth.uid()) = user_id or (select private.is_admin()));

drop policy if exists "Usuarios podem ver suas proprias notificacoes e broadcasts" on public.notificacoes;
create policy "Usuarios podem ver suas proprias notificacoes e broadcasts"
  on public.notificacoes
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or is_broadcast = true
    or (select private.is_admin())
  );

drop policy if exists "Usuarios podem atualizar status de leitura de suas notificacoes" on public.notificacoes;
create policy "Usuarios podem atualizar status de leitura de suas notificacoes"
  on public.notificacoes
  for update
  to authenticated
  using ((select auth.uid()) = user_id or (select private.is_admin()))
  with check ((select auth.uid()) = user_id or (select private.is_admin()));

drop policy if exists "Usuarios gerenciam seus proprios registros de leitura de broadcast" on public.notificacoes_lidas_broadcast;
create policy "Usuarios gerenciam seus proprios registros de leitura de broadcast"
  on public.notificacoes_lidas_broadcast
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Postgres concede EXECUTE para PUBLIC em novas funcoes por padrao. Em Supabase
-- isso expoe SECURITY DEFINER em /rpc para anon/authenticated se nao houver revoke.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- RPCs chamadas pelo app autenticado.
grant execute on function public.create_studio(text, text) to authenticated;
grant execute on function public.start_generation_job(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.alternar_publicacao_faixa(uuid, boolean) to authenticated;
grant execute on function public.alternar_curtida_faixa(uuid) to authenticated;
grant execute on function public.minhas_curtidas_faixas() to authenticated;
grant execute on function public.registrar_reproducao_faixa(uuid) to authenticated;
grant execute on function public.excluir_minha_conta(text, text) to authenticated;
grant execute on function public.reativar_minha_conta() to authenticated;
grant execute on function public.is_current_user_admin() to authenticated;
grant execute on function public.get_minhas_notificacoes(int) to authenticated;
grant execute on function public.marcar_notificacao_lida(uuid) to authenticated;
grant execute on function public.marcar_todas_notificacoes_lidas() to authenticated;
grant execute on function public.obter_minha_assinatura() to authenticated;
grant execute on function public.verificar_e_consumir_rate_limit(text, int, int) to authenticated;
grant execute on function public.registrar_e_validar_acesso_ip(text, text, text) to authenticated;
grant execute on function public.get_public_system_settings() to authenticated;

-- RPCs administrativas: continuam autenticadas e cada funcao valida private.is_admin().
grant execute on function public.admin_get_overview_metrics() to authenticated;
grant execute on function public.admin_get_advanced_analytics() to authenticated;
grant execute on function public.admin_get_system_settings() to authenticated;
grant execute on function public.admin_get_ip_security_overview() to authenticated;
grant execute on function public.admin_list_users(text, int, int) to authenticated;
grant execute on function public.admin_list_all_tracks(text, boolean, int, int) to authenticated;
grant execute on function public.admin_list_generations(text, text, int, int) to authenticated;
grant execute on function public.admin_list_credits_ledger(text, text, int, int) to authenticated;
grant execute on function public.admin_get_audit_logs(text, text, int, int) to authenticated;
grant execute on function public.admin_list_subscriptions(text, text, int, int) to authenticated;
grant execute on function public.admin_adjust_credits(uuid, int, text, text) to authenticated;
grant execute on function public.admin_toggle_user_admin(uuid, boolean, text) to authenticated;
grant execute on function public.admin_toggle_user_ban(uuid, boolean, text) to authenticated;
grant execute on function public.admin_moderate_track(uuid, boolean, text) to authenticated;
grant execute on function public.admin_delete_track(uuid, text) to authenticated;
grant execute on function public.admin_retry_generation(uuid, text) to authenticated;
grant execute on function public.admin_update_system_setting(text, jsonb, text) to authenticated;
grant execute on function public.admin_toggle_block_ip(text, boolean, text, int) to authenticated;
grant execute on function public.admin_reset_rate_limit(text, text) to authenticated;
grant execute on function public.admin_change_user_subscription(uuid, text, text, text, boolean, text) to authenticated;
grant execute on function public.admin_send_broadcast_notification(text, text, text, text) to authenticated;

-- RPCs de webhook Stripe: somente service_role. Nunca anon/authenticated.
grant execute on function public.processar_checkout_stripe_concluido(text, text, text, uuid, uuid, text, text, text, int, text) to service_role;
grant execute on function public.processar_renovacao_assinatura_stripe(text, text, text, text, text) to service_role;
grant execute on function public.processar_atualizacao_status_assinatura_stripe(text, text, text, timestamptz, timestamptz, boolean) to service_role;

-- Funcao auxiliar de notificacao e triggers nao devem ser RPCs publicas.
grant execute on function public.criar_notificacao_usuario(uuid, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.trg_notificar_creditos_movimentacao() to postgres, service_role;
grant execute on function public.trg_notificar_geracao_status() to postgres, service_role;

commit;
