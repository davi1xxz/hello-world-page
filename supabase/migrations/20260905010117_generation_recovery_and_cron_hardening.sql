begin;

-- `geracoes` stores failure details in `failure_reason`. The previous trigger
-- referenced a non-existent `error_message` column, which rolled back any
-- failed generation update before the refund/notification flow could finish.
create or replace function public.trg_notificar_geracao_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.requested_by is not null then
    if new.status in ('ready', 'completed') and (old.status is null or old.status in ('queued', 'processing')) then
      perform public.criar_notificacao_usuario(
        new.requested_by,
        'generation',
        'Sua faixa está pronta',
        'Sua geração foi concluída e já está disponível no seu estúdio.',
        'success',
        '/studio',
        jsonb_build_object('generation_id', new.id)
      );
    elsif new.status = 'failed' and (old.status is null or old.status in ('queued', 'processing')) then
      perform public.criar_notificacao_usuario(
        new.requested_by,
        'generation',
        '⚠️ Geração não concluída',
        'A geração da sua faixa encontrou uma instabilidade. Seus créditos foram estornados automaticamente.',
        'warning',
        '/studio',
        jsonb_build_object('generation_id', new.id, 'error', new.failure_reason)
      );
    end if;
  end if;
  return new;
end;
$$;

commit;
