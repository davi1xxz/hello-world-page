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

async function runTests() {
  console.log('--- INICIANDO TESTES DO PAINEL ADMIN, RATE LIMITING E SEGURANCA DE IP ---')

  const adminUsers = await sql`
    select u.id, u.email
    from auth.users u
    join public.administradores a on a.user_id = u.id
    order by u.created_at asc
    limit 1
  `

  if (!adminUsers.length) {
    throw new Error('Nenhum usuario administrador encontrado para os testes.')
  }

  const adminUser = adminUsers[0]
  console.log(`[OK] Administrador identificado: ${adminUser.email} (${adminUser.id})`)

  const nonAdminId = '00000000-0000-0000-0000-000000000099'

  // Teste 1: Usuário NÃO-ADMIN tenta chamar funções de admin
  console.log('\n[TESTE 1] Verificando bloqueio de usuario comum (Nao-Admin)...')
  await sql`begin`
  try {
    await sql`set local role authenticated`
    await sql`
      select
        set_config('request.jwt.claim.sub', ${nonAdminId}::text, true),
        set_config('request.jwt.claim.role', 'authenticated', true),
        set_config('request.jwt.claims', ${JSON.stringify({ sub: nonAdminId, role: 'authenticated' })}, true)
    `

    const [checkIsAdmin] = await sql`select public.is_current_user_admin() as is_admin`
    if (checkIsAdmin.is_admin === true) {
      throw new Error('FALHA DE SEGURANCA: Usuario comum foi identificado como admin!')
    }
    console.log('  -> is_current_user_admin() retornou false corretamente.')

    const auditLogsDirect = await sql`select * from public.admin_audit_logs`
    if (auditLogsDirect.length > 0) {
      throw new Error('FALHA DE SEGURANCA: Usuario comum conseguiu ler logs de auditoria via RLS!')
    }
    console.log('  -> RLS bloqueou leitura direta de admin_audit_logs (0 registros retornados).')

    let blockedMetrics = false
    try {
      await sql`select public.admin_get_overview_metrics()`
    } catch {
      blockedMetrics = true
    }
    if (!blockedMetrics) {
      throw new Error('FALHA DE SEGURANCA: Usuario comum conseguiu invocar admin_get_overview_metrics!')
    }
    console.log('  -> Chamada RPC admin_get_overview_metrics foi bloqueada com erro de acesso negado.')
  } finally {
    await sql`rollback`
  }

  // Teste 2: Limite de 2 Gerações Simultâneas por Estúdio
  console.log('\n[TESTE 2] Testando Limite Estrito de 2 Geracoes Simultaneas por Estudio...')
  await sql`begin`
  try {
    const [studio] = await sql`select id, created_by from public.estudios limit 1`
    if (studio) {
      // Simular autenticação do dono do estúdio
      await sql`set local role authenticated`
      await sql`
        select
          set_config('request.jwt.claim.sub', ${studio.created_by}::text, true),
          set_config('request.jwt.claim.role', 'authenticated', true),
          set_config('request.jwt.claims', ${JSON.stringify({ sub: studio.created_by, role: 'authenticated' })}, true)
      `

      // Inserir 1ª geração ativa
      await sql`
        insert into public.geracoes (studio_id, requested_by, prompt, style, mode, status)
        values (${studio.id}, ${studio.created_by}, 'Job 1', 'Trap', 'simple', 'queued')
      `
      console.log('  -> 1ª geracao criada com sucesso.')

      // Inserir 2ª geração ativa
      await sql`
        insert into public.geracoes (studio_id, requested_by, prompt, style, mode, status)
        values (${studio.id}, ${studio.created_by}, 'Job 2', 'Trap', 'simple', 'queued')
      `
      console.log('  -> 2ª geracao criada com sucesso (limite maximo atingido).')

      // Tentar inserir a 3ª geração ativa (Deve ser BLOQUEADA pelo gatilho)
      let thirdBlocked = false
      try {
        await sql`
          insert into public.geracoes (studio_id, requested_by, prompt, style, mode, status)
          values (${studio.id}, ${studio.created_by}, 'Job 3', 'Trap', 'simple', 'queued')
        `
      } catch (err) {
        thirdBlocked = true
        console.log('  -> 3ª geracao bloqueada com sucesso pelo gatilho de seguranca:', err.message)
      }

      if (!thirdBlocked) {
        throw new Error('FALHA DE SEGURANCA: O sistema permitiu mais de 2 geracoes simultaneas!')
      }
    }
  } finally {
    await sql`rollback`
  }

  // Teste 3: Rate Limiting por IP (Ex: Auth Login - max 5 por min)
  console.log('\n[TESTE 3] Testando Rate Limiting Dinamico e Seguranca de IP...')
  const testIp = `192.168.100.${Math.floor(Math.random() * 200 + 10)}`

  for (let i = 1; i <= 5; i++) {
    const [res] = await sql`select public.registrar_e_validar_acesso_ip(${testIp}, 'auth_login', 'Mozilla/5.0 Test') as data`
    if (!res.data.allowed) {
      throw new Error(`Rate limit bloqueou prematuramente na tentativa ${i}`)
    }
  }
  console.log('  -> 5 tentativas de login consumidas com sucesso.')

  // A 6ª tentativa deve ser BLOQUEADA pelo Rate Limiter
  const [sixthAttempt] = await sql`select public.registrar_e_validar_acesso_ip(${testIp}, 'auth_login', 'Mozilla/5.0 Test') as data`
  if (sixthAttempt.data.allowed !== false || sixthAttempt.data.error !== 'RATE_LIMIT_EXCEEDED') {
    throw new Error('FALHA NO RATE LIMIT: A 6ª tentativa de login nao foi bloqueada!')
  }
  console.log('  -> 6ª tentativa bloqueada por RATE_LIMIT_EXCEEDED com sucesso:', sixthAttempt.data.message)

  // Teste 4: Blacklist de IP
  console.log('\n[TESTE 4] Testando Blacklist de IP e Bloqueio Total...')
  const blacklistedIp = '203.0.113.99'
  await sql`
    insert into public.ips_bloqueados (ip, motivo)
    values (${blacklistedIp}, 'Tentativa de ataque automatizado')
    on conflict (ip) do nothing
  `

  const [blockedIpTest] = await sql`select public.registrar_e_validar_acesso_ip(${blacklistedIp}, 'generation', 'Bot/1.0') as data`
  if (blockedIpTest.data.allowed !== false || blockedIpTest.data.error !== 'IP_BLOQUEADO') {
    throw new Error('FALHA DE BLACKLIST: O IP bloqueado conseguiu executar acoes!')
  }
  console.log('  -> IP na blacklist foi bloqueado instantaneamente:', blockedIpTest.data.message)
  await sql`delete from public.ips_bloqueados where ip = ${blacklistedIp}`

  // Teste 5: Consulta de Segurança de IP no Painel Admin
  console.log('\n[TESTE 5] Testando Visao Geral de Seguranca de IP no Painel Admin...')
  await sql`begin`
  try {
    await sql`set local role authenticated`
    await sql`
      select
        set_config('request.jwt.claim.sub', ${adminUser.id}::text, true),
        set_config('request.jwt.claim.role', 'authenticated', true),
        set_config('request.jwt.claims', ${JSON.stringify({ sub: adminUser.id, role: 'authenticated' })}, true)
    `

    const [ipOverview] = await sql`select public.admin_get_ip_security_overview() as data`
    console.log(`  -> Monitoramento de IP recuperado: ${ipOverview.data.top_ips?.length || 0} IPs registrados, ${ipOverview.data.blocked_ips?.length || 0} bloqueados.`)
  } finally {
    await sql`rollback`
  }

  // Teste 6: Imutabilidade dos Logs de Auditoria
  console.log('\n[TESTE 6] Testando imutabilidade dos logs de auditoria...')
  const [existingLog] = await sql`select id from public.admin_audit_logs limit 1`
  if (existingLog) {
    let updateBlocked = false
    try {
      await sql`update public.admin_audit_logs set action = 'TAMPERED' where id = ${existingLog.id}`
    } catch {
      updateBlocked = true
    }
    if (!updateBlocked) {
      throw new Error('FALHA CRITICA: Log de auditoria foi alterado via UPDATE!')
    }
    console.log('  -> Tentativa de UPDATE bloqueada pelo gatilho de imutabilidade.')

    let deleteBlocked = false
    try {
      await sql`delete from public.admin_audit_logs where id = ${existingLog.id}`
    } catch {
      deleteBlocked = true
    }
    if (!deleteBlocked) {
      throw new Error('FALHA CRITICA: Log de auditoria foi removido via DELETE!')
    }
    console.log('  -> Tentativa de DELETE bloqueada pelo gatilho de imutabilidade.')
  }

  console.log('\n========================================================================')
  console.log(' TODOS OS TESTES DE RATE LIMIT, LIMITE DE IA E SEGURANCA PASSARAM! ')
  console.log('========================================================================')
}

try {
  await runTests()
} catch (error) {
  console.error('\n[ERRO NO TESTE]:', error)
  process.exitCode = 1
} finally {
  await sql.end()
}
