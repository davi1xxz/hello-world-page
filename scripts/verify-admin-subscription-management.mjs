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

async function run() {
  console.log('--- INICIANDO TESTES DE MRR NO OVERVIEW E TROCA DE ASSINATURAS VIA ADMIN ---')
  const sql = postgres(databaseUrl, { idle_timeout: 5, max: 1 })

  try {
    // 1. Identificar admin e usuário comum
    const [adminUser] = await sql`
      select u.id, u.email
      from auth.users u
      join public.administradores a on a.user_id = u.id
      limit 1
    `
    if (!adminUser) throw new Error('Nenhum admin encontrado no banco.')
    console.log(`[OK] Admin identificado: ${adminUser.email} (${adminUser.id})`)

    let [normalUser] = await sql`
      select u.id, u.email
      from auth.users u
      where u.id <> ${adminUser.id}
      limit 1
    `
    if (!normalUser) {
      normalUser = adminUser
    }
    console.log(`[OK] Usuário de teste: ${normalUser.email} (${normalUser.id})`)

    await sql.begin(async (tx) => {
      // Configurar contexto de admin autenticado
      await tx`set local role authenticated`
      await tx`
        select
          set_config('request.jwt.claim.sub', ${adminUser.id}::text, true),
          set_config('request.jwt.claim.role', 'authenticated', true),
          set_config('request.jwt.claims', ${JSON.stringify({ sub: adminUser.id, role: 'authenticated' })}, true)
      `

      // 2. Testar admin_get_overview_metrics como admin
      console.log('\n[TESTE 1] Testando admin_get_overview_metrics()...')
      const [metricsRes] = await tx`
        select public.admin_get_overview_metrics() as metrics
      `
      const metrics = metricsRes.metrics
      console.log('  -> MRR Estimado no overview:', metrics.mrr_estimado)
      console.log('  -> Total de Assinantes Ativos:', metrics.total_active_subscribers)
      if (typeof metrics.mrr_estimado !== 'number' || typeof metrics.total_active_subscribers !== 'number') {
        throw new Error('Métricas de MRR ausentes!')
      }
      console.log('  [OK] Métricas de MRR retornadas com sucesso no overview!')

      // 3. Testar troca de assinatura para 'plus' mensal com injeção de créditos
      console.log('\n[TESTE 2] Testando admin_change_user_subscription (Atribuindo Plano PLUS)...')
      const [changeRes] = await tx`
        select public.admin_change_user_subscription(
          ${normalUser.id}::uuid,
          'plus',
          'monthly',
          'active',
          true,
          'Teste automatizado de troca de plano pelo admin'
        ) as result
      `
      const res = changeRes.result
      console.log('  -> Resposta:', res)
      if (!res.success) throw new Error('Falha ao aplicar plano!')
      console.log('  [OK] Plano PLUS e créditos aplicados com sucesso!')

      // 4. Verificar listagem de usuários com a nova assinatura
      console.log('\n[TESTE 3] Verificando listagem de usuários admin_list_users()...')
      const [usersListRes] = await tx`
        select public.admin_list_users('', 20, 0) as result
      `
      const usersList = usersListRes.result
      const targetInList = usersList.users.find((u) => u.id === normalUser.id)
      console.log('  -> Usuário na listagem:', targetInList?.display_name, '| Assinatura:', targetInList?.active_subscription)
      if (targetInList?.active_subscription?.plan_tier !== 'plus') {
        throw new Error('Assinatura do usuário não refletiu na listagem!')
      }
      console.log('  [OK] Assinatura refletida na tabela de usuários!')

      // 5. Verificar log de auditoria
      console.log('\n[TESTE 4] Verificando log imutável de auditoria...')
      const [auditLog] = await tx`
        select * from public.admin_audit_logs
        where action = 'ADMIN_SUBSCRIPTION_CHANGED'
          and target_id = ${normalUser.id}
        order by created_at desc
        limit 1
      `
      if (!auditLog) throw new Error('Log de auditoria não encontrado!')
      console.log('  -> Log de auditoria registrado:', auditLog.action, '| Detalhes:', auditLog.details)
      console.log('  [OK] Auditoria imutável gravada com sucesso!')
    })

    console.log('\n========================================================================')
    console.log(' TODOS OS TESTES DE MRR E GESTÃO DE ASSINATURAS PASSARAM COM SUCESSO! ')
    console.log('========================================================================')
  } finally {
    await sql.end()
  }
}

run().catch((err) => {
  console.error('[ERRO NO TESTE]', err)
  process.exit(1)
})
