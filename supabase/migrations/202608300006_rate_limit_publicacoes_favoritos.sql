-- Rate limit e limite maximo para publicacoes e favoritos.
-- Publicar/favoritar consome limite. Despublicar/desfavoritar nao consome.

begin;

create or replace function private.validar_limite_publicacao_faixa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_rate_limit jsonb;
  v_publicadas_count integer;
begin
  if v_user_id is null or coalesce(new.is_public, false) = coalesce(old.is_public, false) then
    return new;
  end if;

  if not new.is_public then
    return new;
  end if;

  if private.is_admin(v_user_id) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('publish:' || v_user_id::text, 0));

  select count(*)::int
  into v_publicadas_count
  from public.faixas f
  where f.is_public = true
    and f.id <> new.id
    and (
      f.created_by = v_user_id
      or exists (
        select 1
        from public.membros_estudio m
        where m.studio_id = f.studio_id
          and m.user_id = v_user_id
      )
      or exists (
        select 1
        from public.estudios e
        where e.id = f.studio_id
          and e.created_by = v_user_id
      )
    );

  if v_publicadas_count >= 99 then
    raise exception 'Limite de 99 faixas publicadas atingido. Remova uma publicacao antes de publicar outra.';
  end if;

  if current_setting('flowhits.publicacao_rpc_validada', true) is distinct from 'true' then
    v_rate_limit := public.verificar_e_consumir_rate_limit(
      'rl:track_publish:' || v_user_id::text,
      12,
      60
    );

    if not (v_rate_limit ->> 'allowed')::boolean then
      raise exception 'Muitas alteracoes de publicacao. Aguarde % segundos antes de tentar novamente.',
        (v_rate_limit ->> 'reset_seconds')::int;
    end if;

    v_rate_limit := public.verificar_e_consumir_rate_limit(
      'rl:track_publish_daily:' || v_user_id::text,
      99,
      86400
    );

    if not (v_rate_limit ->> 'allowed')::boolean then
      raise exception 'Limite de 99 publicacoes em 24 horas atingido. Aguarde % segundos antes de tentar novamente.',
        (v_rate_limit ->> 'reset_seconds')::int;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_limite_publicacao_faixa on public.faixas;
create trigger trg_validar_limite_publicacao_faixa
before update of is_public on public.faixas
for each row
execute function private.validar_limite_publicacao_faixa();

