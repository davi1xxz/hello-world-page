import postgres from 'postgres'
import { readFileSync } from 'node:fs'

const readLocalDatabaseUrl = () => {
  const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.startsWith('SUPABASE_DB_URL='))
  if (!line) return ''

  const value = line.slice(line.indexOf('=') + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

const normalizeDatabaseUrl = (value) => {
  try {
    new URL(value)
    return value
  } catch {
    const schemeEnd = value.indexOf('://')
    const passwordStart = value.indexOf(':', schemeEnd + 3)
    const credentialsEnd = value.lastIndexOf('@')
    if (schemeEnd < 0 || passwordStart < 0 || credentialsEnd < passwordStart) return value
    return `${value.slice(0, passwordStart + 1)}${encodeURIComponent(value.slice(passwordStart + 1, credentialsEnd))}${value.slice(credentialsEnd)}`
  }
}

const databaseUrl = normalizeDatabaseUrl(process.env.FLOWHITS_TEST_DB_URL || readLocalDatabaseUrl())

if (!databaseUrl) {
  throw new Error('Defina SUPABASE_DB_URL para executar esta verificacao.')
}

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 })
let transactionStarted = false

try {
  const users = await sql`select id from auth.users order by created_at asc limit 1`
  if (!users.length) throw new Error('Nenhum usuario disponivel para testar as politicas RLS.')

  const userId = users[0].id
  await sql`begin`
  transactionStarted = true
  await sql`set local role authenticated`
  await sql`
    select
      set_config('request.jwt.claim.sub', ${userId}::text, true),
      set_config('request.jwt.claim.role', 'authenticated', true),
      set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)
  `

  const [authContext] = await sql`select auth.uid() as user_id, current_user as database_role`
  if (authContext.user_id !== userId || authContext.database_role !== 'authenticated') {
    throw new Error('A simulacao do JWT autenticado nao foi aplicada corretamente.')
  }

  const slug = `teste-rls-${Date.now().toString(36)}`
  await sql`
    insert into public.estudios (name, slug)
    values ('Teste RLS descartavel', ${slug})
  `
  const [studio] = await sql`
    select id, created_by
    from public.estudios
    where slug = ${slug}
  `
  const [membership] = await sql`
    select count(*)::int as total
    from public.membros_estudio
    where studio_id = ${studio.id}
      and user_id = ${userId}
      and role = 'owner'
  `
  const [visibleStudio] = await sql`
    select count(*)::int as total
    from public.estudios
    where id = ${studio.id}
  `

  if (studio.created_by !== userId) throw new Error('created_by nao corresponde ao usuario autenticado.')
  if (membership.total !== 1) throw new Error('O membro owner nao foi criado pelo gatilho.')
  if (visibleStudio.total !== 1) throw new Error('O estudio criado nao ficou visivel ao proprietario.')

  await sql`rollback`
  transactionStarted = false
  console.log('RLS_OK: criacao, propriedade, membro e leitura validados; transacao revertida.')
} catch (error) {
  if (transactionStarted) {
    try {
      await sql`rollback`
    } catch {
      // A conexao sera encerrada logo abaixo.
    }
  }
  console.error(`RLS_FALHOU: ${error.code || ''} ${error.message}`.trim())
  process.exitCode = 1
} finally {
  await sql.end()
}
