-- Execute somente em ambiente local/preview, dentro de uma transacao revertida.
begin;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'geracoes'
      and column_name = 'title'
      and data_type = 'text'
  ) then
    raise exception 'public.geracoes.title ausente ou com tipo incorreto';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.geracoes'::regclass
      and conname = 'geracoes_title_length_check'
  ) then
    raise exception 'constraint geracoes_title_length_check ausente';
  end if;
end
$$;

rollback;
