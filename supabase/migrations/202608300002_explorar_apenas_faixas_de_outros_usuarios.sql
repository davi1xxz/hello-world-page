-- A área Explorar não deve repetir as faixas de estúdios do próprio usuário.

begin;

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
  false as mine
from public.faixas f
left join public.estatisticas_faixas ef on ef.faixa_id = f.id
where f.is_public = true
  and f.status = 'ready'
  and not exists (
    select 1
    from public.membros_estudio m
    where m.studio_id = f.studio_id
      and m.user_id = (select auth.uid())
  );

revoke all on public.biblioteca_publica from public, anon;
grant select on public.biblioteca_publica to authenticated;

comment on view public.biblioteca_publica is
  'Faixas públicas de estúdios dos quais o usuário atual não é membro.';

commit;
