begin;

create index if not exists faixas_publicas_created_at_idx
  on public.faixas (is_public, created_at desc)
  where is_public = true and status = 'ready';

drop policy if exists faixas_select_publicas on public.faixas;
create policy faixas_select_publicas
on public.faixas
for select
to authenticated
using (is_public = true and status = 'ready');

create or replace view public.biblioteca_publica
with (security_invoker = true)
as
select
  id,
  title,
  subtitle,
  style,
  voice,
  duration_seconds,
  audio_url,
  cover_url,
  status,
  created_at
from public.faixas
where is_public = true
  and status = 'ready';

revoke all on public.biblioteca_publica from public, anon, authenticated;
grant select on public.biblioteca_publica to authenticated;

comment on view public.biblioteca_publica is 'Feed de faixas publicadas pelos usuarios. Exponha apenas campos seguros para outros usuarios autenticados.';

commit;
