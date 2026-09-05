-- Grants para permitir avaliação de RLS por usuários autenticados
begin;

grant select on public.administradores to authenticated;
grant select on public.admin_audit_logs to authenticated;

commit;
