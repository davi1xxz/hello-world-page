begin;

-- Uma faixa conta no máximo uma vez para cada usuário, independentemente do dia.
with reproducoes_duplicadas as (
  select
    ctid,
    row_number() over (
      partition by faixa_id, usuario_id
      order by reproduzido_em asc, created_at asc, ctid asc
    ) as posicao
  from private.reproducoes_faixas
)
delete from private.reproducoes_faixas reproducao
using reproducoes_duplicadas duplicada
where reproducao.ctid = duplicada.ctid
  and duplicada.posicao > 1;

alter table private.reproducoes_faixas
  drop constraint reproducoes_faixas_pkey,
  add primary key (faixa_id, usuario_id);

create or replace function public.registrar_reproducao_faixa(target_faixa_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  inserted_play uuid;
  total_plays integer;
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
        or private.is_studio_member(faixa.studio_id)
      )
  ) then
    raise exception 'Faixa indisponivel';
  end if;

  insert into private.reproducoes_faixas (faixa_id, usuario_id)
  values (target_faixa_id, current_user_id)
  on conflict (faixa_id, usuario_id) do nothing
  returning faixa_id into inserted_play;

  if inserted_play is not null then
    update public.estatisticas_faixas
    set reproducoes_count = reproducoes_count + 1,
        updated_at = now()
    where faixa_id = target_faixa_id
    returning reproducoes_count into total_plays;
  else
    select reproducoes_count into total_plays
    from public.estatisticas_faixas
    where faixa_id = target_faixa_id;
  end if;

  return coalesce(total_plays, 0);
end;
$$;

-- Recalcula os agregados após eliminar possíveis repetições históricas.
update public.estatisticas_faixas estatistica
set reproducoes_count = coalesce((
      select count(*)::integer
      from private.reproducoes_faixas reproducao
      where reproducao.faixa_id = estatistica.faixa_id
    ), 0),
    updated_at = now()
where estatistica.reproducoes_count is distinct from coalesce((
      select count(*)::integer
      from private.reproducoes_faixas reproducao
      where reproducao.faixa_id = estatistica.faixa_id
    ), 0);

revoke all on function public.registrar_reproducao_faixa(uuid) from public, anon;
grant execute on function public.registrar_reproducao_faixa(uuid) to authenticated;

commit;
