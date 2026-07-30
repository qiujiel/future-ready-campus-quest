create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.session_recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique
    check (token_hash ~ '^[a-f0-9]{64}$'),
  student_id uuid not null references auth.users(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  issuing_teacher_id uuid not null references auth.users(id) on delete restrict,
  request_key uuid not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  invalidated_at timestamptz,
  claimed_at timestamptz,
  claim_request_key uuid,
  redeemed_at timestamptz,
  unique (issuing_teacher_id, request_key),
  check (expires_at > issued_at),
  check (expires_at <= issued_at + interval '5 minutes'),
  check (invalidated_at is null or invalidated_at >= issued_at),
  check (claimed_at is null or claimed_at >= issued_at),
  check ((claimed_at is null) = (claim_request_key is null)),
  check (redeemed_at is null or redeemed_at >= issued_at)
);

create index session_recovery_tokens_student_id_idx
  on private.session_recovery_tokens (student_id);
create index session_recovery_tokens_cohort_id_idx
  on private.session_recovery_tokens (cohort_id);
create index session_recovery_tokens_expires_at_idx
  on private.session_recovery_tokens (expires_at);

create table private.group_identity_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  request_key uuid not null,
  input_payload jsonb not null,
  group_id uuid not null references public.groups(id) on delete cascade,
  group_number smallint not null,
  display_name text not null,
  image_object_path text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, request_key)
);

create or replace function public.issue_student_recovery(
  p_cohort_id uuid,
  p_student_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_request_key uuid
)
returns table (
  student_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token private.session_recovery_tokens;
begin
  if not public.teacher_owns_cohort(p_cohort_id) then
    raise exception 'RECOVERY_SCOPE_REJECTED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.student_private_profiles
    where student_private_profiles.student_id = p_student_id
      and student_private_profiles.cohort_id = p_cohort_id
  ) then
    raise exception 'RECOVERY_SCOPE_REJECTED' using errcode = '42501';
  end if;

  select *
  into v_token
  from private.session_recovery_tokens
  where issuing_teacher_id = auth.uid()
    and request_key = p_request_key;

  if found then
    return query select v_token.student_id, v_token.expires_at;
    return;
  end if;

  if p_expires_at <= now()
    or p_expires_at > now() + interval '5 minutes'
  then
    raise exception 'INVALID_RECOVERY_WINDOW' using errcode = '22023';
  end if;

  update private.session_recovery_tokens as recovery_tokens
  set invalidated_at = now()
  where recovery_tokens.student_id = p_student_id
    and recovery_tokens.invalidated_at is null
    and recovery_tokens.redeemed_at is null;

  delete from auth.sessions
  where user_id = p_student_id;

  insert into private.session_recovery_tokens (
    token_hash,
    student_id,
    cohort_id,
    issuing_teacher_id,
    request_key,
    expires_at
  )
  values (
    p_token_hash,
    p_student_id,
    p_cohort_id,
    auth.uid(),
    p_request_key,
    p_expires_at
  )
  returning * into v_token;

  insert into public.audit_events (
    actor_user_id,
    cohort_id,
    event_type,
    entity_id,
    request_key
  )
  values (
    auth.uid(),
    p_cohort_id,
    'recovery.issued',
    p_student_id,
    p_request_key
  );

  return query select v_token.student_id, v_token.expires_at;
end;
$$;

create or replace function public.claim_student_recovery(
  p_token_hash text,
  p_request_key uuid
)
returns table (
  student_id uuid,
  cohort_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token private.session_recovery_tokens;
begin
  select *
  into v_token
  from private.session_recovery_tokens
  where token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'RECOVERY_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if v_token.invalidated_at is not null or v_token.expires_at <= now() then
    raise exception 'RECOVERY_LINK_EXPIRED' using errcode = 'P0001';
  end if;

  if v_token.claim_request_key is not null then
    if v_token.claim_request_key <> p_request_key then
      raise exception 'RECOVERY_LINK_USED' using errcode = 'P0001';
    end if;
    return query select v_token.student_id, v_token.cohort_id;
    return;
  end if;

  if v_token.redeemed_at is not null then
    raise exception 'RECOVERY_LINK_USED' using errcode = 'P0001';
  end if;

  update private.session_recovery_tokens
  set
    claimed_at = now(),
    claim_request_key = p_request_key
  where id = v_token.id;

  return query select v_token.student_id, v_token.cohort_id;
end;
$$;

create or replace function public.finalize_student_recovery(
  p_token_hash text,
  p_request_key uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token private.session_recovery_tokens;
begin
  select *
  into v_token
  from private.session_recovery_tokens
  where token_hash = p_token_hash
  for update;

  if not found
    or v_token.claim_request_key is distinct from p_request_key
  then
    raise exception 'RECOVERY_LINK_USED' using errcode = 'P0001';
  end if;

  if v_token.redeemed_at is not null then
    return;
  end if;

  update private.session_recovery_tokens
  set redeemed_at = now()
  where id = v_token.id
    and claim_request_key = p_request_key
    and redeemed_at is null;

  insert into public.audit_events (
    actor_user_id,
    cohort_id,
    event_type,
    entity_id,
    request_key
  )
  values (
    v_token.student_id,
    v_token.cohort_id,
    'recovery.redeemed',
    v_token.student_id,
    p_request_key
  );

end;
$$;

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
    if (not v_is_teacher and not v_is_editor) then
      raise exception 'GROUP_ACTION_DENIED' using errcode = '42501';
    end if;
    if v_group.identity_locked_at is not null and not v_is_teacher then
      raise exception 'GROUP_IDENTITY_LOCKED' using errcode = '42501';
    end if;
    if not exists (
      select 1
      from public.student_private_profiles as private_profiles
      where private_profiles.student_id = p_next_editor_id
        and private_profiles.group_id = v_group.id
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

create or replace function public.record_rejected_security_action(
  p_actor_user_id uuid,
  p_cohort_id uuid,
  p_event_type text,
  p_entity_id uuid,
  p_request_key uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_events (
    actor_user_id,
    cohort_id,
    event_type,
    entity_id,
    request_key,
    result
  )
  values (
    p_actor_user_id,
    p_cohort_id,
    left(p_event_type, 80),
    p_entity_id,
    p_request_key,
    'rejected'
  )
  on conflict (actor_user_id, event_type, request_key) do nothing
$$;

revoke all on function public.issue_student_recovery(
  uuid,
  uuid,
  text,
  timestamptz,
  uuid
) from public;
revoke all on function public.claim_student_recovery(text, uuid) from public;
revoke all on function public.finalize_student_recovery(text, uuid) from public;
revoke all on function public.manage_group_identity(
  text,
  uuid,
  text,
  uuid,
  uuid
) from public;
revoke all on function public.record_rejected_security_action(
  uuid,
  uuid,
  text,
  uuid,
  uuid
) from public;

grant execute on function public.issue_student_recovery(
  uuid,
  uuid,
  text,
  timestamptz,
  uuid
) to authenticated;
grant execute on function public.claim_student_recovery(text, uuid)
  to service_role;
grant execute on function public.finalize_student_recovery(text, uuid)
  to service_role;
grant execute on function public.manage_group_identity(
  text,
  uuid,
  text,
  uuid,
  uuid
) to authenticated;
grant execute on function public.record_rejected_security_action(
  uuid,
  uuid,
  text,
  uuid,
  uuid
) to service_role;
