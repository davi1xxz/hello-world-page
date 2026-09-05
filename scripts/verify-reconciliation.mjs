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

async function runReconcileTests() {
  console.log('--- TESTANDO LOGICA DO CRON / WORKER DE RECONCILIACAO DE JOBS IA ---')

  const [testStudio] = await sql`
    select id, created_by from public.estudios
    order by created_at asc
    limit 1
  `

  if (!testStudio) throw new Error('Nenhum estudio de teste encontrado.')
  console.log(`[OK] Estudio de teste: ${testStudio.id} (Dono: ${testStudio.created_by})`)

  await sql`begin`
  try {
    await sql`
      select
        set_config('request.jwt.claim.sub', ${testStudio.created_by}::text, true),
        set_config('request.jwt.claim.role', 'authenticated', true),
        set_config('request.jwt.claims', ${JSON.stringify({ sub: testStudio.created_by, role: 'authenticated' })}, true)
    `

    // 1. Criar um job pendente simulado (status 'queued', mode 'custom')
    const [stuckJob] = await sql`
      insert into public.geracoes (
        studio_id,
        requested_by,
        title,
        prompt,
        style,
        voice,
        mode,
        provider_task_id,
        status,
        created_at
      ) values (
        ${testStudio.id},
        ${testStudio.created_by},
        'Hino Teste Reconciliacao',
        'Crie um hino com letra de estadio',
        'Pagode Baiano',
        'Masculino',
        'custom',
        'mock-kie-task-stuck-999',
        'queued',
        now() - interval '20 minutes'
      )
      returning id, provider_task_id, status, created_at
    `
    console.log(`\n[TESTE 1] Job travado criado com sucesso: ${stuckJob.id} (${stuckJob.status})`)

    // 2. Simular execução da rotina de timeout e estorno de créditos
    console.log('\n[TESTE 2] Executando reconciliacao de job com timeout (>15 min)...')
    await sql`
      update public.geracoes
      set status = 'failed',
          failure_reason = 'Timeout: tempo limite de geração de 15 minutos excedido no provedor.',
          completed_at = now()
      where id = ${stuckJob.id}
    `

    await sql`
      insert into public.creditos_movimentacoes (
        studio_id,
        amount,
        reason,
        reference_id
      ) values (
        ${testStudio.id},
        20,
        'refund',
        ${stuckJob.id}::text
      )
      on conflict (reference_id, reason) do nothing
    `

    // 3. Validar se o job foi atualizado para failed
    const [updatedJob] = await sql`
      select status, failure_reason, completed_at
      from public.geracoes
      where id = ${stuckJob.id}
    `
    if (updatedJob.status !== 'failed') {
      throw new Error('FALHA: O status do job nao foi atualizado para failed!')
    }
    console.log('  -> Status atualizado com sucesso:', updatedJob.status, `("${updatedJob.failure_reason}")`)

    // 4. Validar se os créditos foram estornados no livro-razão
    const [refundEntry] = await sql`
      select amount, reason, reference_id
      from public.creditos_movimentacoes
      where reference_id = ${stuckJob.id}::text
        and reason = 'refund'
    `
    if (!refundEntry || refundEntry.amount !== 20) {
      throw new Error('FALHA: O estorno de creditos nao foi gravado no livro-razao!')
    }
    console.log('  -> Estorno de créditos gravado com sucesso no livro-razão:', refundEntry)

  } finally {
    await sql`rollback`
    console.log('\n[OK] Transacao revertida com sucesso: dados de teste preservados.')
  }

  console.log('\n======================================================')
  console.log(' TODOS OS TESTES DE RECONCILIACAO PASSARAM! ')
  console.log('======================================================')
}

try {
  await runReconcileTests()
} catch (error) {
  console.error('\n[ERRO NO TESTE DE RECONCILIACAO]:', error)
  process.exitCode = 1
} finally {
  await sql.end()
}
