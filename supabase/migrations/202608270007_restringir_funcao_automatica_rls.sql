-- A funcao e usada somente pelo event trigger do banco e nao deve ser uma RPC publica.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;
grant execute on function public.rls_auto_enable() to postgres;

commit;
