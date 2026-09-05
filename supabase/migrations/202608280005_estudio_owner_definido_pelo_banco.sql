begin;

-- O proprietario deve vir exclusivamente do JWT validado pelo Postgres.
-- Isso evita divergencia entre o usuario enviado pelo navegador e auth.uid().
alter table public.estudios
  alter column created_by set default auth.uid();

comment on column public.estudios.created_by is
  'Usuario proprietario definido pelo JWT autenticado via auth.uid().';

commit;
