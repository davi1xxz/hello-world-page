-- Evita duplicar faixas quando a KIE reenviar o callback final de uma geração.
-- Migração aditiva; não altera nem remove registros existentes.

begin;

create unique index if not exists faixas_geracao_item_unico_idx
  on public.faixas (generation_job_id, provider_item_id)
  where generation_job_id is not null and provider_item_id is not null;

comment on index public.faixas_geracao_item_unico_idx is
  'Garante processamento idempotente do callback final da KIE por item de áudio.';

commit;
