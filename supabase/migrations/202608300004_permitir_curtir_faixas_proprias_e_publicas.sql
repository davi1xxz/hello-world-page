-- Permite aos usuários curtirem/favoritarem faixas públicas e faixas do seu próprio estúdio.

begin;

create or replace function public.alternar_curtida_faixa(target_faixa_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  inserted_like uuid;
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

  perform pg_advisory_xact_lock(hashtextextended(target_faixa_id::text || current_user_id::text, 0));

  insert into private.curtidas_faixas (faixa_id, usuario_id)
  values (target_faixa_id, current_user_id)
  on conflict (faixa_id, usuario_id) do nothing
  returning faixa_id into inserted_like;

  if inserted_like is not null then
    insert into public.estatisticas_faixas (faixa_id, curtidas_count, reproducoes_count, updated_at)
    values (target_faixa_id, 1, 0, now())
    on conflict (faixa_id) do update
    set curtidas_count = public.estatisticas_faixas.curtidas_count + 1, updated_at = now();
    return true;
  end if;

  delete from private.curtidas_faixas
  where faixa_id = target_faixa_id and usuario_id = current_user_id;

  update public.estatisticas_faixas
  set curtidas_count = greatest(curtidas_count - 1, 0), updated_at = now()
  where faixa_id = target_faixa_id;
  return false;
end;
$$;

revoke all on function public.alternar_curtida_faixa(uuid) from public, anon;
grant execute on function public.alternar_curtida_faixa(uuid) to authenticated;

create or replace function public.minhas_curtidas_faixas()
returns table (faixa_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select curtida.faixa_id
  from private.curtidas_faixas curtida
  where curtida.usuario_id = (select auth.uid());
$$;

revoke all on function public.minhas_curtidas_faixas() from public, anon;
grant execute on function public.minhas_curtidas_faixas() to authenticated;

commit;
