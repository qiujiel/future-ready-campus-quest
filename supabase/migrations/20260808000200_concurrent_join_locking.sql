create or replace function public.preflight_student_join(
  p_token_hash text,
  p_group_number smallint,
  p_rate_key_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window public.cohort_join_windows;
  v_group public.groups;
  v_capacity smallint;
  v_window_lock bigint;
  v_network_lock bigint;
begin
  select *
  into v_window
  from public.cohort_join_windows
  where token_hash = p_token_hash
  for share;

  if not found
    or v_window.closed_at is not null
    or v_window.opens_at > now()
    or v_window.expires_at <= now()
  then
    raise exception 'JOIN_WINDOW_CLOSED' using errcode = 'P0001';
  end if;

  v_window_lock := hashtextextended('join-window:' || p_token_hash, 0);
  v_network_lock := hashtextextended('join-network:' || p_rate_key_hash, 0);
  perform pg_advisory_xact_lock(least(v_window_lock, v_network_lock));
  if v_window_lock <> v_network_lock then
    perform pg_advisory_xact_lock(greatest(v_window_lock, v_network_lock));
  end if;

  if (
    select count(*) >= 90
    from private.join_attempts
    where token_hash = p_token_hash
      and attempted_at >= now() - interval '1 minute'
  ) or (
    select count(*) >= 45
    from private.join_attempts
    where rate_key_hash = p_rate_key_hash
      and attempted_at >= now() - interval '1 minute'
  ) then
    raise exception 'JOIN_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  insert into private.join_attempts (token_hash, rate_key_hash)
  values (p_token_hash, p_rate_key_hash);

  select *
  into v_group
  from public.groups
  where cohort_id = v_window.cohort_id
    and group_number = p_group_number;

  if not found then
    raise exception 'INVALID_GROUP' using errcode = 'P0001';
  end if;

  select cohorts.group_capacity
  into v_capacity
  from public.cohorts as cohorts
  where cohorts.id = v_group.cohort_id;

  if (
    select count(*) >= v_capacity
    from public.student_private_profiles as private_profiles
    where private_profiles.group_id = v_group.id
      and private_profiles.removed_at is null
  ) then
    raise exception 'GROUP_FULL' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.preflight_student_join(text, smallint, text) is
  'Validates joins with exact 45-network/90-window rolling limits, concurrent shared window locks, and ordered advisory rate locks.';

create or replace function public.preflight_student_code_join(
  p_code_hash text,
  p_rate_key_hash text
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disabled_at timestamptz;
  v_token_hash text;
  v_group_number smallint;
  v_archived_at timestamptz;
begin
  select
    codes.disabled_at,
    windows.token_hash,
    groups.group_number,
    cohorts.archived_at
  into v_disabled_at, v_token_hash, v_group_number, v_archived_at
  from public.cohort_group_join_codes as codes
  join public.cohort_join_windows as windows
    on windows.id = codes.join_window_id
  join public.groups as groups
    on groups.id = codes.group_id
    and groups.cohort_id = codes.cohort_id
  join public.cohorts as cohorts
    on cohorts.id = codes.cohort_id
  where codes.code_hash = p_code_hash
  for share of codes, windows;

  if not found then
    raise exception 'INVALID_JOIN_CODE' using errcode = 'P0001';
  end if;
  if v_archived_at is not null then
    raise exception 'INACTIVE_COHORT' using errcode = 'P0001';
  end if;
  if v_disabled_at is not null then
    raise exception 'GROUP_JOIN_CLOSED' using errcode = 'P0001';
  end if;

  begin
    perform public.preflight_student_join(
      v_token_hash,
      v_group_number,
      p_rate_key_hash
    );
  exception
    when raise_exception then
      if sqlerrm = 'JOIN_WINDOW_CLOSED' then
        raise exception 'GROUP_JOIN_CLOSED' using errcode = 'P0001';
      end if;
      raise;
  end;

  return v_group_number;
end;
$$;

create or replace function public.complete_student_join(
  p_token_hash text,
  p_request_key uuid,
  p_student_id uuid,
  p_group_number smallint,
  p_real_name text,
  p_nickname text default null
)
returns table (
  student_id uuid,
  cohort_id uuid,
  group_id uuid,
  group_number smallint,
  nickname text,
  is_group_identity_editor boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window public.cohort_join_windows;
  v_group public.groups;
  v_capacity smallint;
  v_member_count integer;
  v_nickname text;
begin
  select *
  into v_window
  from public.cohort_join_windows
  where token_hash = p_token_hash
  for share;

  if not found
    or v_window.closed_at is not null
    or v_window.opens_at > now()
    or v_window.expires_at <= now()
  then
    raise exception 'JOIN_WINDOW_CLOSED' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.student_join_requests as requests
    where requests.join_window_id = v_window.id
      and requests.request_key = p_request_key
  ) then
    return query
    select *
    from public.find_completed_student_join(p_token_hash, p_request_key);
    return;
  end if;

  select groups.*
  into v_group
  from public.groups as groups
  where groups.cohort_id = v_window.cohort_id
    and groups.group_number = p_group_number
  for update;

  if not found then
    raise exception 'INVALID_GROUP' using errcode = 'P0001';
  end if;

  select cohorts.group_capacity
  into v_capacity
  from public.cohorts as cohorts
  where cohorts.id = v_group.cohort_id;

  select count(*)
  into v_member_count
  from public.student_private_profiles as profiles
  where profiles.group_id = v_group.id
    and profiles.removed_at is null;

  if v_member_count >= v_capacity then
    raise exception 'GROUP_FULL' using errcode = 'P0001';
  end if;

  v_nickname := nullif(
    regexp_replace(btrim(coalesce(p_nickname, '')), '\s+', ' ', 'g'),
    ''
  );
  if v_nickname is null then
    v_nickname := 'Explorer ' || (v_member_count + 1)::text;
  end if;

  insert into public.user_roles (user_id, role)
  values (p_student_id, 'student');
  insert into public.student_private_profiles (
    student_id, cohort_id, group_id, real_name
  ) values (
    p_student_id,
    v_window.cohort_id,
    v_group.id,
    regexp_replace(btrim(p_real_name), '\s+', ' ', 'g')
  );
  insert into public.student_public_profiles (
    student_id, cohort_id, group_id, nickname
  ) values (
    p_student_id, v_window.cohort_id, v_group.id, v_nickname
  );
  update public.groups as groups
  set identity_editor_id = p_student_id
  where groups.id = v_group.id
    and groups.identity_editor_id is null;
  insert into public.student_join_requests (
    join_window_id, request_key, student_id, cohort_id, group_id
  ) values (
    v_window.id, p_request_key, p_student_id, v_window.cohort_id, v_group.id
  );
  insert into public.audit_events (
    actor_user_id, cohort_id, event_type, entity_id, request_key
  ) values (
    p_student_id, v_window.cohort_id, 'student.joined', p_student_id, p_request_key
  );

  return query
  select *
  from public.find_completed_student_join(p_token_hash, p_request_key);
end;
$$;

create or replace function public.complete_student_code_join(
  p_code_hash text,
  p_request_key uuid,
  p_student_id uuid,
  p_display_name text
)
returns table (
  student_id uuid,
  cohort_id uuid,
  group_id uuid,
  group_number smallint,
  nickname text,
  is_group_identity_editor boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disabled_at timestamptz;
  v_token_hash text;
  v_group_number smallint;
  v_archived_at timestamptz;
begin
  select
    codes.disabled_at,
    windows.token_hash,
    groups.group_number,
    cohorts.archived_at
  into v_disabled_at, v_token_hash, v_group_number, v_archived_at
  from public.cohort_group_join_codes as codes
  join public.cohort_join_windows as windows
    on windows.id = codes.join_window_id
  join public.groups as groups
    on groups.id = codes.group_id
    and groups.cohort_id = codes.cohort_id
  join public.cohorts as cohorts
    on cohorts.id = codes.cohort_id
  where codes.code_hash = p_code_hash
  for share of codes, windows
  for update of groups;

  if not found then
    raise exception 'INVALID_JOIN_CODE' using errcode = 'P0001';
  end if;
  if v_archived_at is not null then
    raise exception 'INACTIVE_COHORT' using errcode = 'P0001';
  end if;
  if v_disabled_at is not null then
    raise exception 'GROUP_JOIN_CLOSED' using errcode = 'P0001';
  end if;

  begin
    return query
    select *
    from public.complete_student_join(
      v_token_hash,
      p_request_key,
      p_student_id,
      v_group_number,
      p_display_name,
      null
    );
  exception
    when raise_exception then
      if sqlerrm = 'JOIN_WINDOW_CLOSED' then
        raise exception 'GROUP_JOIN_CLOSED' using errcode = 'P0001';
      end if;
      raise;
  end;
end;
$$;

comment on function public.complete_student_join(
  text, uuid, uuid, smallint, text, text
) is
  'Completes a join with concurrent shared window access and per-group exclusive capacity enforcement.';
