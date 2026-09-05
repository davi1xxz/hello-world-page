-- FlowHits: MRR no Overview & Gestão/Troca de Assinaturas pelo Painel Admin

begin;

-- 1. Atualizar admin_get_overview_metrics para incluir MRR e Assinantes Ativos
create or replace function public.admin_get_overview_metrics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  calc_mrr numeric := 0;
begin
  if not private.is_admin() then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  -- Cálculo do MRR da base ativa
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
  into calc_mrr
  from public.assinaturas
  where status = 'active';

  select jsonb_build_object(
    'total_users', (select count(*)::int from auth.users),
    'total_studios', (select count(*)::int from public.estudios),
    'total_tracks', (select count(*)::int from public.faixas),
    'public_tracks', (select count(*)::int from public.faixas where is_public = true),
    'jobs_queued', (select count(*)::int from public.geracoes where status = 'queued'),
    'jobs_processing', (select count(*)::int from public.geracoes where status = 'processing'),
    'jobs_completed', (select count(*)::int from public.geracoes where status in ('ready', 'completed')),
    'jobs_failed', (select count(*)::int from public.geracoes where status = 'failed'),
    'total_credits_balance', (select coalesce(sum(amount), 0)::int from public.creditos_movimentacoes),
    'total_plays', (select coalesce(sum(reproducoes_count), 0)::int from public.estatisticas_faixas),
    'total_likes', (select coalesce(sum(curtidas_count), 0)::int from public.estatisticas_faixas),
    'total_audit_events_24h', (select count(*)::int from public.admin_audit_logs where created_at >= now() - interval '24 hours'),
    'mrr_estimado', calc_mrr,
    'total_active_subscribers', (select count(*)::int from public.assinaturas where status = 'active')
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_get_overview_metrics() to authenticated;

-- 2. Atualizar admin_list_users para trazer plano ativo do usuário
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
      coalesce(p.is_banned, false) as is_banned,
      p.banned_reason,
      p.banned_at,
      (
        select jsonb_agg(jsonb_build_object(
          'id', e.id,
          'name', e.name,
          'slug', e.slug,
          'credits', coalesce((select sum(amount)::int from public.creditos_movimentacoes c where c.studio_id = e.id), 0),
          'tracks_count', (select count(*)::int from public.faixas f where f.studio_id = e.id),
          'jobs_count', (select count(*)::int from public.geracoes g where g.studio_id = e.id)
        ))
        from public.estudios e
        where e.created_by = u.id
      ) as studios,
      (
        select jsonb_build_object(
          'plan_tier', sub.plan_tier,
          'billing_interval', sub.billing_interval,
          'status', sub.status,
          'credits_per_interval', sub.credits_per_interval,
          'current_period_end', sub.current_period_end
        )
        from public.assinaturas sub
        where sub.user_id = u.id
        order by sub.created_at desc
        limit 1
      ) as active_subscription
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
    limit p_limit
    offset p_offset
  ) row_data;

  return jsonb_build_object(
    'total', total_count,
    'users', users_data
  );
end;
$$;

grant execute on function public.admin_list_users(text, int, int) to authenticated;

