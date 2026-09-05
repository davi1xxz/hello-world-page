-- FlowHits: autenticação, estúdios, faixas, jobs de geração e créditos.
-- Migração inicial aditiva. Não remove nem altera dados existentes.

begin;

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
revoke all on schema public from anon;

alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Novo usuário' check (char_length(display_name) between 1 and 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.studios (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_members (
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (studio_id, user_id)
);

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  subtitle text,
  style text not null check (char_length(style) between 1 and 60),
  voice text check (voice in ('Masculino', 'Feminino')),
  lyrics text,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 3600),
  audio_path text,
  cover_path text,
  status text not null default 'draft' check (status in ('draft', 'processing', 'ready', 'failed')),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  prompt text,
  lyrics text,
  style text not null check (char_length(style) between 1 and 60),
  voice text check (voice in ('Masculino', 'Feminino')),
  mode text not null check (mode in ('simple', 'custom')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  failure_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (coalesce(char_length(prompt), 0) > 0 or coalesce(char_length(lyrics), 0) > 0)
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  amount integer not null check (amount <> 0 and amount between -100000 and 100000),
  reason text not null check (reason in ('initial_grant', 'purchase', 'generation', 'adjustment', 'refund')),
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists tracks_studio_created_at_idx on public.tracks (studio_id, created_at desc);
create index if not exists generation_jobs_studio_created_at_idx on public.generation_jobs (studio_id, created_at desc);
create index if not exists credit_ledger_studio_created_at_idx on public.credit_ledger (studio_id, created_at desc);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.is_studio_member(target_studio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.studio_members member
    where member.studio_id = target_studio_id
      and member.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_studio_owner(target_studio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.studio_members member
    where member.studio_id = target_studio_id
      and member.user_id = (select auth.uid())
      and member.role = 'owner'
  );
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Novo usuário')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.create_studio(studio_name text, studio_slug text)
returns public.studios
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_studio public.studios;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação obrigatória';
  end if;

  if studio_name is null or char_length(trim(studio_name)) not between 2 and 80 then
    raise exception 'Nome do estúdio inválido';
  end if;

  if studio_slug is null or studio_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(studio_slug) not between 2 and 80 then
    raise exception 'Slug do estúdio inválido';
  end if;

  insert into public.studios (name, slug, created_by)
  values (trim(studio_name), studio_slug, (select auth.uid()))
  returning * into new_studio;

  insert into public.studio_members (studio_id, user_id, role)
  values (new_studio.id, (select auth.uid()), 'owner');

  insert into public.credit_ledger (studio_id, amount, reason)
  values (new_studio.id, 18, 'initial_grant');

  return new_studio;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_updated_at();

drop trigger if exists studios_touch_updated_at on public.studios;
create trigger studios_touch_updated_at
before update on public.studios
for each row execute function private.touch_updated_at();

drop trigger if exists tracks_touch_updated_at on public.tracks;
create trigger tracks_touch_updated_at
before update on public.tracks
for each row execute function private.touch_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.studios enable row level security;
alter table public.studio_members enable row level security;
alter table public.tracks enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.credit_ledger enable row level security;

revoke all on table public.profiles, public.studios, public.studio_members, public.tracks, public.generation_jobs, public.credit_ledger from public, anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, update, delete on public.studios to authenticated;
grant select on public.studio_members to authenticated;
grant select, insert, update, delete on public.tracks to authenticated;
grant select, insert on public.generation_jobs to authenticated;
grant select on public.credit_ledger to authenticated;
grant execute on function public.create_studio(text, text) to authenticated;

create policy profiles_select_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy studios_select_member on public.studios for select to authenticated using (private.is_studio_member(id));
create policy studios_update_owner on public.studios for update to authenticated using (private.is_studio_owner(id)) with check (private.is_studio_owner(id));
create policy studios_delete_owner on public.studios for delete to authenticated using (private.is_studio_owner(id));

create policy studio_members_select_member on public.studio_members for select to authenticated using (private.is_studio_member(studio_id));

create policy tracks_select_member on public.tracks for select to authenticated using (private.is_studio_member(studio_id));
create policy tracks_insert_member on public.tracks for insert to authenticated with check (created_by = (select auth.uid()) and private.is_studio_member(studio_id));
create policy tracks_update_creator on public.tracks for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()) and private.is_studio_member(studio_id));
create policy tracks_delete_creator on public.tracks for delete to authenticated using (created_by = (select auth.uid()));

create policy generation_jobs_select_member on public.generation_jobs for select to authenticated using (private.is_studio_member(studio_id));
create policy generation_jobs_insert_member on public.generation_jobs for insert to authenticated with check (requested_by = (select auth.uid()) and private.is_studio_member(studio_id));

create policy credit_ledger_select_member on public.credit_ledger for select to authenticated using (private.is_studio_member(studio_id));

comment on table public.profiles is 'Perfil mínimo sincronizado a partir do Supabase Auth.';
comment on table public.studios is 'Espaço de trabalho/torcida que agrupa faixas, gerações e créditos.';
comment on table public.credit_ledger is 'Livro razão de créditos. Somente operações confiáveis devem inserir linhas.';

revoke all on function private.touch_updated_at() from public, anon, authenticated;
revoke all on function private.is_studio_member(uuid) from public, anon, authenticated;
revoke all on function private.is_studio_owner(uuid) from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function public.create_studio(text, text) from public, anon;

commit;
