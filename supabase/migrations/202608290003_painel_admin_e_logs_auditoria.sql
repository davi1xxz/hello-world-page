-- FlowHits: Painel de Administração Seguro, RBAC e Logs de Auditoria Imutáveis
-- Migração que estabelece infraestrutura 100% segura para gestão da plataforma.

begin;

-- 1. Tabela de Administradores
create table if not exists public.administradores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'superadmin' check (role in ('superadmin', 'admin', 'moderator')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.administradores enable row level security;

-- 2. Tabela de Logs de Auditoria
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text not null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_action_idx on public.admin_audit_logs (action);
create index if not exists admin_audit_logs_actor_id_idx on public.admin_audit_logs (actor_id);

alter table public.admin_audit_logs enable row level security;

-- 3. Função de verificação de Admin no schema private
create or replace function private.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.administradores a
    where a.user_id = coalesce(check_user_id, auth.uid())
  );
$$;

-- 4. Função pública para checar se o usuário atual é admin
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin(auth.uid());
$$;

grant execute on function public.is_current_user_admin() to authenticated, anon;

-- 5. Bloqueio de alteração e exclusão de logs de auditoria (Imutabilidade garantida)
create or replace function private.prevent_audit_log_tampering()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Registros de auditoria sao imutaveis e nao podem ser alterados ou removidos';
end;
$$;

drop trigger if exists trg_prevent_audit_log_tampering on public.admin_audit_logs;
create trigger trg_prevent_audit_log_tampering
before update or delete on public.admin_audit_logs
for each row execute function private.prevent_audit_log_tampering();

-- 6. Políticas RLS para Administradores e Logs de Auditoria
drop policy if exists "Apenas administradores podem ler tabela de administradores" on public.administradores;
create policy "Apenas administradores podem ler tabela de administradores"
  on public.administradores
  for select
  using (private.is_admin());

drop policy if exists "Apenas administradores podem ler logs de auditoria" on public.admin_audit_logs;
create policy "Apenas administradores podem ler logs de auditoria"
  on public.admin_audit_logs
  for select
  using (private.is_admin());

-- 7. Funções RPC Administrativas Seguras (Security Definer com validação estrita)

