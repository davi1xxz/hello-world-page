-- Interacoes da biblioteca: somente agregados sao expostos publicamente.
-- Curtidas e reproducoes individuais ficam no schema private e nunca sao lidas pelo cliente.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table public.estatisticas_faixas (
  faixa_id uuid primary key references public.faixas(id) on delete cascade,
  curtidas_count integer not null default 0 check (curtidas_count >= 0),
  reproducoes_count integer not null default 0 check (reproducoes_count >= 0),
  updated_at timestamptz not null default now()
);

create table private.curtidas_faixas (
  faixa_id uuid not null references public.faixas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (faixa_id, usuario_id)
);

create table private.reproducoes_faixas (
  faixa_id uuid not null references public.faixas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  reproduzido_em date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (faixa_id, usuario_id, reproduzido_em)
);

alter table public.estatisticas_faixas enable row level security;
alter table private.curtidas_faixas enable row level security;
alter table private.reproducoes_faixas enable row level security;

revoke all on table public.estatisticas_faixas from public, anon, authenticated;
revoke all on table private.curtidas_faixas from public, anon, authenticated;
revoke all on table private.reproducoes_faixas from public, anon, authenticated;

grant select on table public.estatisticas_faixas to authenticated;

create policy estatisticas_faixas_select_authenticated
on public.estatisticas_faixas
for select
to authenticated
using (true);

create or replace function private.criar_estatisticas_faixa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.estatisticas_faixas (faixa_id)
  values (new.id)
  on conflict (faixa_id) do nothing;
  return new;
end;
$$;

drop trigger if exists faixas_criar_estatisticas on public.faixas;
create trigger faixas_criar_estatisticas
after insert on public.faixas
for each row execute function private.criar_estatisticas_faixa();

insert into public.estatisticas_faixas (faixa_id)
select id from public.faixas
on conflict (faixa_id) do nothing;

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
      and faixa.is_public = true
      and faixa.status = 'ready'
  ) then
    raise exception 'Faixa publica indisponivel';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_faixa_id::text || current_user_id::text, 0));

  insert into private.curtidas_faixas (faixa_id, usuario_id)
  values (target_faixa_id, current_user_id)
  on conflict (faixa_id, usuario_id) do nothing
  returning faixa_id into inserted_like;

  if inserted_like is not null then
    update public.estatisticas_faixas
    set curtidas_count = curtidas_count + 1, updated_at = now()
    where faixa_id = target_faixa_id;
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
  on conflict (faixa_id, usuario_id, reproduzido_em) do nothing
  returning faixa_id into inserted_play;

  if inserted_play is not null then
    update public.estatisticas_faixas
    set reproducoes_count = reproducoes_count + 1, updated_at = now()
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

revoke all on function private.criar_estatisticas_faixa() from public, anon, authenticated;
revoke all on function public.alternar_curtida_faixa(uuid) from public, anon;
revoke all on function public.minhas_curtidas_faixas() from public, anon;
revoke all on function public.registrar_reproducao_faixa(uuid) from public, anon;

grant execute on function public.alternar_curtida_faixa(uuid) to authenticated;
grant execute on function public.minhas_curtidas_faixas() to authenticated;
grant execute on function public.registrar_reproducao_faixa(uuid) to authenticated;

create or replace view public.biblioteca_publica
with (security_invoker = true)
as
select
  faixa.id,
  faixa.title,
  faixa.subtitle,
  faixa.style,
  faixa.voice,
  faixa.duration_seconds,
  faixa.audio_url,
  faixa.cover_url,
  faixa.status,
  faixa.created_at,
  coalesce(estatisticas.curtidas_count, 0) as curtidas_count,
  coalesce(estatisticas.reproducoes_count, 0) as reproducoes_count
from public.faixas faixa
left join public.estatisticas_faixas estatisticas on estatisticas.faixa_id = faixa.id
where faixa.is_public = true
  and faixa.status = 'ready';

comment on table public.estatisticas_faixas is 'Contadores publicos agregados por faixa; clientes nao podem altera-los.';
comment on table private.curtidas_faixas is 'Curtidas individuais privadas; somente funcoes controladas podem acessa-las.';
comment on table private.reproducoes_faixas is 'Uma reproducao contabilizada por usuario, faixa e dia.';

commit;
