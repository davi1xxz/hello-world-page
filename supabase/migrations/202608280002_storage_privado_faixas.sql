-- Midias de faixas ficam privadas; o cliente recebe somente URLs assinadas.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('midias-faixas', 'midias-faixas', false, 52428800, array['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy midias_faixas_select_membro_ou_publica
on storage.objects
for select
to authenticated
using (
  bucket_id = 'midias-faixas'
  and exists (
    select 1
    from public.faixas faixa
    where (faixa.audio_path = name or faixa.cover_path = name)
      and (private.is_studio_member(faixa.studio_id) or (faixa.is_public = true and faixa.status = 'ready'))
  )
);

create or replace view public.biblioteca_publica
with (security_invoker = true)
as
select
  faixa.id, faixa.title, faixa.subtitle, faixa.style, faixa.voice,
  faixa.duration_seconds, faixa.audio_url, faixa.cover_url,
  faixa.status, faixa.created_at,
  coalesce(estatisticas.curtidas_count, 0) as curtidas_count,
  coalesce(estatisticas.reproducoes_count, 0) as reproducoes_count,
  faixa.audio_path, faixa.cover_path
from public.faixas faixa
left join public.estatisticas_faixas estatisticas on estatisticas.faixa_id = faixa.id
where faixa.is_public = true and faixa.status = 'ready';

commit;