-- 7.1 Métricas Gerais do Dashboard
create or replace function public.admin_get_overview_metrics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_admin() then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  select jsonb_build_object(
    'total_users', (select count(*)::int from auth.users),
    'total_studios', (select count(*)::int from public.estudios),
    'total_tracks', (select count(*)::int from public.faixas),
    'public_tracks', (select count(*)::int from public.faixas where is_public = true),
    'jobs_queued', (select count(*)::int from public.geracoes where status = 'queued'),
    'jobs_processing', (select count(*)::int from public.geracoes where status = 'processing'),
    'jobs_completed', (select count(*)::int from public.geracoes where status = 'completed'),
    'jobs_failed', (select count(*)::int from public.geracoes where status = 'failed'),
    'total_credits_balance', (select coalesce(sum(amount), 0)::int from public.creditos_movimentacoes),
    'total_plays', (select coalesce(sum(reproducoes_count), 0)::int from public.estatisticas_faixas),
    'total_likes', (select coalesce(sum(curtidas_count), 0)::int from public.estatisticas_faixas),
    'total_audit_events_24h', (select count(*)::int from public.admin_audit_logs where created_at >= now() - interval '24 hours')
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_get_overview_metrics() to authenticated;

-- 7.2 Listagem de Usuários e Estatísticas
create or replace function public.admin_list_users(
  p_search text default '',
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  users_data jsonb;
  total_count int;
begin
  if not private.is_admin() then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  select count(*)::int
  into total_count
  from auth.users u
  left join public.perfis p on p.id = u.id
  where (
    p_search is null
    or p_search = ''
    or u.email ilike '%' || p_search || '%'
    or coalesce(p.display_name, '') ilike '%' || p_search || '%'
    or u.id::text = p_search
  );

  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into users_data
  from (
    select
      u.id,
      u.email,
      coalesce(p.display_name, 'Sem nome') as display_name,
      p.avatar_url,
      u.created_at,
      u.last_sign_in_at,
      exists(select 1 from public.administradores a where a.user_id = u.id) as is_admin,
      coalesce((select role from public.administradores a where a.user_id = u.id), 'user') as admin_role,
      (
        select jsonb_agg(jsonb_build_object(
          'id', e.id,
          'name', e.name,
          'slug', e.slug,
          'role', m.role,
          'credits', coalesce((select sum(amount)::int from public.creditos_movimentacoes c where c.studio_id = e.id), 0),
          'tracks_count', (select count(*)::int from public.faixas f where f.studio_id = e.id),
          'jobs_count', (select count(*)::int from public.geracoes g where g.studio_id = e.id)
        ))
        from public.membros_estudio m
        join public.estudios e on e.id = m.studio_id
        where m.user_id = u.id
      ) as studios
    from auth.users u
    left join public.perfis p on p.id = u.id
    where (
      p_search is null
      or p_search = ''
      or u.email ilike '%' || p_search || '%'
      or coalesce(p.display_name, '') ilike '%' || p_search || '%'
      or u.id::text = p_search
    )
    order by u.created_at desc
    limit coalesce(p_limit, 50)
    offset coalesce(p_offset, 0)
  ) row_data;

  return jsonb_build_object(
    'total', total_count,
    'users', users_data
  );
end;
$$;

grant execute on function public.admin_list_users(text, int, int) to authenticated;

-- 7.3 Ajuste Atômico de Créditos com Registro em Auditoria
create or replace function public.admin_adjust_credits(
  p_studio_id uuid,
  p_amount int,
  p_reason text,
  p_admin_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  studio_rec record;
  new_balance int;
begin
  if not private.is_admin(caller_id) then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'O valor do ajuste deve ser diferente de zero';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A justificativa do ajuste e obrigatoria';
  end if;

  select id, name, slug into studio_rec
  from public.estudios
  where id = p_studio_id;

  if studio_rec.id is null then
    raise exception 'Estudio nao encontrado';
  end if;

  select email into caller_email from auth.users where id = caller_id;

  -- Inserir movimento no livro-razão
  insert into public.creditos_movimentacoes (studio_id, amount, reason)
  values (p_studio_id, p_amount, 'adjustment');

  -- Calcular novo saldo
  select coalesce(sum(amount), 0)::int into new_balance
  from public.creditos_movimentacoes
  where studio_id = p_studio_id;

  -- Gravar log de auditoria obrigatório
  insert into public.admin_audit_logs (
    actor_id,
    actor_email,
    action,
    target_type,
    target_id,
    details
  ) values (
    caller_id,
    coalesce(caller_email, 'admin@flowhits.com'),
    'CREDIT_ADJUSTMENT',
    'studio',
    p_studio_id::text,
    jsonb_build_object(
      'studio_name', studio_rec.name,
      'studio_slug', studio_rec.slug,
      'amount_adjusted', p_amount,
      'new_balance', new_balance,
      'reason', p_reason,
      'note', p_admin_note
    )
  );

  return jsonb_build_object(
    'success', true,
    'studio_id', p_studio_id,
    'amount_adjusted', p_amount,
    'new_balance', new_balance
  );
end;
$$;

grant execute on function public.admin_adjust_credits(uuid, int, text, text) to authenticated;

-- 7.4 Listagem Global de Faixas com Moderação
create or replace function public.admin_list_all_tracks(
  p_search text default '',
  p_filter_public boolean default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tracks_data jsonb;
  total_count int;
begin
  if not private.is_admin() then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  select count(*)::int
  into total_count
  from public.faixas f
  join public.estudios e on e.id = f.studio_id
  where (
    p_filter_public is null or f.is_public = p_filter_public
  ) and (
    p_search is null
    or p_search = ''
    or f.title ilike '%' || p_search || '%'
    or coalesce(f.subtitle, '') ilike '%' || p_search || '%'
    or f.style ilike '%' || p_search || '%'
    or e.name ilike '%' || p_search || '%'
  );

  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into tracks_data
  from (
    select
      f.id,
      f.title,
      f.subtitle,
      f.style,
      f.voice,
      f.duration_seconds,
      f.audio_url,
      f.cover_url,
      f.status,
      f.is_public,
      f.created_at,
      f.studio_id,
      e.name as studio_name,
      e.slug as studio_slug,
      u.email as creator_email,
      coalesce(ef.reproducoes_count, 0)::int as plays_count,
      coalesce(ef.curtidas_count, 0)::int as likes_count
    from public.faixas f
    join public.estudios e on e.id = f.studio_id
    left join auth.users u on u.id = f.created_by
    left join public.estatisticas_faixas ef on ef.faixa_id = f.id
    where (
      p_filter_public is null or f.is_public = p_filter_public
    ) and (
      p_search is null
      or p_search = ''
      or f.title ilike '%' || p_search || '%'
      or coalesce(f.subtitle, '') ilike '%' || p_search || '%'
      or f.style ilike '%' || p_search || '%'
      or e.name ilike '%' || p_search || '%'
    )
    order by f.created_at desc
    limit coalesce(p_limit, 50)
    offset coalesce(p_offset, 0)
  ) row_data;

  return jsonb_build_object(
    'total', total_count,
    'tracks', tracks_data
  );
end;
$$;

grant execute on function public.admin_list_all_tracks(text, boolean, int, int) to authenticated;

-- 7.5 Moderação de Faixa com Auditoria
create or replace function public.admin_moderate_track(
  p_track_id uuid,
  p_is_public boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  track_rec record;
begin
  if not private.is_admin(caller_id) then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'O motivo da moderacao e obrigatorio';
  end if;

  select f.id, f.title, f.is_public, f.studio_id into track_rec
  from public.faixas f
  where f.id = p_track_id;

  if track_rec.id is null then
    raise exception 'Faixa nao encontrada';
  end if;

  select email into caller_email from auth.users where id = caller_id;

  update public.faixas
  set is_public = p_is_public,
      updated_at = now()
  where id = p_track_id;

  insert into public.admin_audit_logs (
    actor_id,
    actor_email,
    action,
    target_type,
    target_id,
    details
  ) values (
    caller_id,
    coalesce(caller_email, 'admin@flowhits.com'),
    'TRACK_MODERATION',
    'track',
    p_track_id::text,
    jsonb_build_object(
      'track_title', track_rec.title,
      'previous_is_public', track_rec.is_public,
      'new_is_public', p_is_public,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'track_id', p_track_id,
    'is_public', p_is_public
  );
end;
$$;

grant execute on function public.admin_moderate_track(uuid, boolean, text) to authenticated;

-- 7.6 Monitor de Gerações (IA / KIE)
create or replace function public.admin_list_generations(
  p_status text default null,
  p_search text default '',
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  jobs_data jsonb;
  total_count int;
begin
  if not private.is_admin() then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  select count(*)::int
  into total_count
  from public.geracoes g
  join public.estudios e on e.id = g.studio_id
  where (
    p_status is null or p_status = '' or g.status = p_status
  ) and (
    p_search is null
    or p_search = ''
    or coalesce(g.prompt, '') ilike '%' || p_search || '%'
    or coalesce(g.lyrics, '') ilike '%' || p_search || '%'
    or g.style ilike '%' || p_search || '%'
    or e.name ilike '%' || p_search || '%'
  );

  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into jobs_data
  from (
    select
      g.id,
      g.studio_id,
      e.name as studio_name,
      e.slug as studio_slug,
      u.email as requested_by_email,
      g.style,
      g.voice,
      g.mode,
      g.status,
      g.prompt,
      g.lyrics,
      g.provider_task_id,
      g.failure_reason,
      g.created_at,
      g.completed_at,
      g.callback_received_at,
      (select count(*)::int from public.faixas f where f.generation_job_id = g.id) as generated_tracks_count
    from public.geracoes g
    join public.estudios e on e.id = g.studio_id
    left join auth.users u on u.id = g.requested_by
    where (
      p_status is null or p_status = '' or g.status = p_status
    ) and (
      p_search is null
      or p_search = ''
      or coalesce(g.prompt, '') ilike '%' || p_search || '%'
      or coalesce(g.lyrics, '') ilike '%' || p_search || '%'
      or g.style ilike '%' || p_search || '%'
      or e.name ilike '%' || p_search || '%'
    )
    order by g.created_at desc
    limit coalesce(p_limit, 50)
    offset coalesce(p_offset, 0)
  ) row_data;

  return jsonb_build_object(
    'total', total_count,
    'generations', jobs_data
  );
end;
$$;

grant execute on function public.admin_list_generations(text, text, int, int) to authenticated;

-- 7.7 Reprocessar / Reenfileirar Geração com Auditoria
create or replace function public.admin_retry_generation(
  p_generation_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  gen_rec record;
begin
  if not private.is_admin(caller_id) then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A justificativa do reprocessamento e obrigatoria';
  end if;

  select id, status, studio_id into gen_rec
  from public.geracoes
  where id = p_generation_id;

  if gen_rec.id is null then
    raise exception 'Geracao nao encontrada';
  end if;

  select email into caller_email from auth.users where id = caller_id;

  update public.geracoes
  set status = 'queued',
      failure_reason = null,
      completed_at = null
  where id = p_generation_id;

  insert into public.admin_audit_logs (
    actor_id,
    actor_email,
    action,
    target_type,
    target_id,
    details
  ) values (
    caller_id,
    coalesce(caller_email, 'admin@flowhits.com'),
    'GENERATION_RETRY',
    'generation',
    p_generation_id::text,
    jsonb_build_object(
      'previous_status', gen_rec.status,
      'new_status', 'queued',
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'generation_id', p_generation_id,
    'status', 'queued'
  );
end;
$$;

grant execute on function public.admin_retry_generation(uuid, text) to authenticated;

-- 7.8 Livro-Razão Global de Créditos
create or replace function public.admin_list_credits_ledger(
  p_search text default '',
  p_reason text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ledger_data jsonb;
  total_count int;
begin
  if not private.is_admin() then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  select count(*)::int
  into total_count
  from public.creditos_movimentacoes c
  join public.estudios e on e.id = c.studio_id
  where (
    p_reason is null or p_reason = '' or c.reason = p_reason
  ) and (
    p_search is null
    or p_search = ''
    or e.name ilike '%' || p_search || '%'
    or e.slug ilike '%' || p_search || '%'
  );

  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into ledger_data
  from (
    select
      c.id,
      c.studio_id,
      e.name as studio_name,
      e.slug as studio_slug,
      c.amount,
      c.reason,
      c.reference_id,
      c.created_at
    from public.creditos_movimentacoes c
    join public.estudios e on e.id = c.studio_id
    where (
      p_reason is null or p_reason = '' or c.reason = p_reason
    ) and (
      p_search is null
      or p_search = ''
      or e.name ilike '%' || p_search || '%'
      or e.slug ilike '%' || p_search || '%'
    )
    order by c.created_at desc
    limit coalesce(p_limit, 50)
    offset coalesce(p_offset, 0)
  ) row_data;

  return jsonb_build_object(
    'total', total_count,
    'movements', ledger_data
  );
end;
$$;

grant execute on function public.admin_list_credits_ledger(text, text, int, int) to authenticated;

-- 7.9 Consulta aos Logs de Auditoria
create or replace function public.admin_get_audit_logs(
  p_action_filter text default null,
  p_search text default '',
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  logs_data jsonb;
  total_count int;
begin
  if not private.is_admin() then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  select count(*)::int
  into total_count
  from public.admin_audit_logs l
  where (
    p_action_filter is null or p_action_filter = '' or l.action = p_action_filter
  ) and (
    p_search is null
    or p_search = ''
    or l.actor_email ilike '%' || p_search || '%'
    or l.action ilike '%' || p_search || '%'
    or l.target_type ilike '%' || p_search || '%'
    or coalesce(l.target_id, '') ilike '%' || p_search || '%'
    or l.details::text ilike '%' || p_search || '%'
  );

  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into logs_data
  from (
    select
      l.id,
      l.actor_id,
      l.actor_email,
      l.action,
      l.target_type,
      l.target_id,
      l.details,
      l.created_at
    from public.admin_audit_logs l
    where (
      p_action_filter is null or p_action_filter = '' or l.action = p_action_filter
    ) and (
      p_search is null
      or p_search = ''
      or l.actor_email ilike '%' || p_search || '%'
      or l.action ilike '%' || p_search || '%'
      or l.target_type ilike '%' || p_search || '%'
      or coalesce(l.target_id, '') ilike '%' || p_search || '%'
      or l.details::text ilike '%' || p_search || '%'
    )
    order by l.created_at desc
    limit coalesce(p_limit, 50)
    offset coalesce(p_offset, 0)
  ) row_data;

  return jsonb_build_object(
    'total', total_count,
    'logs', logs_data
  );
end;
$$;

grant execute on function public.admin_get_audit_logs(text, text, int, int) to authenticated;

-- 7.10 Gerenciamento de Privilégios de Administrador com Auditoria
create or replace function public.admin_toggle_user_admin(
  p_target_user_id uuid,
  p_make_admin boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  target_email text;
begin
  if not private.is_admin(caller_id) then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A justificativa para alteracao de cargo e obrigatoria';
  end if;

  select email into target_email from auth.users where id = p_target_user_id;
  if target_email is null then
    raise exception 'Usuario destino nao encontrado';
  end if;

  select email into caller_email from auth.users where id = caller_id;

  if p_make_admin then
    insert into public.administradores (user_id, role, created_by)
    values (p_target_user_id, 'admin', caller_id)
    on conflict (user_id) do nothing;
  else
    -- Evitar que o único admin se remova
    if (select count(*) from public.administradores) <= 1 and caller_id = p_target_user_id then
      raise exception 'Nao e permitido remover o unico administrador do sistema';
    end if;
    delete from public.administradores where user_id = p_target_user_id;
  end if;

  insert into public.admin_audit_logs (
    actor_id,
    actor_email,
    action,
    target_type,
    target_id,
    details
  ) values (
    caller_id,
    coalesce(caller_email, 'admin@flowhits.com'),
    'USER_ROLE_CHANGE',
    'user',
    p_target_user_id::text,
    jsonb_build_object(
      'target_email', target_email,
      'is_admin', p_make_admin,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'is_admin', p_make_admin
  );
end;
$$;

grant execute on function public.admin_toggle_user_admin(uuid, boolean, text) to authenticated;

-- 8. Inicializar Administradores existentes
insert into public.administradores (user_id, role)
select id, 'superadmin'
from auth.users
where email in ('davi.sanswork@gmail.com', 'frost1davi@gmail.com', 'lynxbr92@gmail.com')
on conflict (user_id) do nothing;

-- 9. Registrar primeiro log de auditoria de inicialização do sistema
insert into public.admin_audit_logs (
  actor_id,
  actor_email,
  action,
  target_type,
  target_id,
  details
)
values (
  (select id from auth.users order by created_at asc limit 1),
  'sistema@flowhits.com',
  'SYSTEM_INITIALIZATION',
  'system',
  'flowhits-admin-v1',
  jsonb_build_object(
    'version', '1.0.0',
    'status', 'Painel de administracao e infraestrutura de auditoria inicializados com sucesso'
  )
);

commit;
