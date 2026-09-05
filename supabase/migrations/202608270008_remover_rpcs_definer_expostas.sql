-- Substitui RPCs SECURITY DEFINER publicas por RLS e gatilhos internos.
begin;

create table public.curtidas_faixas (
  faixa_id uuid not null references public.faixas(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (faixa_id, usuario_id)
);
create table public.reproducoes_faixas (
  faixa_id uuid not null references public.faixas(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reproduzido_em date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (faixa_id, usuario_id, reproduzido_em)
);
alter table public.curtidas_faixas enable row level security;
alter table public.reproducoes_faixas enable row level security;
revoke all on table public.curtidas_faixas, public.reproducoes_faixas from public, anon, authenticated;
grant select, insert, delete on public.curtidas_faixas to authenticated;
grant insert on public.reproducoes_faixas to authenticated;
create policy curtidas_select_proprias on public.curtidas_faixas for select to authenticated using (usuario_id = (select auth.uid()));
create policy curtidas_insert_publicas on public.curtidas_faixas for insert to authenticated with check (usuario_id = (select auth.uid()) and exists (select 1 from public.faixas f where f.id = faixa_id and f.is_public and f.status = 'ready'));
create policy curtidas_delete_proprias on public.curtidas_faixas for delete to authenticated using (usuario_id = (select auth.uid()));
create policy reproducoes_insert_publicas on public.reproducoes_faixas for insert to authenticated with check (usuario_id = (select auth.uid()) and exists (select 1 from public.faixas f where f.id = faixa_id and f.is_public and f.status = 'ready'));

create or replace function private.atualizar_curtidas_estatisticas()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.estatisticas_faixas set curtidas_count = curtidas_count + 1, updated_at = now() where faixa_id = new.faixa_id;
    return new;
  end if;
  update public.estatisticas_faixas set curtidas_count = greatest(curtidas_count - 1, 0), updated_at = now() where faixa_id = old.faixa_id;
  return old;
end; $$;
create or replace function private.atualizar_reproducoes_estatisticas()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.estatisticas_faixas set reproducoes_count = reproducoes_count + 1, updated_at = now() where faixa_id = new.faixa_id;
  return new;
end; $$;
create trigger curtidas_atualizar_estatisticas after insert or delete on public.curtidas_faixas for each row execute function private.atualizar_curtidas_estatisticas();
create trigger reproducoes_atualizar_estatisticas after insert on public.reproducoes_faixas for each row execute function private.atualizar_reproducoes_estatisticas();

create or replace function private.inicializar_estudio()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.membros_estudio (studio_id, user_id, role) values (new.id, new.created_by, 'owner');
  insert into public.creditos_movimentacoes (studio_id, amount, reason) values (new.id, 18, 'initial_grant');
  return new;
end; $$;
create trigger estudios_inicializar after insert on public.estudios for each row execute function private.inicializar_estudio();
grant insert on public.estudios to authenticated;
create policy estudios_insert_proprio on public.estudios for insert to authenticated with check (created_by = (select auth.uid()));

create or replace function private.cobrar_geracao()
returns trigger language plpgsql security definer set search_path = '' as $$
declare saldo integer;
begin
  if new.requested_by <> (select auth.uid()) or not private.is_studio_member(new.studio_id) then raise exception 'Sem acesso ao estudio'; end if;
  if new.status <> 'queued' then raise exception 'Status inicial invalido'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.studio_id::text, 0));
  select coalesce(sum(amount),0) into saldo from public.creditos_movimentacoes where studio_id = new.studio_id;
  if saldo < 2 then raise exception 'Creditos insuficientes'; end if;
  insert into public.creditos_movimentacoes (studio_id, amount, reason, reference_id) values (new.studio_id, -2, 'generation', new.id);
  return new;
end; $$;
create trigger geracoes_cobrar before insert on public.geracoes for each row execute function private.cobrar_geracao();

revoke all on function public.alternar_curtida_faixa(uuid) from public, anon, authenticated;
revoke all on function public.minhas_curtidas_faixas() from public, anon, authenticated;
revoke all on function public.registrar_reproducao_faixa(uuid) from public, anon, authenticated;
revoke all on function public.create_studio(text, text) from public, anon, authenticated;
revoke all on function public.start_generation_job(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function private.atualizar_curtidas_estatisticas() from public, anon, authenticated;
revoke all on function private.atualizar_reproducoes_estatisticas() from public, anon, authenticated;
revoke all on function private.inicializar_estudio() from public, anon, authenticated;
revoke all on function private.cobrar_geracao() from public, anon, authenticated;
commit;