create or replace function public.alternar_publicacao_faixa(
  p_faixa_id uuid,
  p_is_public boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_faixa record;
  v_novo_status boolean;
  v_rate_limit jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select f.id, f.studio_id, f.created_by, f.is_public, f.status
  into v_faixa
  from public.faixas f
  where f.id = p_faixa_id;

  if not found then
    raise exception 'Faixa nao encontrada.';
  end if;

  if not (
    v_faixa.created_by = v_user_id
    or exists (
      select 1
      from public.membros_estudio m
      where m.studio_id = v_faixa.studio_id
        and m.user_id = v_user_id
    )
    or exists (
      select 1
      from public.estudios e
      where e.id = v_faixa.studio_id
        and e.created_by = v_user_id
    )
  ) then
    raise exception 'Permissao negada. Voce nao pode alterar esta faixa.';
  end if;

  if p_is_public is not null then
    v_novo_status := p_is_public;
  else
    v_novo_status := not v_faixa.is_public;
  end if;

  if v_novo_status = v_faixa.is_public then
    return jsonb_build_object(
      'success', true,
      'faixa_id', p_faixa_id,
      'is_public', v_novo_status,
      'message', case when v_novo_status then 'Faixa ja esta publicada.' else 'Faixa ja esta privada.' end
    );
  end if;

  if v_novo_status then
    perform pg_advisory_xact_lock(hashtextextended('publish:' || v_user_id::text, 0));

    v_rate_limit := public.verificar_e_consumir_rate_limit(
      'rl:track_publish:' || v_user_id::text,
      12,
      60
    );

    if not (v_rate_limit ->> 'allowed')::boolean then
      raise exception 'Muitas alteracoes de publicacao. Aguarde % segundos antes de tentar novamente.',
        (v_rate_limit ->> 'reset_seconds')::int;
    end if;

    v_rate_limit := public.verificar_e_consumir_rate_limit(
      'rl:track_publish_daily:' || v_user_id::text,
      99,
      86400
    );

    if not (v_rate_limit ->> 'allowed')::boolean then
      raise exception 'Limite de 99 publicacoes em 24 horas atingido. Aguarde % segundos antes de tentar novamente.',
        (v_rate_limit ->> 'reset_seconds')::int;
    end if;

    perform set_config('flowhits.publicacao_rpc_validada', 'true', true);
  end if;

  update public.faixas
  set is_public = v_novo_status,
      updated_at = now()
  where id = p_faixa_id;

  return jsonb_build_object(
    'success', true,
    'faixa_id', p_faixa_id,
    'is_public', v_novo_status,
    'message', case when v_novo_status then 'Faixa publicada na biblioteca.' else 'Faixa removida da biblioteca publica.' end
  );
end;
$$;

revoke all on function public.alternar_publicacao_faixa(uuid, boolean) from public, anon;
grant execute on function public.alternar_publicacao_faixa(uuid, boolean) to authenticated;

create or replace function public.alternar_curtida_faixa(target_faixa_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  inserted_like uuid;
  favorites_count integer;
  rate_limit jsonb;
begin
  if current_user_id is null then
    raise exception 'Autenticacao obrigatoria';
  end if;

  if not exists (
    select 1
    from public.faixas faixa
    where faixa.id = target_faixa_id
      and (
        (faixa.is_public = true and faixa.status = 'ready')
        or (private.is_studio_member(faixa.studio_id) and faixa.status = 'ready')
      )
  ) then
    raise exception 'Faixa indisponivel para curtida';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('favorite:' || current_user_id::text, 0));

  if not exists (
    select 1
    from private.curtidas_faixas curtida
    where curtida.faixa_id = target_faixa_id
      and curtida.usuario_id = current_user_id
  ) then
    select count(*)::int
    into favorites_count
    from private.curtidas_faixas curtida
    where curtida.usuario_id = current_user_id;

    if favorites_count >= 99 then
      raise exception 'Limite de 99 faixas favoritas atingido. Remova uma favorita antes de adicionar outra.';
    end if;

    rate_limit := public.verificar_e_consumir_rate_limit(
      'rl:track_favorite:' || current_user_id::text,
      30,
      60
    );

    if not (rate_limit ->> 'allowed')::boolean then
      raise exception 'Muitas alteracoes de favoritos. Aguarde % segundos antes de tentar novamente.',
        (rate_limit ->> 'reset_seconds')::int;
    end if;

    rate_limit := public.verificar_e_consumir_rate_limit(
      'rl:track_favorite_daily:' || current_user_id::text,
      99,
      86400
    );

    if not (rate_limit ->> 'allowed')::boolean then
      raise exception 'Limite de 99 favoritos em 24 horas atingido. Aguarde % segundos antes de tentar novamente.',
        (rate_limit ->> 'reset_seconds')::int;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_faixa_id::text || current_user_id::text, 0));

  insert into private.curtidas_faixas (faixa_id, usuario_id)
  values (target_faixa_id, current_user_id)
  on conflict (faixa_id, usuario_id) do nothing
  returning faixa_id into inserted_like;

  if inserted_like is not null then
    insert into public.estatisticas_faixas (faixa_id, curtidas_count, reproducoes_count, updated_at)
    values (target_faixa_id, 1, 0, now())
    on conflict (faixa_id) do update
    set curtidas_count = public.estatisticas_faixas.curtidas_count + 1,
        updated_at = now();
    return true;
  end if;

  delete from private.curtidas_faixas
  where faixa_id = target_faixa_id
    and usuario_id = current_user_id;

  update public.estatisticas_faixas
  set curtidas_count = greatest(curtidas_count - 1, 0),
      updated_at = now()
  where faixa_id = target_faixa_id;

  return false;
end;
$$;

revoke all on function public.alternar_curtida_faixa(uuid) from public, anon;
grant execute on function public.alternar_curtida_faixa(uuid) to authenticated;

-- O app usa a RPC acima; impedir escrita direta evita bypass de limite/rate limit.
revoke insert, delete on table public.curtidas_faixas from authenticated;

commit;
