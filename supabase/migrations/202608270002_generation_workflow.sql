-- Reserva créditos e cria um job de geração de modo atômico.
begin;

alter table public.generation_jobs
  add column if not exists provider text not null default 'kie',
  add column if not exists provider_task_id text unique,
  add column if not exists callback_received_at timestamptz;

create or replace function public.start_generation_job(
  target_studio_id uuid,
  input_prompt text,
  input_lyrics text,
  input_style text,
  input_voice text,
  input_mode text
)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.generation_jobs;
  available_credits integer;
begin
  if (select auth.uid()) is null then raise exception 'Autenticação obrigatória'; end if;
  if not private.is_studio_member(target_studio_id) then raise exception 'Sem acesso ao estúdio'; end if;
  if input_mode not in ('simple', 'custom') then raise exception 'Modo inválido'; end if;
  if input_voice is not null and input_voice not in ('Masculino', 'Feminino') then raise exception 'Vocal inválido'; end if;
  if char_length(trim(coalesce(input_style, ''))) not between 1 and 60 then raise exception 'Estilo inválido'; end if;
  if char_length(coalesce(input_prompt, '')) = 0 and char_length(coalesce(input_lyrics, '')) = 0 then raise exception 'Prompt ou letra obrigatórios'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target_studio_id::text, 0));
  select coalesce(sum(amount), 0) into available_credits from public.credit_ledger where studio_id = target_studio_id;
  if available_credits < 2 then raise exception 'Créditos insuficientes'; end if;

  insert into public.generation_jobs (studio_id, requested_by, prompt, lyrics, style, voice, mode, status)
  values (target_studio_id, (select auth.uid()), nullif(input_prompt, ''), nullif(input_lyrics, ''), trim(input_style), input_voice, input_mode, 'queued')
  returning * into job;

  insert into public.credit_ledger (studio_id, amount, reason, reference_id)
  values (target_studio_id, -2, 'generation', job.id);
  return job;
end;
$$;

revoke all on function public.start_generation_job(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.start_generation_job(uuid, text, text, text, text, text) to authenticated;

commit;
