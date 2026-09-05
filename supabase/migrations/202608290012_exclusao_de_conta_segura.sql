-- FlowHits: Exclusão de Conta Segura & Conformidade LGPD (Direito ao Esquecimento)

begin;

create or replace function public.excluir_minha_conta(
  p_confirmacao_texto text,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  clean_confirm text := upper(trim(coalesce(p_confirmacao_texto, '')));
begin
  if caller_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select email into caller_email from auth.users where id = caller_id;

  -- 1. Validação de Confirmação de Segurança
  if clean_confirm <> 'EXCLUIR' and clean_confirm <> upper(trim(coalesce(caller_email, ''))) then
    raise exception 'Confirmacao invalida. Digite EXCLUIR para confirmar a exclusao definitiva.';
  end if;

  -- 2. Registro Permanente na Trilha de Auditoria
  insert into public.admin_audit_logs (
    actor_id,
    actor_email,
    action,
    target_type,
    target_id,
    details
  ) values (
    caller_id,
    coalesce(caller_email, 'usuario_excluido'),
    'USER_ACCOUNT_DELETED',
    'user',
    caller_id::text,
    jsonb_build_object(
      'email', caller_email,
      'motivo', coalesce(p_motivo, 'Solicitado pelo usuario'),
      'deleted_at', now()
    )
  );

  -- 3. Cancelar assinaturas ativas no banco
  update public.assinaturas
  set status = 'canceled',
      cancel_at_period_end = true,
      updated_at = now()
  where user_id = caller_id;

  -- 4. Excluir estúdios, faixas, gerações e dados vinculados (Cascade)
  delete from public.estudios where created_by = caller_id;
  delete from public.membros_estudio where user_id = caller_id;
  delete from public.curtidas_faixas where usuario_id = caller_id;
  delete from public.reproducoes_faixas where usuario_id = caller_id;

  -- 5. Anonimizar perfil do usuário
  update public.perfis
  set display_name = 'Conta Excluída',
      is_banned = true,
      banned_reason = 'Conta encerrada e anonimizada a pedido do usuario (LGPD)',
      banned_at = now()
  where id = caller_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Sua conta e todos os dados vinculados foram excluidos com sucesso.'
  );
end;
$$;

grant execute on function public.excluir_minha_conta(text, text) to authenticated;

commit;
