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
  const publicTracks = await sql`
    select id, title, is_public, status, created_at, mine, created_by
    from public.biblioteca_publica
    limit 20
  `
  console.log('PUBLIC TRACKS IN VIEW:')
  console.log(JSON.stringify(publicTracks, null, 2))

  const allTracks = await sql`
    select id, title, is_public, status, created_by
    from public.faixas
    limit 20
  `
  console.log('ALL FAIXAS:')
  console.log(JSON.stringify(allTracks, null, 2))
} catch (err) {
  console.error('Error:', err)
} finally {
  await sql.end()
}
