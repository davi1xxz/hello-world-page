-- Encerramento de conta com janela de recuperação de 30 dias.
-- NOTA OPERACIONAL: a purga física após o prazo deve ser executada por um job
-- servidor-side autenticado, nunca pelo navegador ou por RPC acessível ao usuário.

begin;

alter table public.perfis
  add column if not exists encerramento_solicitado_em timestamptz,
  add column if not exists encerramento_agendado_para timestamptz;

create index if not exists perfis_encerramento_agendado_idx
  on public.perfis (encerramento_agendado_para)
  where encerramento_agendado_para is not null;

create or replace function private.usuario_com_conta_ativa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfis p
    where p.id = (select auth.uid())
      and p.encerramento_solicitado_em is null
  );
$$;

create or replace function private.is_studio_member(target_studio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.usuario_com_conta_ativa()
    and exists (
      select 1
      from public.membros_estudio member
      where member.studio_id = target_studio_id
        and member.user_id = (select auth.uid())
    );
$$;

create or replace function private.is_studio_owner(target_studio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.usuario_com_conta_ativa()
    and exists (
      select 1
      from public.membros_estudio member
      where member.studio_id = target_studio_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner'
    );
$$;

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
  deletion_date timestamptz := now() + interval '30 days';
  clean_confirm text := upper(trim(coalesce(p_confirmacao_texto, '')));
begin
  if caller_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if clean_confirm <> 'EXCLUIR' then
    raise exception 'Confirmacao invalida. Digite EXCLUIR para confirmar o encerramento.';
  end if;

  select email into caller_email from auth.users where id = caller_id;

  update public.perfis
  set encerramento_solicitado_em = coalesce(encerramento_solicitado_em, now()),
      encerramento_agendado_para = coalesce(encerramento_agendado_para, deletion_date),
      updated_at = now()
  where id = caller_id
  returning encerramento_agendado_para into deletion_date;

  if not found then
    raise exception 'Perfil nao encontrado';
  end if;

  -- Interrompe a exposição pública imediatamente; os dados permanecem intactos
  -- apenas durante a janela de recuperação.
  update public.faixas f
  set is_public = false,
      updated_at = now()
  from public.estudios e
  where f.studio_id = e.id
    and e.created_by = caller_id
    and f.is_public = true;

  insert into public.admin_audit_logs (
    actor_id, actor_email, action, target_type, target_id, details
  ) values (
    caller_id,
    coalesce(caller_email, 'usuario'),
    'USER_ACCOUNT_DELETION_SCHEDULED',
    'user',
    caller_id::text,
    jsonb_build_object(
      'motivo', coalesce(p_motivo, 'Solicitado pelo usuario'),
      'solicitado_em', now(),
      'exclusao_agendada_para', deletion_date
    )
  );

  return jsonb_build_object(
    'success', true,
    'scheduled_for', deletion_date,
    'message', 'Sua conta foi desativada e poderá ser recuperada por 30 dias.'
  );
end;
$$;

create or replace function public.reativar_minha_conta()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  deletion_date timestamptz;
begin
  if caller_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select encerramento_agendado_para into deletion_date
  from public.perfis
  where id = caller_id
  for update;

  if deletion_date is null then
    return jsonb_build_object('success', true, 'reactivated', false);
  end if;

  if deletion_date <= now() then
    raise exception 'O prazo para recuperar esta conta expirou.';
  end if;

  update public.perfis
  set encerramento_solicitado_em = null,
      encerramento_agendado_para = null,
      updated_at = now()
  where id = caller_id;

  insert into public.admin_audit_logs (
    actor_id, actor_email, action, target_type, target_id, details
  )
  select caller_id, coalesce(u.email, 'usuario'), 'USER_ACCOUNT_REACTIVATED', 'user', caller_id::text,
         jsonb_build_object('reativada_em', now())
  from auth.users u where u.id = caller_id;

  return jsonb_build_object('success', true, 'reactivated', true);
end;
$$;

revoke all on function private.usuario_com_conta_ativa() from public, anon, authenticated;
revoke all on function public.excluir_minha_conta(text, text) from public, anon;
revoke all on function public.reativar_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta(text, text) to authenticated;
grant execute on function public.reativar_minha_conta() to authenticated;

comment on column public.perfis.encerramento_agendado_para is
  'Fim da janela de recuperação. A purga física requer job servidor-side separado.';

commit;
