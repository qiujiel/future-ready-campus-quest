create or replace function public.manage_group_identity(
  p_action text,
  p_group_id uuid,
  p_display_name text,
  p_next_editor_id uuid,
  p_request_key uuid
)
returns table (
  group_id uuid,
  group_number smallint,
  display_name text,
  image_object_path text,
  locked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_receipt private.group_identity_receipts;
  v_actor_id uuid;
  v_input_payload jsonb;
  v_is_teacher boolean;
  v_is_editor boolean;
  v_name text;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'GROUP_ACTION_DENIED' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(v_actor_id::text || ':' || p_request_key::text, 0)
  );

  v_name := case
    when p_action = 'rename'
      then regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g')
    else null
  end;
  v_input_payload := jsonb_build_object(
    'action', p_action,
    'group_id', p_group_id,
    'display_name', v_name,
    'next_editor_id', p_next_editor_id
  );

  if p_action = 'transfer-editor' and not exists (
    select 1
    from public.groups as authorized_group
    where authorized_group.id = p_group_id
      and public.teacher_owns_cohort(authorized_group.cohort_id)
  ) then
    raise exception 'GROUP_ACTION_DENIED' using errcode = '42501';
  end if;

  select *
  into v_receipt
  from private.group_identity_receipts
  where actor_user_id = v_actor_id
    and request_key = p_request_key;

  if found then
    if v_receipt.input_payload is distinct from v_input_payload then
      raise exception 'INVALID_GROUP_ACTION' using errcode = '22023';
    end if;
    return query select
      v_receipt.group_id,
      v_receipt.group_number,
      v_receipt.display_name,
      v_receipt.image_object_path,
      v_receipt.locked_at;
    return;
  end if;

  select *
  into v_group
  from public.groups
  where id = p_group_id
  for update;

  if not found then
    raise exception 'GROUP_ACTION_DENIED' using errcode = '42501';
  end if;

  v_is_teacher := public.teacher_owns_cohort(v_group.cohort_id);
  v_is_editor :=
    v_group.identity_editor_id = auth.uid()
    and public.student_in_group(v_group.id);

  if p_action = 'rename' then
    if (not v_is_teacher and not v_is_editor) then
      raise exception 'GROUP_ACTION_DENIED' using errcode = '42501';
    end if;
    if v_group.identity_locked_at is not null and not v_is_teacher then
      raise exception 'GROUP_IDENTITY_LOCKED' using errcode = '42501';
    end if;
    if char_length(v_name) not between 2 and 40 then
      raise exception 'INVALID_GROUP_ACTION' using errcode = '22023';
    end if;
    update public.groups set display_name = v_name where id = v_group.id;
  elsif p_action = 'transfer-editor' then
    if not v_is_teacher then
      raise exception 'GROUP_ACTION_DENIED' using errcode = '42501';
    end if;
    if not exists (
      select 1
      from public.student_private_profiles as private_profiles
      where private_profiles.student_id = p_next_editor_id
        and private_profiles.group_id = v_group.id
        and private_profiles.removed_at is null
    ) then
      raise exception 'GROUP_MEMBER_INVALID' using errcode = '22023';
    end if;
    update public.groups
    set identity_editor_id = p_next_editor_id
    where id = v_group.id;
  elsif p_action = 'lock' then
    if not v_is_teacher then
      raise exception 'GROUP_ACTION_DENIED' using errcode = '42501';
    end if;
    update public.groups
    set identity_locked_at = coalesce(identity_locked_at, now())
    where id = v_group.id;
  elsif p_action = 'unlock' then
    if not v_is_teacher then
      raise exception 'GROUP_ACTION_DENIED' using errcode = '42501';
    end if;
    update public.groups
    set identity_locked_at = null
    where id = v_group.id;
  else
    raise exception 'INVALID_GROUP_ACTION' using errcode = '22023';
  end if;

  insert into public.audit_events (
    actor_user_id,
    cohort_id,
    event_type,
    entity_id,
    request_key
  )
  values (
    auth.uid(),
    v_group.cohort_id,
    'group_identity.' || p_action,
    v_group.id,
    p_request_key
  )
  on conflict (actor_user_id, event_type, request_key) do nothing;

  select *
  into v_group
  from public.groups
  where id = v_group.id;

  insert into private.group_identity_receipts (
    actor_user_id,
    request_key,
    input_payload,
    group_id,
    group_number,
    display_name,
    image_object_path,
    locked_at
  )
  values (
    v_actor_id,
    p_request_key,
    v_input_payload,
    v_group.id,
    v_group.group_number,
    v_group.display_name,
    v_group.image_object_path,
    v_group.identity_locked_at
  );

  return query
  select
    v_group.id,
    v_group.group_number,
    v_group.display_name,
    v_group.image_object_path,
    v_group.identity_locked_at;
end;
$$;

revoke all on function public.manage_group_identity(
  text,
  uuid,
  text,
  uuid,
  uuid
) from public;

grant execute on function public.manage_group_identity(
  text,
  uuid,
  text,
  uuid,
  uuid
) to authenticated;
