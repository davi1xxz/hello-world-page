-- Adicionar restrição única incondicional em (reference_id, reason)

begin;

drop index if exists public.creditos_movimentacoes_ref_reason_idx;

alter table public.creditos_movimentacoes
  drop constraint if exists creditos_movimentacoes_ref_reason_key;

alter table public.creditos_movimentacoes
  add constraint creditos_movimentacoes_ref_reason_key unique (reference_id, reason);

commit;
