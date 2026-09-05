-- FlowHits: Sistema Completo de Rate Limiting, Verificação de IP e Limite de Gerações Simultâneas
-- 1. Limite estrito de 2 gerações simultâneas por estúdio/usuário
-- 2. Tabela de Rate Limits com expiração dinâmica
-- 3. Tabela de IPs Bloqueados (Blacklist)
-- 4. Registro e Rastreamento de Acessos por IP (com detecção de multi-contas)
-- 5. Funções seguras de validação e consumo de limites

begin;

-- 1. Tabela de Rate Limits
create table if not exists public.rate_limits (
  chave text primary key,
  contador int not null default 1,
  janela_inicio timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists rate_limits_expires_at_idx on public.rate_limits (expires_at);

alter table public.rate_limits enable row level security;
grant select on public.rate_limits to authenticated, anon;

-- 2. Tabela de IPs Bloqueados (Blacklist)
create table if not exists public.ips_bloqueados (
  ip text primary key,
  motivo text not null,
  bloqueado_em timestamptz not null default now(),
  bloqueado_ate timestamptz,
  bloqueado_por uuid references auth.users(id) on delete set null
);

alter table public.ips_bloqueados enable row level security;

drop policy if exists "Apenas administradores gerenciam ips_bloqueados" on public.ips_bloqueados;
create policy "Apenas administradores gerenciam ips_bloqueados"
  on public.ips_bloqueados
  for all
  using (private.is_admin());

grant select on public.ips_bloqueados to authenticated, anon;

-- 3. Tabela de Registro e Rastreamento de Acessos por IP
create table if not exists public.registro_ips_acessos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  ip_address text not null,
  user_agent text,
  action_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists registro_ips_ip_idx on public.registro_ips_acessos (ip_address, created_at desc);
create index if not exists registro_ips_user_idx on public.registro_ips_acessos (user_id, created_at desc);
create index if not exists registro_ips_action_idx on public.registro_ips_acessos (action_type);

alter table public.registro_ips_acessos enable row level security;

drop policy if exists "Apenas administradores podem ler registro_ips_acessos" on public.registro_ips_acessos;
create policy "Apenas administradores podem ler registro_ips_acessos"
  on public.registro_ips_acessos
  for select
  using (private.is_admin());

grant select on public.registro_ips_acessos to authenticated;

-- 4. Função para verificar e consumir Rate Limit atômico
create or replace function public.verificar_e_consumir_rate_limit(
  p_chave text,
  p_max_requests int,
  p_janela_segundos int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_rec record;
  now_ts timestamptz := now();
  is_allowed boolean := true;
  remaining int;
  reset_seconds int;
begin
  select chave, contador, janela_inicio, expires_at
  into current_rec
  from public.rate_limits
  where chave = p_chave;

  if current_rec.chave is null or current_rec.expires_at <= now_ts then
    -- Criar ou resetar janela
    insert into public.rate_limits (chave, contador, janela_inicio, expires_at)
    values (p_chave, 1, now_ts, now_ts + (p_janela_segundos || ' seconds')::interval)
    on conflict (chave) do update
      set contador = 1,
          janela_inicio = now_ts,
          expires_at = now_ts + (p_janela_segundos || ' seconds')::interval;

    remaining := p_max_requests - 1;
    reset_seconds := p_janela_segundos;
  else
    if current_rec.contador >= p_max_requests then
      is_allowed := false;
      remaining := 0;
      reset_seconds := greatest(1, extract(epoch from (current_rec.expires_at - now_ts))::int);
    else
      update public.rate_limits
      set contador = contador + 1
      where chave = p_chave;

      remaining := p_max_requests - (current_rec.contador + 1);
      reset_seconds := greatest(1, extract(epoch from (current_rec.expires_at - now_ts))::int);
    end if;
  end if;

  return jsonb_build_object(
    'allowed', is_allowed,
    'remaining', greatest(0, remaining),
    'reset_seconds', reset_seconds
  );
end;
$$;

grant execute on function public.verificar_e_consumir_rate_limit(text, int, int) to authenticated, anon;

-- 5. Função para registrar acesso com verificação de IP e limites
create or replace function public.registrar_e_validar_acesso_ip(
  p_ip text,
  p_action text,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  is_blocked boolean;
  block_rec record;
  rate_res jsonb;
  max_req int := 60;
  window_sec int := 60;
  clean_ip text := trim(p_ip);
begin
  if clean_ip is null or clean_ip = '' then
    clean_ip := '127.0.0.1';
  end if;

  -- 1. Verificar se o IP está bloqueado na Blacklist
  select ip, motivo, bloqueado_ate into block_rec
  from public.ips_bloqueados
  where ip = clean_ip
    and (bloqueado_ate is null or bloqueado_ate > now());

  if block_rec.ip is not null then
    return jsonb_build_object(
      'allowed', false,
      'error', 'IP_BLOQUEADO',
      'message', 'Seu endereço IP foi temporariamente bloqueado por motivos de segurança: ' || block_rec.motivo
    );
  end if;

  -- 2. Definir limites conforme o tipo de ação
  if p_action = 'auth_login' then
    max_req := 5; -- Max 5 tentativas de login por minuto por IP
    window_sec := 60;
  elsif p_action = 'auth_signup' then
    max_req := 3; -- Max 3 cadastros por dia por IP (Anti-Farming de créditos)
    window_sec := 86400;
  elsif p_action = 'generation' then
    max_req := 4; -- Max 4 chamadas de geração por minuto
    window_sec := 60;
  elsif p_action = 'like_play' then
    max_req := 60; -- Max 60 interações por minuto
    window_sec := 60;
  end if;

  -- 3. Consumir Rate Limit
  rate_res := public.verificar_e_consumir_rate_limit(
    'rl:' || p_action || ':' || clean_ip,
    max_req,
    window_sec
  );

  if not (rate_res ->> 'allowed')::boolean then
    return jsonb_build_object(
      'allowed', false,
      'error', 'RATE_LIMIT_EXCEEDED',
      'message', 'Muitas requisições. Aguarde ' || (rate_res ->> 'reset_seconds') || ' segundos antes de tentar novamente.',
      'reset_seconds', (rate_res ->> 'reset_seconds')::int
    );
  end if;

  -- 4. Registrar acesso no histórico
  insert into public.registro_ips_acessos (
    user_id,
    ip_address,
    user_agent,
    action_type
  ) values (
    caller_id,
    clean_ip,
    p_user_agent,
    p_action
  );

  return jsonb_build_object(
    'allowed', true,
    'remaining', (rate_res ->> 'remaining')::int
  );
end;
$$;

grant execute on function public.registrar_e_validar_acesso_ip(text, text, text) to authenticated, anon;

-- 6. Gatilho de Proteção Estrita em public.geracoes:
-- Impede mais de 2 gerações simultâneas e barra usuários banidos
create or replace function private.validar_regras_geracao_seguranca()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_jobs_count int;
  user_banned boolean;
  user_banned_reason text;
begin
  -- 1. Verificar se o usuário está banido/suspenso
  select coalesce(is_banned, false), banned_reason
  into user_banned, user_banned_reason
  from public.perfis
  where id = new.requested_by;

  if user_banned then
    raise exception 'Sua conta foi suspensa: %', coalesce(user_banned_reason, 'Violação dos termos de uso.');
  end if;

  -- 2. Limite Estrito de 2 Gerações Simultâneas por Estúdio
  select count(*)::int
  into active_jobs_count
  from public.geracoes
  where studio_id = new.studio_id
    and status in ('queued', 'processing');

  if active_jobs_count >= 2 then
    raise exception 'Limite de requisições simultâneas atingido. Você já possui 2 gerações em andamento. Aguarde a conclusão para iniciar outra.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_regras_geracao_seguranca on public.geracoes;
create trigger trg_validar_regras_geracao_seguranca
before insert on public.geracoes
for each row execute function private.validar_regras_geracao_seguranca();

-- 7. Funções Administrativas de Gestão de IPs e Rate Limits

-- 7.1 Listar Monitoramento de IPs e Contas Vinculadas
create or replace function public.admin_get_ip_security_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  top_ips jsonb;
  blocked_ips jsonb;
  active_limits jsonb;
begin
  if not private.is_admin() then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  -- Top IPs mais ativos e contagem de usuários distintos por IP (Detecção de Multi-Contas)
  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into top_ips
  from (
    select
      r.ip_address,
      count(*)::int as total_requests,
      count(distinct r.user_id)::int as distinct_users_count,
      max(r.created_at) as last_seen_at,
      exists(select 1 from public.ips_bloqueados b where b.ip = r.ip_address and (b.bloqueado_ate is null or b.bloqueado_ate > now())) as is_blocked
    from public.registro_ips_acessos r
    group by r.ip_address
    order by total_requests desc
    limit 50
  ) row_data;

  -- IPs Bloqueados
  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into blocked_ips
  from (
    select ip, motivo, bloqueado_em, bloqueado_ate
    from public.ips_bloqueados
    order by bloqueado_em desc
  ) row_data;

  -- Rate limits atualmente ativos
  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into active_limits
  from (
    select chave, contador, janela_inicio, expires_at
    from public.rate_limits
    where expires_at > now()
    order by contador desc
    limit 30
  ) row_data;

  return jsonb_build_object(
    'top_ips', top_ips,
    'blocked_ips', blocked_ips,
    'active_limits', active_limits
  );
end;
$$;

grant execute on function public.admin_get_ip_security_overview() to authenticated;

-- 7.2 Banir ou Desbanir Endereço IP com Auditoria
create or replace function public.admin_toggle_block_ip(
  p_ip text,
  p_block boolean,
  p_reason text,
  p_duration_hours int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  clean_ip text := trim(p_ip);
  until_ts timestamptz := null;
begin
  if not private.is_admin(caller_id) then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  if clean_ip is null or clean_ip = '' then
    raise exception 'Endereco IP invalido';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A justificativa do bloqueio/desbloqueio e obrigatoria';
  end if;

  select email into caller_email from auth.users where id = caller_id;

  if p_block then
    if p_duration_hours is not null and p_duration_hours > 0 then
      until_ts := now() + (p_duration_hours || ' hours')::interval;
    end if;

    insert into public.ips_bloqueados (ip, motivo, bloqueado_em, bloqueado_ate, bloqueado_por)
    values (clean_ip, p_reason, now(), until_ts, caller_id)
    on conflict (ip) do update
      set motivo = p_reason,
          bloqueado_ate = until_ts,
          bloqueado_por = caller_id;
  else
    delete from public.ips_bloqueados where ip = clean_ip;
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
    case when p_block then 'IP_BLOCK' else 'IP_UNBLOCK' end,
    'ip',
    clean_ip,
    jsonb_build_object(
      'ip', clean_ip,
      'is_blocked', p_block,
      'duration_hours', p_duration_hours,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'ip', clean_ip,
    'is_blocked', p_block
  );
end;
$$;

grant execute on function public.admin_toggle_block_ip(text, boolean, text, int) to authenticated;

-- 7.3 Resetar Rate Limit de uma chave com Auditoria
create or replace function public.admin_reset_rate_limit(
  p_key text,
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
begin
  if not private.is_admin(caller_id) then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  select email into caller_email from auth.users where id = caller_id;

  delete from public.rate_limits where chave = p_key;

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
    'RATE_LIMIT_RESET',
    'rate_limit',
    p_key,
    jsonb_build_object(
      'key', p_key,
      'reason', p_reason
    )
  );

  return jsonb_build_object('success', true, 'key', p_key);
end;
$$;

grant execute on function public.admin_reset_rate_limit(text, text) to authenticated;

commit;
