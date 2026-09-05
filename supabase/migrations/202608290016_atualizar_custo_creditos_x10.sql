-- 202608290016_atualizar_custo_creditos_x10.sql
-- Atualiza o modelo de cobrança para 10 créditos por música (20 créditos por geração de 2 faixas)
-- Multiplica as cotas de planos e pacotes por 10x

-- 1. Atualizar trigger de cobrança de geração de música para 20 créditos
create or replace function private.cobrar_geracao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  saldo integer;
begin
  if new.requested_by <> (select auth.uid()) or not private.is_studio_member(new.studio_id) then
    raise exception 'Sem acesso ao estúdio';
  end if;

  if new.status <> 'queued' then
    raise exception 'Status inicial inválido';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.studio_id::text, 0));
  
  select coalesce(sum(amount), 0) into saldo
  from public.creditos_movimentacoes
  where studio_id = new.studio_id;

  if saldo < 20 then
    raise exception 'Créditos insuficientes (necessário 20 créditos para 2 músicas)';
  end if;

  insert into public.creditos_movimentacoes (studio_id, amount, reason, reference_id)
  values (new.studio_id, -20, 'generation', new.id);

  return new;
end;
$$;

-- 2. Atualizar admin_change_user_subscription com multiplicador de 10x nos créditos
create or replace function public.admin_change_user_subscription(
  p_target_user_id uuid,
  p_plan_tier text,
  p_billing_interval text default 'monthly',
  p_status text default 'active',
  p_grant_credits boolean default true,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_admin_email text;
  v_user_email text;
  v_studio_id uuid;
  v_sub_id uuid;
  v_credits_to_grant int := 0;
begin
  if not private.is_admin() then
    raise exception 'Acesso negado: privilégios de administrador necessários';
  end if;

  v_admin_id := auth.uid();
  select email into v_admin_email from auth.users where id = v_admin_id;
  select email into v_user_email from auth.users where id = p_target_user_id;

  if v_user_email is null then
    raise exception 'Usuário destino não encontrado';
  end if;

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

  -- Calcular créditos do plano (10x multiplicador oficial)
  if p_plan_tier = 'lite' then
    v_credits_to_grant := case when p_billing_interval = 'yearly' then 2400 else 200 end;
  elsif p_plan_tier = 'plus' then
    v_credits_to_grant := case when p_billing_interval = 'yearly' then 7200 else 600 end;
  elsif p_plan_tier = 'pro' then
    v_credits_to_grant := case when p_billing_interval = 'yearly' then 19200 else 1600 end;
  else
    v_credits_to_grant := 0;
  end if;

  if p_plan_tier = 'none' or p_status = 'canceled' then
    update public.assinaturas
    set status = 'canceled',
        cancel_at_period_end = true,
        updated_at = now()
    where user_id = p_target_user_id;

    insert into public.logs_auditoria_admin (
      admin_id, action, target_type, target_id, metadata
    ) values (
      v_admin_id, 'subscription.cancel', 'user', p_target_user_id::text,
      jsonb_build_object(
        'target_email', v_user_email,
        'reason', p_reason,
        'previous_plan', p_plan_tier
      )
    );

    return jsonb_build_object('success', true, 'message', 'Assinatura cancelada com sucesso.');
  end if;

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
      'admin_granted_' || substr(md5(random()::text), 1, 12),
      'sub_admin_' || substr(md5(random()::text), 1, 16),
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

  if p_grant_credits and v_credits_to_grant > 0 then
    insert into public.creditos_movimentacoes (
      studio_id,
      amount,
      reason,
      reference_id
    ) values (
      v_studio_id,
      v_credits_to_grant,
      'admin_adjustment',
      'manual_sub_grant_' || substr(md5(random()::text), 1, 12)
    );
  end if;

  insert into public.logs_auditoria_admin (
    admin_id, action, target_type, target_id, metadata
  ) values (
    v_admin_id, 'subscription.update', 'user', p_target_user_id::text,
    jsonb_build_object(
      'target_email', v_user_email,
      'plan_tier', p_plan_tier,
      'billing_interval', p_billing_interval,
      'status', p_status,
      'credits_granted', case when p_grant_credits then v_credits_to_grant else 0 end,
      'reason', coalesce(p_reason, 'Atualização administrativa de plano')
    )
  );

  return jsonb_build_object(
    'success', true,
    'plan_tier', p_plan_tier,
    'billing_interval', p_billing_interval,
    'status', p_status,
    'credits_granted', case when p_grant_credits then v_credits_to_grant else 0 end
  );
end;
$$;
