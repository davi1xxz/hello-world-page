begin;

create or replace function public.secure_rpc(
  p_function text,
  p_args jsonb default '{}'::jsonb,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_function text := trim(coalesce(p_function, ''));
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
  v_actor uuid := coalesce(p_actor_id, auth.uid());
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  case v_function
    when 'reativar_minha_conta' then
      v_result := public.reativar_minha_conta();
    when 'minhas_curtidas_faixas' then
      select coalesce(jsonb_agg(jsonb_build_object('faixa_id', t.faixa_id)), '[]'::jsonb)
      into v_result
      from public.minhas_curtidas_faixas() as t(faixa_id);
    when 'is_current_user_admin' then
      v_result := to_jsonb(public.is_current_user_admin());
    when 'alternar_publicacao_faixa' then
      v_result := public.alternar_publicacao_faixa(
        (v_args->>'p_faixa_id')::uuid,
        nullif(v_args->>'p_is_public', '')::boolean
      );
    when 'alternar_curtida_faixa' then
      v_result := to_jsonb(public.alternar_curtida_faixa((v_args->>'target_faixa_id')::uuid));
    when 'get_minhas_notificacoes' then
      v_result := public.get_minhas_notificacoes(coalesce((v_args->>'p_limit')::int, 5));
    when 'marcar_notificacao_lida' then
      v_result := public.marcar_notificacao_lida((v_args->>'p_notificacao_id')::uuid);
    when 'marcar_todas_notificacoes_lidas' then
      v_result := public.marcar_todas_notificacoes_lidas();
    when 'obter_minha_assinatura' then
      v_result := public.obter_minha_assinatura();
    when 'excluir_minha_conta' then
      v_result := public.excluir_minha_conta(v_args->>'p_confirmacao_texto', v_args->>'p_motivo');
    when 'registrar_reproducao_faixa' then
      v_result := to_jsonb(public.registrar_reproducao_faixa((v_args->>'target_faixa_id')::uuid));
    when 'get_public_system_settings' then
      v_result := public.get_public_system_settings();

    when 'admin_get_overview_metrics' then v_result := public.admin_get_overview_metrics();
    when 'admin_get_advanced_analytics' then v_result := public.admin_get_advanced_analytics();
    when 'admin_get_system_settings' then v_result := public.admin_get_system_settings();
    when 'admin_get_ip_security_overview' then v_result := public.admin_get_ip_security_overview();
    when 'admin_list_users' then
      v_result := public.admin_list_users(coalesce(v_args->>'p_search', ''), coalesce((v_args->>'p_limit')::int, 50), coalesce((v_args->>'p_offset')::int, 0));
    when 'admin_list_all_tracks' then
      v_result := public.admin_list_all_tracks(coalesce(v_args->>'p_search', ''), nullif(v_args->>'p_filter_public', '')::boolean, coalesce((v_args->>'p_limit')::int, 50), coalesce((v_args->>'p_offset')::int, 0));
    when 'admin_list_generations' then
      v_result := public.admin_list_generations(nullif(v_args->>'p_status', ''), coalesce(v_args->>'p_search', ''), coalesce((v_args->>'p_limit')::int, 50), coalesce((v_args->>'p_offset')::int, 0));
    when 'admin_list_credits_ledger' then
      v_result := public.admin_list_credits_ledger(coalesce(v_args->>'p_search', ''), nullif(v_args->>'p_reason', ''), coalesce((v_args->>'p_limit')::int, 50), coalesce((v_args->>'p_offset')::int, 0));
    when 'admin_get_audit_logs' then
      v_result := public.admin_get_audit_logs(nullif(v_args->>'p_action_filter', ''), coalesce(v_args->>'p_search', ''), coalesce((v_args->>'p_limit')::int, 50), coalesce((v_args->>'p_offset')::int, 0));
    when 'admin_list_subscriptions' then
      v_result := public.admin_list_subscriptions(nullif(v_args->>'p_status', ''), coalesce(v_args->>'p_search', ''), coalesce((v_args->>'p_limit')::int, 50), coalesce((v_args->>'p_offset')::int, 0));
    when 'admin_adjust_credits' then
      v_result := public.admin_adjust_credits((v_args->>'p_studio_id')::uuid, (v_args->>'p_amount')::int, v_args->>'p_reason', v_args->>'p_admin_note');
    when 'admin_toggle_user_admin' then
      v_result := public.admin_toggle_user_admin((v_args->>'p_target_user_id')::uuid, (v_args->>'p_make_admin')::boolean, v_args->>'p_reason');
    when 'admin_update_user_name' then
      v_result := public.admin_update_user_name((v_args->>'p_target_user_id')::uuid, v_args->>'p_new_name', v_args->>'p_reason');
    when 'admin_toggle_user_ban' then
      v_result := public.admin_toggle_user_ban((v_args->>'p_target_user_id')::uuid, (v_args->>'p_banned')::boolean, v_args->>'p_reason');
    when 'admin_moderate_track' then
      v_result := public.admin_moderate_track((v_args->>'p_track_id')::uuid, (v_args->>'p_is_public')::boolean, v_args->>'p_reason');
    when 'admin_delete_track' then
      v_result := public.admin_delete_track((v_args->>'p_track_id')::uuid, v_args->>'p_reason');
    when 'admin_retry_generation' then
      v_result := public.admin_retry_generation((v_args->>'p_generation_id')::uuid, v_args->>'p_reason');
    when 'admin_update_system_setting' then
      v_result := public.admin_update_system_setting(v_args->>'p_chave', v_args->'p_valor', v_args->>'p_reason');
    when 'admin_toggle_block_ip' then
      v_result := public.admin_toggle_block_ip(v_args->>'p_ip', (v_args->>'p_block')::boolean, v_args->>'p_reason', nullif(v_args->>'p_duration_hours', '')::int);
    when 'admin_reset_rate_limit' then
      v_result := public.admin_reset_rate_limit(v_args->>'p_key', v_args->>'p_reason');
    when 'admin_change_user_subscription' then
      v_result := public.admin_change_user_subscription((v_args->>'p_target_user_id')::uuid, v_args->>'p_plan_tier', coalesce(v_args->>'p_billing_interval', 'monthly'), coalesce(v_args->>'p_status', 'active'), coalesce((v_args->>'p_grant_credits')::boolean, true), coalesce(v_args->>'p_reason', 'Alteracao manual de plano via Painel Admin'));
    when 'admin_send_broadcast_notification' then
      v_result := public.admin_send_broadcast_notification(v_args->>'p_titulo', v_args->>'p_mensagem', v_args->>'p_categoria', v_args->>'p_link');
    else
      raise exception 'RPC nao permitida: %', v_function;
  end case;

  return v_result;
end;
$$;

revoke execute on function public.secure_rpc(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.secure_rpc(text, jsonb, uuid) to service_role;

commit;
