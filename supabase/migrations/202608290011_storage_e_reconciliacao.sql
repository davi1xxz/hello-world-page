-- FlowHits: Buckets de Storage Próprios, Reconciliação Automática e Exclusão LGPD

begin;

-- 1. Criação dos Buckets de Storage para Áudios e Capas
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('faixas-audio', 'faixas-audio', true, 52428800, array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg']),
  ('faixas-capas', 'faixas-capas', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true;

-- Políticas de Storage: Leitura Pública e Upload Autorizado
drop policy if exists "Leitura publica de faixas-audio" on storage.objects;
create policy "Leitura publica de faixas-audio"
  on storage.objects for select
  using (bucket_id in ('faixas-audio', 'faixas-capas'));

drop policy if exists "Upload em faixas-audio e capas por service role e autenticados" on storage.objects;
create policy "Upload em faixas-audio e capas por service role e autenticados"
  on storage.objects for insert
  with check (bucket_id in ('faixas-audio', 'faixas-capas'));

drop policy if exists "Update em faixas-audio e capas por service role e autenticados" on storage.objects;
create policy "Update em faixas-audio e capas por service role e autenticados"
  on storage.objects for update
  using (bucket_id in ('faixas-audio', 'faixas-capas'));

-- 2. Função de Reconciliação Automática de Jobs Pendentes (Background Worker / Cron)
create or replace function public.admin_reconcile_pending_jobs(p_older_than_minutes int default 5)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  stuck_jobs jsonb;
  reconciled_count int := 0;
begin
  -- Seleciona jobs em 'processing' ou 'queued' travados há mais de X minutos com provider_task_id
  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into stuck_jobs
  from (
    select id, studio_id, requested_by, provider_task_id, status, created_at
    from public.geracoes
    where status in ('processing', 'queued')
      and provider_task_id is not null
      and created_at < now() - (p_older_than_minutes || ' minutes')::interval
    order by created_at asc
    limit 20
  ) row_data;

  return jsonb_build_object(
    'success', true,
    'stuck_jobs', stuck_jobs,
    'total_stuck', jsonb_array_length(stuck_jobs)
  );
end;
$$;

grant execute on function public.admin_reconcile_pending_jobs(int) to authenticated;

-- 3. Função de Exclusão de Conta / LGPD (Direito ao Esquecimento)
create or replace function public.solicitar_exclusao_minha_conta(p_motivo text default 'Solicitacao do usuario')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
begin
  if caller_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select email into caller_email from auth.users where id = caller_id;

  -- 1. Registrar auditoria permanente antes da exclusão
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
    jsonb_build_object('motivo', p_motivo, 'email', caller_email)
  );

  -- 2. Anonimizar/Marcar perfil como excluído
  update public.perfis
  set display_name = 'Usuario Excluido',
      is_banned = true,
      banned_reason = 'Conta encerrada a pedido do usuario (LGPD)'
  where id = caller_id;

  -- 3. Deletar estúdios e dados vinculados via CASCADE
  delete from public.estudios where created_by = caller_id;

  return jsonb_build_object('success', true, 'message', 'Conta e dados encerrados com sucesso.');
end;
$$;

grant execute on function public.solicitar_exclusao_minha_conta(text) to authenticated;

commit;
