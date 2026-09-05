-- FlowHits: Sistema de Pagamento e Assinaturas Stripe (Segurança 500%)
-- 1. Tabela de Vínculo de Clientes Stripe
-- 2. Tabela de Assinaturas (Lite, Plus, Pro - Mensal / Anual)
-- 3. Tabela de Idempotência de Eventos Stripe (Anti-Replay)
-- 4. Funções RPC Atômicas e Seguras de Concessão de Créditos e Renovação
-- 5. Consulta de Assinatura para Usuários e Painel Administrativo

begin;

-- 1. Tabela de Clientes Stripe
create table if not exists public.stripe_clientes (
  user_id uuid references auth.users(id) on delete cascade primary key,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

alter table public.stripe_clientes enable row level security;

drop policy if exists "Usuarios podem ver apenas seu proprio stripe_customer_id" on public.stripe_clientes;
create policy "Usuarios podem ver apenas seu proprio stripe_customer_id"
  on public.stripe_clientes
  for select
  using (auth.uid() = user_id);

grant select on public.stripe_clientes to authenticated;

-- 2. Tabela de Assinaturas
create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  studio_id uuid references public.estudios(id) on delete cascade not null,
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null,
  plan_tier text not null check (plan_tier in ('lite', 'plus', 'pro')),
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  credits_per_interval int not null check (credits_per_interval > 0),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled', 'trialing', 'incomplete', 'unpaid')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assinaturas_user_id_idx on public.assinaturas (user_id);
create index if not exists assinaturas_studio_id_idx on public.assinaturas (studio_id);
create index if not exists assinaturas_stripe_sub_idx on public.assinaturas (stripe_subscription_id);

alter table public.assinaturas enable row level security;

drop policy if exists "Usuarios podem ver suas proprias assinaturas" on public.assinaturas;
create policy "Usuarios podem ver suas proprias assinaturas"
  on public.assinaturas
  for select
  using (auth.uid() = user_id or private.is_admin());

grant select on public.assinaturas to authenticated;

-- 3. Tabela de Idempotência de Eventos Stripe (Anti-Replay / Proteção contra duplicidade)
create table if not exists public.stripe_eventos_processados (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  metadata jsonb default '{}'::jsonb
);

alter table public.stripe_eventos_processados enable row level security;

drop policy if exists "Apenas administradores podem ler stripe_eventos_processados" on public.stripe_eventos_processados;
create policy "Apenas administradores podem ler stripe_eventos_processados"
  on public.stripe_eventos_processados
  for select
  using (private.is_admin());

grant select on public.stripe_eventos_processados to authenticated;

-- 4. Função RPC: Processar Checkout Concluído (Compra Avulsa ou Assinatura Inicial)
create or replace function public.processar_checkout_stripe_concluido(
  p_event_id text,
  p_session_id text,
  p_customer_id text,
  p_user_id uuid,
  p_studio_id uuid,
  p_mode text,
  p_plan_tier text default null,
  p_billing_interval text default null,
  p_credits int default 0,
  p_subscription_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  already_processed boolean;
  user_email text;
begin
  -- 1. Verificação de Idempotência Estrita
  select exists(
    select 1 from public.stripe_eventos_processados where event_id = p_event_id
  ) into already_processed;

  if already_processed then
    return jsonb_build_object('success', true, 'message', 'Evento ja processado anteriormente (idempotente).');
  end if;

  -- 2. Registrar cliente Stripe
  if p_customer_id is not null and p_user_id is not null then
    insert into public.stripe_clientes (user_id, stripe_customer_id)
    values (p_user_id, p_customer_id)
    on conflict (user_id) do update
      set stripe_customer_id = p_customer_id;
  end if;

  select email into user_email from auth.users where id = p_user_id;

  -- 3. Modo Assinatura (subscription)
  if p_mode = 'subscription' and p_subscription_id is not null then
    insert into public.assinaturas (
      user_id,
      studio_id,
      stripe_subscription_id,
      stripe_customer_id,
      plan_tier,
      billing_interval,
      credits_per_interval,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end
    ) values (
      p_user_id,
      p_studio_id,
      p_subscription_id,
      p_customer_id,
      coalesce(p_plan_tier, 'lite'),
      coalesce(p_billing_interval, 'monthly'),
      p_credits,
      'active',
      now(),
      case when p_billing_interval = 'yearly' then now() + interval '1 year' else now() + interval '1 month' end,
      false
    )
    on conflict (stripe_subscription_id) do update
      set plan_tier = coalesce(p_plan_tier, assinaturas.plan_tier),
          billing_interval = coalesce(p_billing_interval, assinaturas.billing_interval),
          credits_per_interval = p_credits,
          status = 'active',
          updated_at = now();

    -- Conceder créditos da primeira mensalidade/anuidade
    if p_credits > 0 then
      insert into public.creditos_movimentacoes (
        studio_id,
        amount,
        reason,
        reference_id
      ) values (
        p_studio_id,
        p_credits,
        'purchase',
        p_session_id
      )
      on conflict (reference_id, reason) do nothing;
    end if;

    -- Registrar auditoria
    insert into public.admin_audit_logs (
      actor_id,
      actor_email,
      action,
      target_type,
      target_id,
      details
    ) values (
      p_user_id,
      coalesce(user_email, 'stripe_system'),
      'SUBSCRIPTION_CREATED',
      'subscription',
      p_subscription_id,
      jsonb_build_object(
        'plan_tier', p_plan_tier,
        'billing_interval', p_billing_interval,
        'credits', p_credits,
        'session_id', p_session_id
      )
    );

  -- 4. Modo Pagamento Avulso de Créditos (payment)
  elsif p_mode = 'payment' and p_credits > 0 then
    insert into public.creditos_movimentacoes (
      studio_id,
      amount,
      reason,
      reference_id
    ) values (
      p_studio_id,
      p_credits,
      'purchase',
      p_session_id
    )
    on conflict (reference_id, reason) do nothing;

    -- Registrar auditoria
    insert into public.admin_audit_logs (
      actor_id,
      actor_email,
      action,
      target_type,
      target_id,
      details
    ) values (
      p_user_id,
      coalesce(user_email, 'stripe_system'),
      'CREDIT_PURCHASE',
      'studio',
      p_studio_id::text,
      jsonb_build_object(
        'credits', p_credits,
        'session_id', p_session_id
      )
    );
  end if;

  -- 5. Marcar evento como processado
  insert into public.stripe_eventos_processados (event_id, event_type, metadata)
  values (p_event_id, 'checkout.session.completed', jsonb_build_object('session_id', p_session_id, 'mode', p_mode));

  return jsonb_build_object('success', true, 'credits_granted', p_credits);
end;
$$;

grant execute on function public.processar_checkout_stripe_concluido(text, text, text, uuid, uuid, text, text, text, int, text) to authenticated, anon;

-- 5. Função RPC: Processar Renovação Recorrente da Assinatura (Fatura Paga / invoice.paid)
create or replace function public.processar_renovacao_assinatura_stripe(
  p_event_id text,
  p_invoice_id text,
  p_subscription_id text,
  p_customer_id text,
  p_billing_reason text default 'subscription_cycle'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  already_processed boolean;
  sub_rec record;
  user_email text;
begin
  -- 1. Idempotência
  select exists(
    select 1 from public.stripe_eventos_processados where event_id = p_event_id
  ) into already_processed;

  if already_processed then
    return jsonb_build_object('success', true, 'message', 'Fatura ja processada anteriormente.');
  end if;

  -- 2. Localizar assinatura
  select id, user_id, studio_id, plan_tier, billing_interval, credits_per_interval
  into sub_rec
  from public.assinaturas
  where stripe_subscription_id = p_subscription_id;

  if sub_rec.id is null then
    return jsonb_build_object('success', false, 'error', 'Assinatura nao encontrada.');
  end if;

  -- 3. Se for renovação de ciclo regular, concede os créditos do novo período
  if p_billing_reason in ('subscription_cycle', 'subscription_update') and sub_rec.credits_per_interval > 0 then
    insert into public.creditos_movimentacoes (
      studio_id,
      amount,
      reason,
      reference_id
    ) values (
      sub_rec.studio_id,
      sub_rec.credits_per_interval,
      'purchase',
      p_invoice_id
    )
    on conflict (reference_id, reason) do nothing;

    -- Atualizar vigência da assinatura
    update public.assinaturas
    set status = 'active',
        current_period_start = now(),
        current_period_end = case when sub_rec.billing_interval = 'yearly' then now() + interval '1 year' else now() + interval '1 month' end,
        updated_at = now()
    where id = sub_rec.id;

    select email into user_email from auth.users where id = sub_rec.user_id;

    insert into public.admin_audit_logs (
      actor_id,
      actor_email,
      action,
      target_type,
      target_id,
      details
    ) values (
      sub_rec.user_id,
      coalesce(user_email, 'stripe_system'),
      'SUBSCRIPTION_RENEWAL',
      'subscription',
      p_subscription_id,
      jsonb_build_object(
        'invoice_id', p_invoice_id,
        'credits_granted', sub_rec.credits_per_interval,
        'plan_tier', sub_rec.plan_tier
      )
    );
  end if;

  -- 4. Registrar evento processado
  insert into public.stripe_eventos_processados (event_id, event_type, metadata)
  values (p_event_id, 'invoice.paid', jsonb_build_object('invoice_id', p_invoice_id, 'subscription_id', p_subscription_id));

  return jsonb_build_object('success', true, 'credits_renewed', sub_rec.credits_per_interval);
end;
$$;

grant execute on function public.processar_renovacao_assinatura_stripe(text, text, text, text, text) to authenticated, anon;

-- 6. Função RPC: Processar Atualização / Cancelamento de Assinatura (customer.subscription.updated / deleted)
create or replace function public.processar_atualizacao_status_assinatura_stripe(
  p_event_id text,
  p_subscription_id text,
  p_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  already_processed boolean;
  sub_rec record;
  user_email text;
begin
  select exists(
    select 1 from public.stripe_eventos_processados where event_id = p_event_id
  ) into already_processed;

  if already_processed then
    return jsonb_build_object('success', true, 'message', 'Evento ja processado.');
  end if;

  select id, user_id from public.assinaturas where stripe_subscription_id = p_subscription_id into sub_rec;

  if sub_rec.id is not null then
    update public.assinaturas
    set status = p_status,
        current_period_start = coalesce(p_period_start, current_period_start),
        current_period_end = coalesce(p_period_end, current_period_end),
        cancel_at_period_end = p_cancel_at_period_end,
        updated_at = now()
    where stripe_subscription_id = p_subscription_id;

    select email into user_email from auth.users where id = sub_rec.user_id;

    insert into public.admin_audit_logs (
      actor_id,
      actor_email,
      action,
      target_type,
      target_id,
      details
    ) values (
      sub_rec.user_id,
      coalesce(user_email, 'stripe_system'),
      'SUBSCRIPTION_STATUS_CHANGE',
      'subscription',
      p_subscription_id,
      jsonb_build_object('status', p_status, 'cancel_at_period_end', p_cancel_at_period_end)
    );
  end if;

  insert into public.stripe_eventos_processados (event_id, event_type, metadata)
  values (p_event_id, 'customer.subscription.status_change', jsonb_build_object('subscription_id', p_subscription_id, 'status', p_status));

  return jsonb_build_object('success', true, 'status', p_status);
end;
$$;

grant execute on function public.processar_atualizacao_status_assinatura_stripe(text, text, text, timestamptz, timestamptz, boolean) to authenticated, anon;

-- 7. Função para usuário autenticado consultar sua assinatura ativa
create or replace function public.obter_minha_assinatura()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  sub_data jsonb;
begin
  if caller_id is null then
    return null;
  end if;

  select to_jsonb(a)
  into sub_data
  from (
    select
      id,
      plan_tier,
      billing_interval,
      credits_per_interval,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end
    from public.assinaturas
    where user_id = caller_id
      and status in ('active', 'past_due', 'trialing')
    order by created_at desc
    limit 1
  ) a;

  return sub_data;
end;
$$;

grant execute on function public.obter_minha_assinatura() to authenticated;

-- 8. Função para o Administrador listar assinaturas no Painel Admin
create or replace function public.admin_list_subscriptions(
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
  total_count int;
  subs_list jsonb;
  mrr_estimate numeric := 0;
begin
  if not private.is_admin() then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  select count(*)::int
  into total_count
  from public.assinaturas a
  join auth.users u on u.id = a.user_id
  where (p_status is null or a.status = p_status)
    and (p_search = '' or u.email ilike '%' || p_search || '%' or a.plan_tier ilike '%' || p_search || '%');

  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into subs_list
  from (
    select
      a.id,
      a.user_id,
      u.email as user_email,
      e.name as studio_name,
      a.plan_tier,
      a.billing_interval,
      a.credits_per_interval,
      a.status,
      a.current_period_start,
      a.current_period_end,
      a.cancel_at_period_end,
      a.stripe_subscription_id,
      a.created_at
    from public.assinaturas a
    join auth.users u on u.id = a.user_id
    left join public.estudios e on e.id = a.studio_id
    where (p_status is null or a.status = p_status)
      and (p_search = '' or u.email ilike '%' || p_search || '%' or a.plan_tier ilike '%' || p_search || '%')
    order by a.created_at desc
    limit p_limit
    offset p_offset
  ) row_data;

  -- Calcular estimativa de MRR (Monthly Recurring Revenue)
  select coalesce(sum(
    case
      when plan_tier = 'lite' and billing_interval = 'monthly' then 30.00
      when plan_tier = 'lite' and billing_interval = 'yearly' then 24.00
      when plan_tier = 'plus' and billing_interval = 'monthly' then 90.00
      when plan_tier = 'plus' and billing_interval = 'yearly' then 72.00
      when plan_tier = 'pro' and billing_interval = 'monthly' then 240.00
      when plan_tier = 'pro' and billing_interval = 'yearly' then 192.00
      else 0
    end
  ), 0)
  into mrr_estimate
  from public.assinaturas
  where status = 'active';

  return jsonb_build_object(
    'total', total_count,
    'mrr', mrr_estimate,
    'subscriptions', subs_list
  );
end;
$$;

grant execute on function public.admin_list_subscriptions(text, text, int, int) to authenticated;

commit;
