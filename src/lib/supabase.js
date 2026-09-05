import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('A configuração pública do Supabase está incompleta.')
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

const secureRpcNames = new Set([
  'reativar_minha_conta',
  'minhas_curtidas_faixas',
  'is_current_user_admin',
  'alternar_publicacao_faixa',
  'alternar_curtida_faixa',
  'get_minhas_notificacoes',
  'marcar_notificacao_lida',
  'marcar_todas_notificacoes_lidas',
  'obter_minha_assinatura',
  'excluir_minha_conta',
  'registrar_reproducao_faixa',
  'get_public_system_settings',
  'admin_get_overview_metrics',
  'admin_get_advanced_analytics',
  'admin_get_system_settings',
  'admin_get_ip_security_overview',
  'admin_list_users',
  'admin_list_all_tracks',
  'admin_list_generations',
  'admin_list_credits_ledger',
  'admin_get_audit_logs',
  'admin_list_subscriptions',
  'admin_adjust_credits',
  'admin_toggle_user_admin',
  'admin_update_user_name',
  'admin_toggle_user_ban',
  'admin_moderate_track',
  'admin_delete_track',
  'admin_retry_generation',
  'admin_update_system_setting',
  'admin_toggle_block_ip',
  'admin_reset_rate_limit',
  'admin_change_user_subscription',
  'admin_send_broadcast_notification',
])

const directRpc = supabase.rpc.bind(supabase)

supabase.rpc = async (fn, args = {}, options) => {
  if (!secureRpcNames.has(fn)) {
    return directRpc(fn, args, options)
  }

  const { data, error } = await supabase.functions.invoke('secure-rpc', {
    body: { fn, args },
  })

  if (error) return { data: null, error }
  if (data?.error) return { data: null, error: data }
  return { data: data?.data ?? null, error: null }
}
