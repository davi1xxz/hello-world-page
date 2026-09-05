-- Corrige permissões ausentes no remoto para as RPCs de curtidas.

begin;

revoke all on function public.minhas_curtidas_faixas() from public, anon;
revoke all on function public.alternar_curtida_faixa(uuid) from public, anon;
grant execute on function public.minhas_curtidas_faixas() to authenticated;
grant execute on function public.alternar_curtida_faixa(uuid) to authenticated;

commit;
