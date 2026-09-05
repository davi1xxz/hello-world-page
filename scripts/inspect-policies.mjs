import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const envLine = readFileSync('.env.local', 'utf8')
  .split(/\r?\n/)
  .map(l => l.trim())
  .find(l => l.startsWith('SUPABASE_DB_URL='))

const connectionUrl = envLine
  .slice('SUPABASE_DB_URL='.length)
  .replace(/#(?=[^@]*@)/g, '%23')

const sql = postgres(connectionUrl)

try {
  const sample = await sql`
    select id, title, studio_id, created_by, is_public, status
    from public.faixas
    order by created_at desc
    limit 10
  `
  console.log('SAMPLE FAIXAS:')
  console.log(JSON.stringify(sample, null, 2))

  const members = await sql`
    select studio_id, user_id, role
    from public.membros_estudio
    limit 10
  `
  console.log('MEMBROS ESTUDIO:')
  console.log(JSON.stringify(members, null, 2))

  const studios = await sql`
    select id, created_by
    from public.estudios
    limit 10
  `
  console.log('ESTUDIOS:')
  console.log(JSON.stringify(studios, null, 2))
} catch (err) {
  console.error('Error:', err)
} finally {
  await sql.end()
}
