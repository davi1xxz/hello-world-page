begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The URL and shared secret are created in Supabase Vault during deployment;
-- neither value is kept in this migration or in the client bundle.
select cron.unschedule(jobid)
from cron.job
where jobname = 'flowhits-reconcile-stuck-jobs';

select cron.schedule(
  'flowhits-reconcile-stuck-jobs',
  '*/2 * * * *',
  $schedule$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'flowhits_project_url') || '/functions/v1/reconcile-stuck-jobs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'flowhits_reconcile_cron_secret')
      ),
      body := '{}'::jsonb
    );
  $schedule$
);

commit;
