# Project Instructions

- For any Supabase, Postgres, RLS, database migration, Edge Function database access, or Supabase Security/Performance Advisor task, read and follow the Supabase skill before taking action:
  - `C:\Users\Davix\.codex\.tmp\plugins\plugins\supabase\skills\supabase\SKILL.md`
  - `C:\Users\Davix\.codex\.tmp\plugins\plugins\supabase\skills\supabase-postgres-best-practices\SKILL.md`
- State which Supabase skill files were read before editing migrations or applying database changes.
- Use `npx supabase migration new <name>` for new migrations. Do not invent migration filenames manually.
- Run Supabase verification after database changes, preferably `npx supabase db advisors --linked --type all --level warn --fail-on none` plus a targeted SQL check when relevant.
