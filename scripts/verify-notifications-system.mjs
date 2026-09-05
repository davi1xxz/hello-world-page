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
    const password = value.slice(passwordStart + 1, credentialsEnd)
    return `${value.slice(0, passwordStart + 1)}${encodeURIComponent(password)}${value.slice(credentialsEnd)}`
  }
}

const DATABASE_URL = normalizeDatabaseUrl(process.env.SUPABASE_DB_URL || readLocalDatabaseUrl())
const sql = postgres(DATABASE_URL, { max: 1 })

async function run() {
  console.log('--- INICIANDO TESTES DO SISTEMA DE NOTIFICAÇÕES REAIS ---')
  let transactionOpen = false

  try {
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
    if (!normalUser) normalUser = adminUser
    console.log(`[OK] Usuário normal identificado: ${normalUser.email} (${normalUser.id})`)

    // Do not persist test broadcasts, credits, or read-state changes.
    await sql`begin`
    transactionOpen = true
    const tx = sql
      // 1. Contexto Admin: Enviar notificação Broadcast
      console.log('\n[TESTE 1] Testando envio de broadcast pelo Admin...')
      await tx`set local role authenticated`
      await tx`
        select
          set_config('request.jwt.claim.sub', ${adminUser.id}::text, true),
          set_config('request.jwt.claim.role', 'authenticated', true),
          set_config('request.jwt.claims', ${JSON.stringify({ sub: adminUser.id, role: 'authenticated' })}, true)
      `

      const [broadcastRes] = await tx`
        select public.admin_send_broadcast_notification(
          '🔥 Lançamento Oficial FlowHits 2.0',
          'Todos os usuários ganharam novas opções de modelos e velocidade turbo!',
          'announcement',
          '/studio'
        ) as res
      `
      const res = broadcastRes.res
      console.log('  -> Resposta:', res)
      if (!res.success) throw new Error('Falha ao enviar broadcast!')
      console.log('  [OK] Broadcast enviado com sucesso pelo admin!')

      // 2. Contexto Usuário Normal: Ler notificações e verificar se o broadcast aparece
      console.log('\n[TESTE 2] Testando get_minhas_notificacoes() como usuário normal...')
      await tx`
        select
          set_config('request.jwt.claim.sub', ${normalUser.id}::text, true),
          set_config('request.jwt.claim.role', 'authenticated', true),
          set_config('request.jwt.claims', ${JSON.stringify({ sub: normalUser.id, role: 'authenticated' })}, true)
      `

      const [userNotifsRes] = await tx`
        select public.get_minhas_notificacoes(20) as notifs
      `
      const notifs = userNotifsRes.notifs
      console.log(`  -> Total de notificações recebidas pelo usuário: ${notifs.length}`)
      const foundBroadcast = notifs.find((n) => n.id === res.notification_id)
      if (!foundBroadcast) throw new Error('Broadcast não apareceu para o usuário!')
      console.log('  -> Notificação encontrada:', foundBroadcast.titulo, '| Lida:', foundBroadcast.lida)
      if (foundBroadcast.lida !== false) throw new Error('Broadcast deveria começar como não lida!')
      console.log('  [OK] Notificação broadcast entregue como não-lida com sucesso!')

      // 3. Testar marcar como lida
      console.log('\n[TESTE 3] Testando marcar_notificacao_lida()...')
      await tx`
        select public.marcar_notificacao_lida(${res.notification_id}::uuid)
      `
      const [afterReadRes] = await tx`
        select public.get_minhas_notificacoes(20) as notifs
      `
      const afterNotif = afterReadRes.notifs.find((n) => n.id === res.notification_id)
      if (!afterNotif || afterNotif.lida !== true) throw new Error('Notificação não foi marcada como lida!')
      console.log('  -> Status após leitura:', afterNotif.lida)
      console.log('  [OK] Status de leitura atualizado corretamente!')

      // 4. Testar trigger automático de créditos/compras
      console.log('\n[TESTE 4] Testando trigger automático de compras/créditos...')
      const [studio] = await tx`
        select id from public.estudios where created_by = ${normalUser.id} limit 1
      `
      if (studio) {
        // Simular webhook inserindo crédito como superusuário/service_role
        await tx`set local role postgres`
        await tx`
          insert into public.creditos_movimentacoes (
            studio_id,
            amount,
            reason,
            reference_id
          ) values (
            ${studio.id},
            30,
            'purchase',
            'test_purchase_' || extract(epoch from now())::bigint
          )
        `

        // Voltar ao contexto do usuário comum para ler suas notificações
        await tx`set local role authenticated`
        await tx`
          select
            set_config('request.jwt.claim.sub', ${normalUser.id}::text, true),
            set_config('request.jwt.claim.role', 'authenticated', true),
            set_config('request.jwt.claims', ${JSON.stringify({ sub: normalUser.id, role: 'authenticated' })}, true)
        `

        const [purchaseNotifsRes] = await tx`
          select public.get_minhas_notificacoes(20) as notifs
        `
        const purchaseNotif = purchaseNotifsRes.notifs.find((n) => n.tipo === 'credit_purchase')
        if (!purchaseNotif) throw new Error('Trigger de compra de crédito não gerou notificação!')
        console.log('  -> Notificação de compra gerada:', purchaseNotif.titulo, '| Mensagem:', purchaseNotif.mensagem)
        console.log('  [OK] Trigger de recarga de créditos gerou notificação automática com sucesso!')
      }

      // 5. Testar marcar todas como lidas
      console.log('\n[TESTE 5] Testando marcar_todas_notificacoes_lidas()...')
      await tx`
        select public.marcar_todas_notificacoes_lidas()
      `
      const [allReadRes] = await tx`
        select public.get_minhas_notificacoes(20) as notifs
      `
      const unreadRemaining = allReadRes.notifs.filter((n) => !n.lida).length
      console.log(`  -> Notificações não lidas restantes: ${unreadRemaining}`)
      if (unreadRemaining > 0) throw new Error('Ainda restam notificações não lidas!')
      console.log('  [OK] Todas as notificações foram marcadas como lidas!')
    await sql`rollback`
    transactionOpen = false

    console.log('\n========================================================================')
    console.log(' TODOS OS TESTES DO SISTEMA DE NOTIFICAÇÕES PASSARAM COM SUCESSO! ')
    console.log('========================================================================')
  } catch (err) {
    if (transactionOpen) await sql`rollback`.catch(() => undefined)
    console.error('\n[ERRO NO TESTE]', err)
    process.exitCode = 1
  } finally {
    await sql.end()
  }
}

run()
