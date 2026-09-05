-- Migration para garantir publicação e visibilidade de faixas públicas
begin;

-- 1. Atualizar a view biblioteca_publica para exibir todas as faixas públicas prontas da comunidade
drop view if exists public.biblioteca_publica cascade;

create view public.biblioteca_publica
with (security_invoker = true)
as
select
  f.id,
  f.title,
  f.subtitle,
  f.style,
  f.voice,
  f.duration_seconds,
  f.audio_url,
  f.cover_url,
  f.status,
  f.created_at,
  f.is_public,
  coalesce(ef.curtidas_count, 0) as curtidas_count,
  coalesce(ef.reproducoes_count, 0) as reproducoes_count,
  f.studio_id,
  f.created_by,
  exists (
    select 1
    from public.membros_estudio m
    where m.studio_id = f.studio_id
      and m.user_id = (select auth.uid())
  ) as mine
from public.faixas f
left join public.estatisticas_faixas ef on ef.faixa_id = f.id
where f.is_public = true
  and f.status = 'ready';

revoke all on public.biblioteca_publica from public, anon;
grant select on public.biblioteca_publica to authenticated;

comment on view public.biblioteca_publica is 'Feed completo de faixas públicas da comunidade FlowHits.';

-- 2. Atualizar política RLS de UPDATE na tabela faixas para permitir que donos e membros do estúdio atualizem suas faixas
drop policy if exists tracks_update_creator on public.faixas;
drop policy if exists faixas_update_membro_estudio on public.faixas;

create policy faixas_update_membro_estudio
on public.faixas
for update
to authenticated
using (
  created_by = (select auth.uid())
  or private.is_studio_member(studio_id)
  or private.is_studio_owner(studio_id)
)
with check (
  created_by = (select auth.uid())
  or private.is_studio_member(studio_id)
  or private.is_studio_owner(studio_id)
);

-- 3. Criar RPC segura para alternar publicação de faixa
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

  -- Verificar se o usuário é dono ou membro do estúdio
  if not (
    v_faixa.created_by = v_user_id
    or exists (
      select 1 from public.membros_estudio m
      where m.studio_id = v_faixa.studio_id
        and m.user_id = v_user_id
    )
    or exists (
      select 1 from public.estudios e
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

  update public.faixas
  set is_public = v_novo_status,
      updated_at = now()
  where id = p_faixa_id;

  return jsonb_build_object(
    'success', true,
    'faixa_id', p_faixa_id,
    'is_public', v_novo_status,
    'message', case when v_novo_status then 'Faixa publicada na biblioteca.' else 'Faixa removida da biblioteca pública.' end
  );
end;
$$;

revoke all on function public.alternar_publicacao_faixa(uuid, boolean) from public, anon;
grant execute on function public.alternar_publicacao_faixa(uuid, boolean) to authenticated;

commit;
