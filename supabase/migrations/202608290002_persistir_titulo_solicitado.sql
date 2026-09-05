begin;

alter table public.geracoes
  add column title text;

alter table public.geracoes
  add constraint geracoes_title_length_check
  check (title is null or char_length(title) between 1 and 80);

comment on column public.geracoes.title is
  'Nome escolhido pelo usuario no modo personalizado; prevalece sobre o titulo retornado pelo provedor.';

commit;
