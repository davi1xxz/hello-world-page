-- Adicionar índice único para idempotência no livro-razão de créditos

begin;

-- Adicionar índice único condicional para evitar duplicidade de compras e reembolsos
create unique index if not exists creditos_movimentacoes_ref_reason_idx
  on public.creditos_movimentacoes (reference_id, reason)
  where reference_id is not null;

commit;
