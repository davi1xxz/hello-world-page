-- FlowHits: Sistema Completo de Notificações em Tempo Real (Broadcasts do Admin, Compras, Assinaturas e Gerações)

begin;

-- 1. Tabela Principal de Notificações
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  is_broadcast boolean not null default false,
  tipo text not null check (tipo in ('broadcast', 'credit_purchase', 'subscription', 'generation', 'system')),
  categoria text not null default 'info' check (categoria in ('info', 'success', 'warning', 'announcement', 'promo')),
  titulo text not null,
  mensagem text not null,
  link text,
  metadata jsonb not null default '{}'::jsonb,
  lida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notificacoes_user_id_idx on public.notificacoes (user_id);
create index if not exists notificacoes_is_broadcast_idx on public.notificacoes (is_broadcast);
create index if not exists notificacoes_created_at_idx on public.notificacoes (created_at desc);

-- 2. Tabela de Leitura de Broadcasts Globais por Usuário
create table if not exists public.notificacoes_lidas_broadcast (
  user_id uuid references auth.users(id) on delete cascade not null,
  notificacao_id uuid references public.notificacoes(id) on delete cascade not null,
  read_at timestamptz not null default now(),
  primary key (user_id, notificacao_id)
);

create index if not exists notif_lidas_broadcast_user_idx on public.notificacoes_lidas_broadcast (user_id);

-- 3. Habilitar RLS
alter table public.notificacoes enable row level security;
alter table public.notificacoes_lidas_broadcast enable row level security;

-- Políticas para Notificações
drop policy if exists "Usuarios podem ver suas proprias notificacoes e broadcasts" on public.notificacoes;
create policy "Usuarios podem ver suas proprias notificacoes e broadcasts"
  on public.notificacoes
  for select
  using (
    auth.uid() = user_id
    or is_broadcast = true
    or private.is_admin()
  );

drop policy if exists "Usuarios podem atualizar status de leitura de suas notificacoes" on public.notificacoes;
create policy "Usuarios podem atualizar status de leitura de suas notificacoes"
  on public.notificacoes
  for update
  using (auth.uid() = user_id or private.is_admin());

-- Políticas para Notificações Lidas Broadcast
drop policy if exists "Usuarios gerenciam seus proprios registros de leitura de broadcast" on public.notificacoes_lidas_broadcast;
create policy "Usuarios gerenciam seus proprios registros de leitura de broadcast"
  on public.notificacoes_lidas_broadcast
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, update on public.notificacoes to authenticated;
grant all on public.notificacoes_lidas_broadcast to authenticated;

-- 4. Função para Buscar Notificações do Usuário Atual (Unificando Pessoais e Broadcasts, Max 5 Recentes)
create or replace function public.get_minhas_notificacoes(p_limit int default 5)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  result jsonb;
begin
  if v_user_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into result
  from (
    select
      n.id,
      n.tipo,
      n.categoria,
      n.titulo,
      n.mensagem,
      n.link,
      n.metadata,
      n.is_broadcast,
      case
        when n.is_broadcast then exists(
          select 1 from public.notificacoes_lidas_broadcast nlb
          where nlb.notificacao_id = n.id and nlb.user_id = v_user_id
        )
        else n.lida
      end as lida,
      n.created_at
    from public.notificacoes n
    where n.user_id = v_user_id or n.is_broadcast = true
    order by n.created_at desc
    limit coalesce(p_limit, 5)
  ) row_data;

  return result;
end;
$$;

grant execute on function public.get_minhas_notificacoes(int) to authenticated;

