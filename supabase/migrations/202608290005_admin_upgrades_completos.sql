-- FlowHits: Upgrades Avançados do Painel Administrativo
-- 1. Banimento/Suspensão de Usuários
-- 2. Tabela de Configurações Dinâmicas do Sistema
-- 3. Exclusão Segura / Moderação Avançada de Faixas
-- 4. Métricas Avançadas por Estilo e Período

begin;

-- 1. Colunas de Banimento e Status em perfis
alter table public.perfis
  add column if not exists is_banned boolean not null default false,
  add column if not exists banned_at timestamptz,
  add column if not exists banned_reason text;

-- 2. Tabela de Configurações Globais do Sistema
create table if not exists public.configuracoes_sistema (
  chave text primary key,
  valor jsonb not null,
  descricao text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.configuracoes_sistema enable row level security;

-- Políticas RLS para configuracoes_sistema
drop policy if exists "Apenas administradores podem gerenciar configuracoes_sistema" on public.configuracoes_sistema;
create policy "Apenas administradores podem gerenciar configuracoes_sistema"
  on public.configuracoes_sistema
  for all
  using (private.is_admin());

grant select on public.configuracoes_sistema to authenticated, anon;

-- Inserir configurações padrão
insert into public.configuracoes_sistema (chave, valor, descricao)
values
  ('custo_geracao_creditos', '1'::jsonb, 'Quantidade de créditos consumidos por cada geração de música'),
  ('creditos_iniciais_cadastro', '18'::jsonb, 'Créditos concedidos no cadastro de novos estúdios'),
  ('modo_manutencao', 'false'::jsonb, 'Ativar modo de manutenção global na plataforma'),
  ('banner_aviso_global', '""'::jsonb, 'Mensagem de aviso fixada no topo para todos os usuários'),
  ('webhook_alertas_url', '""'::jsonb, 'URL do Webhook (Discord/Slack/Telegram) para alertas críticos')
on conflict (chave) do nothing;

-- 3. Função pública para leitura de configurações públicas não sensíveis
create or replace function public.get_public_system_settings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'modo_manutencao', coalesce((select valor from public.configuracoes_sistema where chave = 'modo_manutencao'), 'false'::jsonb),
    'banner_aviso_global', coalesce((select valor from public.configuracoes_sistema where chave = 'banner_aviso_global'), '""'::jsonb),
    'custo_geracao_creditos', coalesce((select valor from public.configuracoes_sistema where chave = 'custo_geracao_creditos'), '1'::jsonb)
  ) into result;
  return result;
end;
$$;

grant execute on function public.get_public_system_settings() to authenticated, anon;

-- 4. Função administrativa para listar todas as configurações
create or replace function public.admin_get_system_settings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  configs jsonb;
begin
  if not private.is_admin() then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into configs
  from (
    select chave, valor, descricao, updated_at
    from public.configuracoes_sistema
    order by chave asc
  ) row_data;

  return configs;
end;
$$;

grant execute on function public.admin_get_system_settings() to authenticated;

-- 5. Função administrativa para atualizar configuração com auditoria
create or replace function public.admin_update_system_setting(
  p_chave text,
  p_valor jsonb,
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
  old_rec record;
begin
  if not private.is_admin(caller_id) then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A justificativa para alteracao de configuracao e obrigatoria';
  end if;

  select chave, valor into old_rec
  from public.configuracoes_sistema
  where chave = p_chave;

  if old_rec.chave is null then
    raise exception 'Configuracao nao encontrada: %', p_chave;
  end if;

  select email into caller_email from auth.users where id = caller_id;

  update public.configuracoes_sistema
  set valor = p_valor,
      updated_at = now(),
      updated_by = caller_id
  where chave = p_chave;

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
    'SYSTEM_SETTING_CHANGE',
    'setting',
    p_chave,
    jsonb_build_object(
      'key', p_chave,
      'old_value', old_rec.valor,
      'new_value', p_valor,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'key', p_chave,
    'value', p_valor
  );
end;
$$;

grant execute on function public.admin_update_system_setting(text, jsonb, text) to authenticated;

-- 6. Função administrativa para banir ou desbanir usuário com auditoria
create or replace function public.admin_toggle_user_ban(
  p_target_user_id uuid,
  p_banned boolean,
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

  if p_target_user_id = caller_id then
    raise exception 'Nao e permitido banir a propria conta de administrador';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A justificativa do banimento/desbanimento e obrigatoria';
  end if;

  select email into target_email from auth.users where id = p_target_user_id;
  if target_email is null then
    raise exception 'Usuario nao encontrado';
  end if;

  select email into caller_email from auth.users where id = caller_id;

  update public.perfis
  set is_banned = p_banned,
      banned_at = case when p_banned then now() else null end,
      banned_reason = case when p_banned then p_reason else null end
  where id = p_target_user_id;

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
    case when p_banned then 'USER_SUSPENSION' else 'USER_UNSUSPEND' end,
    'user',
    p_target_user_id::text,
    jsonb_build_object(
      'target_email', target_email,
      'is_banned', p_banned,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'is_banned', p_banned
  );
end;
$$;

grant execute on function public.admin_toggle_user_ban(uuid, boolean, text) to authenticated;

-- 7. Função administrativa para excluir faixa com registro em auditoria
create or replace function public.admin_delete_track(
  p_track_id uuid,
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
    raise exception 'A justificativa da exclusao da faixa e obrigatoria';
  end if;

  select f.id, f.title, f.studio_id into track_rec
  from public.faixas f
  where f.id = p_track_id;

  if track_rec.id is null then
    raise exception 'Faixa nao encontrada';
  end if;

  select email into caller_email from auth.users where id = caller_id;

  delete from public.faixas where id = p_track_id;

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
    'TRACK_DELETION',
    'track',
    p_track_id::text,
    jsonb_build_object(
      'track_title', track_rec.title,
      'studio_id', track_rec.studio_id,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'track_id', p_track_id
  );
end;
$$;

grant execute on function public.admin_delete_track(uuid, text) to authenticated;

-- 8. Atualizar admin_list_users para retornar is_banned e banned_reason
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
      coalesce(p.is_banned, false) as is_banned,
      p.banned_at,
      p.banned_reason,
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

-- 9. Métricas Avançadas por Estilo de Música e Últimos Dias
create or replace function public.admin_get_advanced_analytics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  styles_breakdown jsonb;
  daily_generations jsonb;
begin
  if not private.is_admin() then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  -- Distribuição por Estilo
  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into styles_breakdown
  from (
    select style, count(*)::int as count
    from public.faixas
    group by style
    order by count desc
    limit 10
  ) row_data;

  -- Gerações diárias dos últimos 7 dias
  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into daily_generations
  from (
    select
      to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
      count(*)::int as total,
      count(*) filter (where status = 'completed')::int as completed,
      count(*) filter (where status = 'failed')::int as failed
    from public.geracoes
    where created_at >= now() - interval '7 days'
    group by date_trunc('day', created_at)
    order by day asc
  ) row_data;

  return jsonb_build_object(
    'styles', styles_breakdown,
    'daily', daily_generations
  );
end;
$$;

grant execute on function public.admin_get_advanced_analytics() to authenticated;

commit;
