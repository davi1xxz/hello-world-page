-- 202608290015_admin_alterar_nome_usuario.sql
-- Permite que administradores alterem o nome próprio / display_name de qualquer usuário com log de auditoria

create or replace function public.admin_update_user_name(
  p_target_user_id uuid,
  p_new_name text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_name text;
  v_target_email text;
  v_trimmed_name text;
begin
  -- 1. Validar permissão de admin
  if not private.is_admin() then
    raise exception 'Acesso negado: privilégios de administrador necessários';
  end if;

  v_trimmed_name := trim(p_new_name);

  -- 2. Validar tamanho do nome
  if length(v_trimmed_name) < 2 or length(v_trimmed_name) > 50 then
    raise exception 'O nome deve conter entre 2 e 50 caracteres';
  end if;

  -- 3. Obter dados atuais do usuário
  select email into v_target_email from auth.users where id = p_target_user_id;
  if v_target_email is null then
    raise exception 'Usuário não encontrado';
  end if;

  select display_name into v_old_name from public.perfis where id = p_target_user_id;

  -- 4. Atualizar em public.perfis
  insert into public.perfis (id, display_name)
  values (p_target_user_id, v_trimmed_name)
  on conflict (id) do update set
    display_name = v_trimmed_name;

  -- 5. Atualizar em auth.users raw_user_meta_data
  update auth.users
  set raw_user_meta_data = 
    jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(raw_user_meta_data, '{}'::jsonb),
          '{display_name}',
          to_jsonb(v_trimmed_name)
        ),
        '{name}',
        to_jsonb(v_trimmed_name)
      ),
      '{full_name}',
      to_jsonb(v_trimmed_name)
    )
  where id = p_target_user_id;

  -- 6. Gravar log de auditoria imutável
  insert into public.logs_auditoria_admin (
    admin_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    auth.uid(),
    'user.update_name',
    'user',
    p_target_user_id::text,
    jsonb_build_object(
      'target_email', v_target_email,
      'old_name', coalesce(v_old_name, 'Sem nome'),
      'new_name', v_trimmed_name,
      'reason', coalesce(p_reason, 'Alteração administrativa de nome')
    )
  );

  return jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'new_name', v_trimmed_name
  );
end;
$$;

grant execute on function public.admin_update_user_name(uuid, text, text) to authenticated;
