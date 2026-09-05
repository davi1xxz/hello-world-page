begin;

do $$
begin
  if to_regclass('public.profiles') is not null and to_regclass('public.perfis') is null then
    alter table public.profiles rename to perfis;
  end if;

  if to_regclass('public.studios') is not null and to_regclass('public.estudios') is null then
    alter table public.studios rename to estudios;
  end if;

  if to_regclass('public.studio_members') is not null and to_regclass('public.membros_estudio') is null then
    alter table public.studio_members rename to membros_estudio;
  end if;

  if to_regclass('public.tracks') is not null and to_regclass('public.faixas') is null then
    alter table public.tracks rename to faixas;
  end if;

  if to_regclass('public.generation_jobs') is not null and to_regclass('public.geracoes') is null then
    alter table public.generation_jobs rename to geracoes;
  end if;

  if to_regclass('public.credit_ledger') is not null and to_regclass('public.creditos_movimentacoes') is null then
    alter table public.credit_ledger rename to creditos_movimentacoes;
  end if;
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
    from public.membros_estudio member
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
    from public.membros_estudio member
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
  insert into public.perfis (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Novo usuario')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop function if exists public.create_studio(text, text);
create function public.create_studio(studio_name text, studio_slug text)
returns public.estudios
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_studio public.estudios;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticacao obrigatoria';
  end if;

  if studio_name is null or char_length(trim(studio_name)) not between 2 and 80 then
    raise exception 'Nome do estudio invalido';
  end if;

  if studio_slug is null or studio_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(studio_slug) not between 2 and 80 then
    raise exception 'Slug do estudio invalido';
  end if;

  insert into public.estudios (name, slug, created_by)
  values (trim(studio_name), studio_slug, (select auth.uid()))
  returning * into new_studio;

  insert into public.membros_estudio (studio_id, user_id, role)
  values (new_studio.id, (select auth.uid()), 'owner');

  insert into public.creditos_movimentacoes (studio_id, amount, reason)
  values (new_studio.id, 18, 'initial_grant');

  return new_studio;
end;
$$;

drop function if exists public.start_generation_job(uuid, text, text, text, text, text);
create function public.start_generation_job(
  target_studio_id uuid,
  input_prompt text,
  input_lyrics text,
  input_style text,
  input_voice text,
  input_mode text
)
returns public.geracoes
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.geracoes;
  available_credits integer;
begin
  if (select auth.uid()) is null then raise exception 'Autenticacao obrigatoria'; end if;
  if not private.is_studio_member(target_studio_id) then raise exception 'Sem acesso ao estudio'; end if;
  if input_mode not in ('simple', 'custom') then raise exception 'Modo invalido'; end if;
  if input_voice is not null and input_voice not in ('Masculino', 'Feminino') then raise exception 'Vocal invalido'; end if;
  if char_length(trim(coalesce(input_style, ''))) not between 1 and 60 then raise exception 'Estilo invalido'; end if;
  if char_length(coalesce(input_prompt, '')) = 0 and char_length(coalesce(input_lyrics, '')) = 0 then raise exception 'Prompt ou letra obrigatorios'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target_studio_id::text, 0));
  select coalesce(sum(amount), 0) into available_credits from public.creditos_movimentacoes where studio_id = target_studio_id;
  if available_credits < 2 then raise exception 'Creditos insuficientes'; end if;

  insert into public.geracoes (studio_id, requested_by, prompt, lyrics, style, voice, mode, status)
  values (target_studio_id, (select auth.uid()), nullif(input_prompt, ''), nullif(input_lyrics, ''), trim(input_style), input_voice, input_mode, 'queued')
  returning * into job;

  insert into public.creditos_movimentacoes (studio_id, amount, reason, reference_id)
  values (target_studio_id, -2, 'generation', job.id);

  return job;
end;
$$;

revoke all on function private.is_studio_member(uuid) from public, anon, authenticated;
revoke all on function private.is_studio_owner(uuid) from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function public.create_studio(text, text) from public, anon;
revoke all on function public.start_generation_job(uuid, text, text, text, text, text) from public, anon;

grant execute on function public.create_studio(text, text) to authenticated;
grant execute on function public.start_generation_job(uuid, text, text, text, text, text) to authenticated;

comment on table public.perfis is 'Perfis dos usuarios sincronizados com Supabase Auth.';
comment on table public.estudios is 'Estudios de criacao do FlowHits.';
comment on table public.membros_estudio is 'Usuarios membros de cada estudio.';
comment on table public.faixas is 'Faixas musicais criadas ou importadas no estudio.';
comment on table public.geracoes is 'Jobs de geracao musical enviados para provedores externos.';
comment on table public.creditos_movimentacoes is 'Livro de movimentacoes de creditos por estudio.';

commit;
