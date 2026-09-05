begin;

-- Estas funcoes sao chamadas pelas politicas RLS de estudios e dados associados.
-- O schema private nao e exposto pela Data API; o grant permite apenas a avaliacao
-- das politicas para usuarios autenticados.
grant usage on schema private to authenticated;
grant execute on function private.is_studio_member(uuid) to authenticated;
grant execute on function private.is_studio_owner(uuid) to authenticated;

commit;
