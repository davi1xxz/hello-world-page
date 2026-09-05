begin;

alter table public.generation_jobs
  add column if not exists provider_response jsonb not null default '{}'::jsonb;

alter table public.tracks
  add column if not exists generation_job_id uuid references public.generation_jobs(id) on delete set null,
  add column if not exists provider_item_id text,
  add column if not exists audio_url text,
  add column if not exists cover_url text;

create unique index if not exists credit_ledger_reference_reason_idx
  on public.credit_ledger (reference_id, reason)
  where reference_id is not null;

create index if not exists tracks_generation_job_id_idx
  on public.tracks (generation_job_id);

create index if not exists generation_jobs_provider_task_id_idx
  on public.generation_jobs (provider_task_id)
  where provider_task_id is not null;

comment on column public.tracks.audio_url is 'External provider audio URL. Keep provider retention limits in mind.';
comment on column public.tracks.cover_url is 'External provider cover/artwork URL.';
comment on column public.generation_jobs.provider_response is 'Redacted provider metadata only. Never store API keys or auth headers.';

commit;
