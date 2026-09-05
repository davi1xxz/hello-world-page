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

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 15 })

async function runDeletionTests() {
  console.log('--- TESTANDO LOGICA DE EXCLUSAO DE CONTA E LGPD ---')

  const [testUser] = await sql`
    select id, email from auth.users
    order by created_at asc
    limit 1
  `

  if (!testUser) throw new Error('Nenhum usuario encontrado.')
  console.log(`[OK] Usuario de teste: ${testUser.email} (${testUser.id})`)

  // Teste 1: Tentativa com confirmação errada (Deve Falhar)
  console.log('\n[TESTE 1] Tentativa de exclusao com confirmacao incorreta...')
  await sql`begin`
  try {
    await sql`set local role authenticated`
    await sql`
      select
        set_config('request.jwt.claim.sub', ${testUser.id}::text, true),
        set_config('request.jwt.claim.role', 'authenticated', true),
        set_config('request.jwt.claims', ${JSON.stringify({ sub: testUser.id, role: 'authenticated' })}, true)
    `

    let failedWrongConfirm = false
    try {
      await sql`select public.excluir_minha_conta('ERRADO', 'Motivo teste')`
    } catch (err) {
      failedWrongConfirm = true
      console.log('  -> Bloqueado com sucesso:', err.message)
    }
    if (!failedWrongConfirm) {
      throw new Error('FALHA: A exclusao foi aceita com confirmacao errada!')
    }
  } finally {
    await sql`rollback`
  }

  // Teste 2: Tentativa com confirmação correta 'EXCLUIR' (Deve Passar)
  console.log('\n[TESTE 2] Exclusao com confirmacao correta "EXCLUIR"...')
  await sql`begin`
  try {
    await sql`set local role authenticated`
    await sql`
      select
        set_config('request.jwt.claim.sub', ${testUser.id}::text, true),
        set_config('request.jwt.claim.role', 'authenticated', true),
        set_config('request.jwt.claims', ${JSON.stringify({ sub: testUser.id, role: 'authenticated' })}, true)
    `

    const [res] = await sql`select public.excluir_minha_conta('EXCLUIR', 'Teste automatizado de encerramento') as data`
    console.log('  -> Resultado da exclusao:', res.data)

    // Teste 3: Verificar log de auditoria
    const [auditLog] = await sql`
      select action, actor_id, details
      from public.admin_audit_logs
      where action = 'USER_ACCOUNT_DELETED'
        and actor_id = ${testUser.id}
      order by created_at desc
      limit 1
    `
    if (!auditLog) {
      throw new Error('FALHA: O log de auditoria da exclusao de conta nao foi gravado!')
    }
    console.log('  -> Log de auditoria confirmado com sucesso:', auditLog.details)

    // Teste 4: Verificar se perfil foi anonimizado
    const [perfil] = await sql`
      select display_name, is_banned, banned_reason
      from public.perfis
      where id = ${testUser.id}
    `
    if (perfil.display_name !== 'Conta Excluída' || !perfil.is_banned) {
      throw new Error('FALHA: O perfil nao foi anonimizado!')
    }
    console.log('  -> Perfil anonimizado e desativado com sucesso.')
  } finally {
    await sql`rollback`
    console.log('\n[OK] Transacao revertida com sucesso: dados de teste preservados intactos.')
  }

  console.log('\n======================================================')
  console.log(' TODOS OS TESTES DE EXCLUSAO DE CONTA PASSARAM! ')
  console.log('======================================================')
}

try {
  await runDeletionTests()
} catch (error) {
  console.error('\n[ERRO NO TESTE DE EXCLUSAO]:', error)
  process.exitCode = 1
} finally {
  await sql.end()
}
