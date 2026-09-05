import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const [command, filePath] = process.argv.slice(2)
const envLine = readFileSync('.env.local', 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .find(line => line.startsWith('SUPABASE_DB_URL='))

if (!envLine || envLine.length <= 'SUPABASE_DB_URL='.length) {
  throw new Error('SUPABASE_DB_URL não está configurada em .env.local.')
}

// Caracteres reservados na senha precisam estar codificados na URL.
const connectionUrl = envLine
  .slice('SUPABASE_DB_URL='.length)
  .replace(/#(?=[^@]*@)/g, '%23')

const sql = postgres(connectionUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
})

try {
  if (command === 'status') {
    const jobs = await sql`
      select id, studio_id, style, voice, mode, status, provider_task_id, failure_reason, provider_response, created_at, completed_at, callback_received_at
      from public.geracoes
      order by created_at desc
      limit 5
    `
    const faixas = await sql`
      select id, title, subtitle, duration_seconds, audio_url, cover_url, status, created_at
      from public.faixas
      order by created_at desc
      limit 5
    `
    console.log(JSON.stringify({ jobs, faixas }, null, 2))
  } else if (command === 'admins') {
    const admins = await sql`
      select a.user_id, a.role, u.email, a.created_at
      from public.administradores a
      join auth.users u on u.id = a.user_id
      order by a.created_at asc
    `
    console.log(JSON.stringify({ admins }, null, 2))
  } else if (command === 'users') {
    const users = await sql`
      select u.id, u.email, u.created_at, p.display_name, p.avatar_url
      from auth.users u
      left join public.perfis p on p.id = u.id
      order by u.created_at asc
    `
    console.log(JSON.stringify({ users }, null, 2))
  } else if (command === 'inspect') {
    const tables = await sql`
      select schemaname, tablename
      from pg_tables
      where schemaname in ('public', 'private')
      order by schemaname, tablename
    `
    console.log(JSON.stringify({ tables }, null, 2))
  } else if (command === 'counts') {
    const counts = await sql`
      select 'creditos_movimentacoes' as table_name, count(*)::integer as row_count from public.creditos_movimentacoes
      union all select 'estudios', count(*)::integer from public.estudios
      union all select 'faixas', count(*)::integer from public.faixas
      union all select 'geracoes', count(*)::integer from public.geracoes
      union all select 'membros_estudio', count(*)::integer from public.membros_estudio
      union all select 'perfis', count(*)::integer from public.perfis
      order by table_name
    `
    console.log(JSON.stringify({ counts }, null, 2))
  } else if (command === 'verify') {
    const rls = await sql`
      select c.relname as table_name, c.relrowsecurity as rls_enabled
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relname in ('perfis', 'estudios', 'membros_estudio', 'faixas', 'geracoes', 'creditos_movimentacoes', 'estatisticas_faixas')
      order by c.relname
    `
    const policies = await sql`
      select tablename, count(*)::integer as policy_count
      from pg_policies
      where schemaname = 'public'
        and tablename in ('perfis', 'estudios', 'membros_estudio', 'faixas', 'geracoes', 'creditos_movimentacoes', 'estatisticas_faixas')
      group by tablename
      order by tablename
    `
    const views = await sql`
      select table_schema as schema_name, table_name
      from information_schema.views
      where table_schema = 'public'
        and table_name in ('biblioteca_publica')
      order by table_name
    `
    const functions = await sql`
      select routine_schema as schema_name, routine_name, security_type
      from information_schema.routines
      where routine_schema in ('public', 'private')
        and routine_name in ('create_studio', 'start_generation_job', 'handle_new_user', 'is_studio_member', 'is_studio_owner', 'touch_updated_at', 'criar_estatisticas_faixa', 'alternar_curtida_faixa', 'minhas_curtidas_faixas', 'registrar_reproducao_faixa')
      order by routine_schema, routine_name
    `
    console.log(JSON.stringify({ rls, policies, views, functions }, null, 2))
  } else if (command === 'apply' && filePath) {
    const migration = readFileSync(filePath, 'utf8')
    await sql.unsafe(migration, [], { prepare: false })
    console.log(JSON.stringify({ applied: filePath }))
  } else {
    throw new Error('Uso: node scripts/supabase-db.mjs inspect | counts | verify | apply <arquivo.sql>')
  }
} finally {
  await sql.end({ timeout: 5 })
}