-- 5. Função para Marcar Notificação como Lida
create or replace function public.marcar_notificacao_lida(p_notificacao_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_broadcast boolean;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select is_broadcast into v_is_broadcast
  from public.notificacoes
  where id = p_notificacao_id;

  if v_is_broadcast is null then
    raise exception 'Notificacao nao encontrada';
  end if;

  if v_is_broadcast then
    insert into public.notificacoes_lidas_broadcast (user_id, notificacao_id)
    values (v_user_id, p_notificacao_id)
    on conflict (user_id, notificacao_id) do nothing;
  else
    update public.notificacoes
    set lida = true
    where id = p_notificacao_id and user_id = v_user_id;
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.marcar_notificacao_lida(uuid) to authenticated;

-- 6. Função para Marcar Todas as Notificações como Lidas
create or replace function public.marcar_todas_notificacoes_lidas()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  -- 1. Marcar pessoais
  update public.notificacoes
  set lida = true
  where user_id = v_user_id and lida = false;

  -- 2. Marcar broadcasts não lidos
  insert into public.notificacoes_lidas_broadcast (user_id, notificacao_id)
  select v_user_id, n.id
  from public.notificacoes n
  where n.is_broadcast = true
  on conflict (user_id, notificacao_id) do nothing;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.marcar_todas_notificacoes_lidas() to authenticated;

-- 7. Função Administrativa para Enviar Broadcast Global a Todos os Usuários
create or replace function public.admin_send_broadcast_notification(
  p_titulo text,
  p_mensagem text,
  p_categoria text default 'announcement',
  p_link text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_email text;
  v_notif_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  if trim(coalesce(p_titulo, '')) = '' or trim(coalesce(p_mensagem, '')) = '' then
    raise exception 'Titulo e mensagem sao obrigatorios para o broadcast';
  end if;

  select email into v_admin_email from auth.users where id = v_admin_id;

  insert into public.notificacoes (
    user_id,
    is_broadcast,
    tipo,
    categoria,
    titulo,
    mensagem,
    link,
    metadata
  ) values (
    null,
    true,
    'broadcast',
    p_categoria,
    trim(p_titulo),
    trim(p_mensagem),
    nullif(trim(coalesce(p_link, '')), ''),
    jsonb_build_object('sender_admin', coalesce(v_admin_email, 'admin'))
  )
  returning id into v_notif_id;

  -- Auto-limpar broadcasts antigos mantendo apenas os 5 mais recentes
  delete from public.notificacoes
  where is_broadcast = true
    and id not in (
      select id from public.notificacoes
      where is_broadcast = true
      order by created_at desc
      limit 5
    );

  -- Registrar na auditoria
  insert into public.admin_audit_logs (
    actor_id, actor_email, action, target_type, target_id, details
  ) values (
    v_admin_id, v_admin_email, 'ADMIN_BROADCAST_NOTIFICATION', 'broadcast', v_notif_id::text,
    jsonb_build_object(
      'titulo', p_titulo,
      'categoria', p_categoria,
      'mensagem', p_mensagem
    )
  );

  return jsonb_build_object(
    'success', true,
    'notification_id', v_notif_id,
    'message', 'Notificação transmitida com sucesso para todos os usuários!'
  );
end;
$$;

grant execute on function public.admin_send_broadcast_notification(text, text, text, text) to authenticated;

-- 8. Função Auxiliar para Criar Notificação para um Usuário Específico
create or replace function public.criar_notificacao_usuario(
  p_user_id uuid,
  p_tipo text,
  p_titulo text,
  p_mensagem text,
  p_categoria text default 'info',
  p_link text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.notificacoes (
    user_id,
    is_broadcast,
    tipo,
    categoria,
    titulo,
    mensagem,
    link,
    metadata
  ) values (
    p_user_id,
    false,
    p_tipo,
    p_categoria,
    p_titulo,
    p_mensagem,
    p_link,
    p_metadata
  )
  returning id into v_id;

  -- Auto-limpar notificações antigas do usuário mantendo apenas as 5 mais recentes
  delete from public.notificacoes
  where user_id = p_user_id
    and id not in (
      select id from public.notificacoes
      where user_id = p_user_id
      order by created_at desc
      limit 5
    );

  return v_id;
end;
$$;

-- 9. Trigger Automático: Notificar Usuário ao Alterar Assinatura ou Adicionar Créditos
create or replace function public.trg_notificar_creditos_movimentacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  -- Buscar o usuário dono do estúdio
  select created_by into v_user_id
  from public.estudios
  where id = new.studio_id;

  if v_user_id is not null and new.amount > 0 then
    if new.reason = 'purchase' then
      perform public.criar_notificacao_usuario(
        v_user_id,
        'credit_purchase',
        '💳 Recarga de Créditos Confirmada!',
        'Você recebeu +' || new.amount || ' créditos em seu estúdio com sucesso.',
        'success',
        '/studio',
        jsonb_build_object('amount', new.amount, 'reason', new.reason)
      );
    elsif new.reason = 'adjustment' or new.reason = 'subscription_cycle' or new.reason = 'subscription_update' then
      perform public.criar_notificacao_usuario(
        v_user_id,
        'subscription',
        '⭐ Créditos do Plano Atribuídos!',
        'Foram adicionados +' || new.amount || ' créditos ao seu saldo.',
        'success',
        '/studio',
        jsonb_build_object('amount', new.amount, 'reason', new.reason)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notificar_creditos on public.creditos_movimentacoes;
create trigger trg_notificar_creditos
  after insert on public.creditos_movimentacoes
  for each row
  execute function public.trg_notificar_creditos_movimentacao();

-- 10. Trigger Automático: Notificar Usuário quando Geração de Música for Concluída ou Falhar
create or replace function public.trg_notificar_geracao_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.requested_by is not null then
    if new.status in ('ready', 'completed') and (old.status is null or old.status in ('queued', 'processing')) then
      perform public.criar_notificacao_usuario(
        new.requested_by,
        'generation',
        '🎵 Sua música ficou pronta!',
        'Sua faixa "' || coalesce(new.title, 'Hit Inédito') || '" foi gerada com sucesso pela IA.',
        'success',
        '/library',
        jsonb_build_object('generation_id', new.id, 'prompt', new.prompt)
      );
    elsif new.status = 'failed' and (old.status is null or old.status in ('queued', 'processing')) then
      perform public.criar_notificacao_usuario(
        new.requested_by,
        'generation',
        '⚠️ Geração não concluída',
        'A geração da sua faixa encontrou uma instabilidade. Seus créditos foram estornados automaticamente.',
        'warning',
        '/studio',
        jsonb_build_object('generation_id', new.id, 'error', new.error_message)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notificar_geracao on public.geracoes;
create trigger trg_notificar_geracao
  after update on public.geracoes
  for each row
  execute function public.trg_notificar_geracao_status();

commit;
