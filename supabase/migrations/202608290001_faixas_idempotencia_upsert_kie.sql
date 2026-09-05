-- Permite ao PostgREST resolver ON CONFLICT para callbacks/polling da KIE.
-- Colunas nulas continuam aceitando multiplas linhas segundo a semantica UNIQUE do Postgres.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.faixas
  add constraint faixas_generation_job_provider_item_unique
  unique (generation_job_id, provider_item_id);

comment on constraint faixas_generation_job_provider_item_unique on public.faixas is
  'Garante idempotencia de callbacks e reconciliacoes da KIE por job e item do provedor.';

commit;
