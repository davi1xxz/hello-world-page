-- Alterar reference_id para TEXT em creditos_movimentacoes para suportar identificadores Stripe e UUIDs

begin;

alter table public.creditos_movimentacoes
  alter column reference_id type text using reference_id::text;

commit;
