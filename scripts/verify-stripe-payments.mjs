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

async function runStripeTests() {
  console.log('--- INICIANDO TESTES DO SISTEMA DE PAGAMENTO E ASSINATURAS STRIPE ---')

  const [testUser] = await sql`
    select u.id, u.email
    from auth.users u
    order by u.created_at asc
    limit 1
  `

  if (!testUser) throw new Error('Nenhum usuario encontrado para o teste.')
  console.log(`[OK] Usuario de teste: ${testUser.email} (${testUser.id})`)

  const [testStudio] = await sql`
    select id, name, created_by
    from public.estudios
    where created_by = ${testUser.id}
    limit 1
  `

  if (!testStudio) throw new Error('Nenhum estudio encontrado para o usuario de teste.')
  console.log(`[OK] Estudio de teste: ${testStudio.name} (${testStudio.id})`)

  // Teste 1: Concessão de Compra Avulsa de Créditos com Idempotência
  console.log('\n[TESTE 1] Testando Compra Avulsa de Creditos com Idempotencia Estrita...')
  await sql`begin`
  try {
    const fakeEventId = `evt_test_topup_${Date.now()}`
    const fakeSessionId = `cs_test_session_${Date.now()}`
    const fakeCustomerId = `cus_test_${Date.now()}`
    const creditsToBuy = 30 // R$ 45,00

    // 1ª Execução
    const [res1] = await sql`
      select public.processar_checkout_stripe_concluido(
        ${fakeEventId},
        ${fakeSessionId},
        ${fakeCustomerId},
        ${testUser.id},
        ${testStudio.id},
        'payment',
        null,
        null,
        ${creditsToBuy},
        null
      ) as data
    `
    console.log('  -> 1ª chamada processada com sucesso:', res1.data)

    // Verificar se o crédito entrou no livro-razão
    const [movement] = await sql`
      select id, amount, reason, reference_id
      from public.creditos_movimentacoes
      where reference_id = ${fakeSessionId}
    `
    if (!movement || movement.amount !== 30) {
      throw new Error('FALHA: O credito avulso nao foi inserido corretamente no livro-razao!')
    }
    console.log('  -> Concessao no livro-razao confirmada (+30 creditos).')

    // 2ª Execução com o MESMO event_id (Teste de Idempotência / Anti-Replay)
    const [res2] = await sql`
      select public.processar_checkout_stripe_concluido(
        ${fakeEventId},
        ${fakeSessionId},
        ${fakeCustomerId},
        ${testUser.id},
        ${testStudio.id},
        'payment',
        null,
        null,
        ${creditsToBuy},
        null
      ) as data
    `
    console.log('  -> 2ª chamada (duplicada) retornou mensagem de idempotencia:', res2.data)

    const movementsCount = await sql`
      select count(*)::int as count
      from public.creditos_movimentacoes
      where reference_id = ${fakeSessionId}
    `
    if (movementsCount[0].count !== 1) {
      throw new Error('FALHA DE IDEMPOTENCIA: O evento duplicado gerou creditos repetidos!')
    }
    console.log('  -> Idempotencia validada com sucesso: exatamente 1 movimentacao persistida.')
  } finally {
    await sql`rollback`
  }

  // Teste 2: Criação e Renovação de Assinatura Recorrente (Plano Plus Anual)
  console.log('\n[TESTE 2] Testando Criacao e Renovacao Recorrente de Assinatura (Plano Plus)...')
  await sql`begin`
  try {
    const fakeSubEventId = `evt_sub_created_${Date.now()}`
    const fakeSubSessionId = `cs_sub_session_${Date.now()}`
    const fakeSubId = `sub_stripe_${Date.now()}`
    const fakeCustId = `cus_stripe_${Date.now()}`

    // 1. Criar Assinatura Inicial (Plus Anual = 720 créditos)
    const [subCreateRes] = await sql`
      select public.processar_checkout_stripe_concluido(
        ${fakeSubEventId},
        ${fakeSubSessionId},
        ${fakeCustId},
        ${testUser.id},
        ${testStudio.id},
        'subscription',
        'plus',
        'yearly',
        720,
        ${fakeSubId}
      ) as data
    `
    console.log('  -> Assinatura inicial criada:', subCreateRes.data)

    // Verificar registro na tabela public.assinaturas
    const [savedSub] = await sql`
      select id, plan_tier, billing_interval, credits_per_interval, status
      from public.assinaturas
      where stripe_subscription_id = ${fakeSubId}
    `
    if (!savedSub || savedSub.plan_tier !== 'plus' || savedSub.status !== 'active') {
      throw new Error('FALHA: A assinatura nao foi persistida corretamente na tabela!')
    }
    console.log('  -> Assinatura persistida com sucesso:', savedSub)

    // 2. Simular Renovação de Ciclo (Fatura Paga / invoice.paid)
    const fakeInvoiceEventId = `evt_invoice_paid_${Date.now()}`
    const fakeInvoiceId = `in_stripe_${Date.now()}`

    const [renewalRes] = await sql`
      select public.processar_renovacao_assinatura_stripe(
        ${fakeInvoiceEventId},
        ${fakeInvoiceId},
        ${fakeSubId},
        ${fakeCustId},
        'subscription_cycle'
      ) as data
    `
    console.log('  -> Renovacao de fatura processada:', renewalRes.data)

    const [renewalMovement] = await sql`
      select id, amount, reason, reference_id
      from public.creditos_movimentacoes
      where reference_id = ${fakeInvoiceId}
    `
    if (!renewalMovement || renewalMovement.amount !== 720) {
      throw new Error('FALHA: Os creditos da renovacao nao foram concedidos!')
    }
    console.log('  -> Creditos da renovacao concedidos com sucesso (+720 creditos).')

    // 3. Simular Atualização de Status / Cancelamento
    const fakeCancelEventId = `evt_cancel_${Date.now()}`
    const [cancelRes] = await sql`
      select public.processar_atualizacao_status_assinatura_stripe(
        ${fakeCancelEventId},
        ${fakeSubId},
        'canceled',
        now(),
        now() + interval '1 month',
        true
      ) as data
    `
    console.log('  -> Status de cancelamento atualizado:', cancelRes.data)

    const [canceledSub] = await sql`
      select status, cancel_at_period_end
      from public.assinaturas
      where stripe_subscription_id = ${fakeSubId}
    `
    if (canceledSub.status !== 'canceled' || !canceledSub.cancel_at_period_end) {
      throw new Error('FALHA: O status de cancelamento nao foi refletido na assinatura!')
    }
    console.log('  -> Cancelamento gravado com sucesso.')
  } finally {
    await sql`rollback`
  }

  // Teste 3: Painel Admin - Listagem de Assinaturas e Cálculo de MRR
  console.log('\n[TESTE 3] Testando Listagem de Assinaturas e MRR para o Painel Admin...')
  await sql`begin`
  try {
    const adminUsers = await sql`
      select u.id, u.email
      from auth.users u
      join public.administradores a on a.user_id = u.id
      limit 1
    `

    if (adminUsers.length > 0) {
      const admin = adminUsers[0]
      await sql`set local role authenticated`
      await sql`
        select
          set_config('request.jwt.claim.sub', ${admin.id}::text, true),
          set_config('request.jwt.claim.role', 'authenticated', true),
          set_config('request.jwt.claims', ${JSON.stringify({ sub: admin.id, role: 'authenticated' })}, true)
      `

      const [adminSubs] = await sql`select public.admin_list_subscriptions(null, '', 10, 0) as data`
      console.log('  -> Metricas de faturamento e assinaturas recuperadas:', {
        total_assinaturas: adminSubs.data.total,
        mrr_estimado: adminSubs.data.mrr,
      })
    }
  } finally {
    await sql`rollback`
  }

  console.log('\n========================================================================')
  console.log(' TODOS OS TESTES DE PAGAMENTO E ASSINATURAS STRIPE PASSARAM COM SUCESSO! ')
  console.log('========================================================================')
}

try {
  await runStripeTests()
} catch (error) {
  console.error('\n[ERRO NO TESTE STRIPE]:', error)
  process.exitCode = 1
} finally {
  await sql.end()
}
