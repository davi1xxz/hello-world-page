-- Uma unica politica permissiva de leitura evita avaliacao duplicada de RLS.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

drop policy tracks_select_member on public.faixas;
drop policy faixas_select_publicas on public.faixas;

create policy faixas_select_membro_ou_publicas
on public.faixas
for select
to authenticated
using (
  private.is_studio_member(studio_id)
  or (is_public = true and status = 'ready')
);

commit;