-- 3. Função RPC para o Admin Trocar/Atribuir Assinatura de Qualquer Usuário
create or replace function public.admin_change_user_subscription(
  p_target_user_id uuid,
  p_plan_tier text, -- 'none', 'lite', 'plus', 'pro'
  p_billing_interval text default 'monthly', -- 'monthly', 'yearly'
  p_status text default 'active', -- 'active', 'canceled'
  p_grant_credits boolean default true,
  p_reason text default 'Alteração manual de plano via Painel Admin'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_email text;
  v_user_email text;
  v_studio_id uuid;
  v_credits_to_grant int := 0;
  v_sub_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Acesso negado: privilegios de administrador necessarios';
  end if;

  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'Justificativa obrigatoria para auditoria.';
  end if;

  select email into v_admin_email from auth.users where id = v_admin_id;
  select email into v_user_email from auth.users where id = p_target_user_id;

  if v_user_email is null then
    raise exception 'Usuario de destino nao encontrado.';
  end if;

  -- Obter o estúdio principal do usuário ou criar se não existir
  select id into v_studio_id
  from public.estudios
  where created_by = p_target_user_id
  order by created_at asc
  limit 1;

  if v_studio_id is null then
    insert into public.estudios (created_by, name, slug)
    values (
      p_target_user_id,
      coalesce((select split_part(v_user_email, '@', 1)), 'Estúdio'),
      'studio-' || substr(md5(p_target_user_id::text), 1, 8)
    )
    returning id into v_studio_id;
  end if;

  -- Calcular créditos do plano
  if p_plan_tier = 'lite' then
    v_credits_to_grant := case when p_billing_interval = 'yearly' then 240 else 20 end;
  elsif p_plan_tier = 'plus' then
    v_credits_to_grant := case when p_billing_interval = 'yearly' then 720 else 60 end;
  elsif p_plan_tier = 'pro' then
    v_credits_to_grant := case when p_billing_interval = 'yearly' then 1920 else 160 end;
  else
    v_credits_to_grant := 0;
  end if;

  -- Caso o plano seja 'none' ou 'canceled'
  if p_plan_tier = 'none' or p_status = 'canceled' then
    update public.assinaturas
    set status = 'canceled',
        cancel_at_period_end = true,
        updated_at = now()
    where user_id = p_target_user_id;

    insert into public.admin_audit_logs (
      actor_id, actor_email, action, target_type, target_id, details
    ) values (
      v_admin_id, v_admin_email, 'ADMIN_SUBSCRIPTION_CANCELED', 'user', p_target_user_id::text,
      jsonb_build_object(
        'target_email', v_user_email,
        'reason', p_reason,
        'previous_plan', p_plan_tier
      )
    );

    return jsonb_build_object('success', true, 'message', 'Assinatura cancelada com sucesso.');
  end if;

  -- Verificar se já existe uma assinatura para o usuário
  select id into v_sub_id
  from public.assinaturas
  where user_id = p_target_user_id
  order by created_at desc
  limit 1;

  if v_sub_id is not null then
    update public.assinaturas
    set plan_tier = p_plan_tier,
        billing_interval = p_billing_interval,
        status = p_status,
        current_period_start = now(),
        current_period_end = case when p_billing_interval = 'yearly' then now() + interval '1 year' else now() + interval '1 month' end,
        credits_per_interval = v_credits_to_grant,
        cancel_at_period_end = false,
        updated_at = now()
    where id = v_sub_id;
  else
    insert into public.assinaturas (
      user_id,
      studio_id,
      stripe_customer_id,
      stripe_subscription_id,
      plan_tier,
      billing_interval,
      status,
      current_period_start,
      current_period_end,
      credits_per_interval,
      cancel_at_period_end
    ) values (
      p_target_user_id,
      v_studio_id,
      coalesce((select stripe_customer_id from public.stripe_clientes where user_id = p_target_user_id), 'manual_admin_sub'),
      'sub_admin_manual_' || substr(md5(random()::text), 1, 16),
      p_plan_tier,
      p_billing_interval,
      p_status,
      now(),
      case when p_billing_interval = 'yearly' then now() + interval '1 year' else now() + interval '1 month' end,
      v_credits_to_grant,
      false
    )
    returning id into v_sub_id;
  end if;

  -- Se solicitado, injetar créditos imediatamente no estúdio
  if p_grant_credits and v_credits_to_grant > 0 and v_studio_id is not null then
    insert into public.creditos_movimentacoes (
      studio_id,
      amount,
      reason,
      reference_id
    ) values (
      v_studio_id,
      v_credits_to_grant,
      'adjustment',
      v_sub_id::text || '_' || extract(epoch from now())::bigint
    )
    on conflict (reference_id, reason) do nothing;
  end if;

  -- Registrar na trilha de auditoria
  insert into public.admin_audit_logs (
    actor_id, actor_email, action, target_type, target_id, details
  ) values (
    v_admin_id, v_admin_email, 'ADMIN_SUBSCRIPTION_CHANGED', 'user', p_target_user_id::text,
    jsonb_build_object(
      'target_email', v_user_email,
      'new_plan_tier', p_plan_tier,
      'billing_interval', p_billing_interval,
      'credits_granted', case when p_grant_credits then v_credits_to_grant else 0 end,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Plano ' || upper(p_plan_tier) || ' (' || p_billing_interval || ') aplicado com sucesso!',
    'credits_granted', case when p_grant_credits then v_credits_to_grant else 0 end
  );
end;
$$;

grant execute on function public.admin_change_user_subscription(uuid, text, text, text, boolean, text) to authenticated;

commit;
