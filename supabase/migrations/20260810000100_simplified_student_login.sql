alter table public.cohorts
  add column student_access_id uuid not null default gen_random_uuid();

create unique index cohorts_student_access_id_uidx
  on public.cohorts (student_access_id);

create table private.student_login_credentials (
  student_id uuid primary key references auth.users(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  name_lookup_hash text not null check (name_lookup_hash ~ '^[a-f0-9]{64}$'),
  passcode_salt text not null,
  passcode_hash text not null,
  passcode_iterations integer not null check (passcode_iterations >= 210000),
  created_at timestamptz not null default now()
);

create index student_login_credentials_lookup_idx
  on private.student_login_credentials (cohort_id, name_lookup_hash);

create table private.student_login_attempts (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  name_lookup_hash text not null check (name_lookup_hash ~ '^[a-f0-9]{64}$'),
  rate_key_hash text not null check (rate_key_hash ~ '^[a-f0-9]{64}$'),
  succeeded boolean,
  attempted_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index student_login_attempts_name_time_idx
  on private.student_login_attempts (
    cohort_id,
    name_lookup_hash,
    attempted_at desc
  )
  where succeeded = false and finalized_at is not null;

create index student_login_attempts_rate_time_idx
  on private.student_login_attempts (rate_key_hash, attempted_at desc);

revoke all on table private.student_login_credentials
  from public, anon, authenticated;
revoke all on table private.student_login_attempts
  from public, anon, authenticated;

comment on table private.student_login_credentials is
  'Service-owned class-scoped lookup and PBKDF2 material for returning student login.';
comment on table private.student_login_attempts is
  'Private class/name and shared-network returning-login rate ledger.';

create or replace function public.complete_student_code_join(
  p_code_hash text,
  p_request_key uuid,
  p_student_id uuid,
  p_display_name text,
  p_student_access_id uuid,
  p_name_lookup_hash text,
  p_passcode_salt text,
  p_passcode_hash text,
  p_passcode_iterations integer,
  p_wants_leader boolean
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
  v_cohort_id uuid;
  v_group_id uuid;
  v_archived_at timestamptz;
  v_window public.cohort_join_windows;
  v_capacity smallint;
  v_member_count integer;
  v_nickname text;
  v_completed_student_id uuid;
begin
  select
    codes.disabled_at,
    windows.token_hash,
    cohorts.id,
    groups.id,
    cohorts.archived_at
  into
    v_disabled_at,
    v_token_hash,
    v_cohort_id,
    v_group_id,
    v_archived_at
  from public.cohort_group_join_codes as codes
  join public.cohort_join_windows as windows
    on windows.id = codes.join_window_id
  join public.groups as groups
    on groups.id = codes.group_id
    and groups.cohort_id = codes.cohort_id
  join public.cohorts as cohorts
    on cohorts.id = codes.cohort_id
  where codes.code_hash = p_code_hash
    and cohorts.student_access_id = p_student_access_id
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

  select windows.*
  into v_window
  from public.cohort_join_windows as windows
  where windows.token_hash = v_token_hash
  for share;

  if not found
    or v_window.closed_at is not null
    or v_window.opens_at > now()
    or v_window.expires_at <= now()
  then
    raise exception 'GROUP_JOIN_CLOSED' using errcode = 'P0001';
  end if;

  select requests.student_id
  into v_completed_student_id
  from public.student_join_requests as requests
  where requests.join_window_id = v_window.id
    and requests.request_key = p_request_key;

  if found then
    if not exists (
      select 1
      from private.student_login_credentials as credentials
      where credentials.student_id = v_completed_student_id
        and credentials.cohort_id = v_cohort_id
    ) then
      raise exception 'STUDENT_RECOVERY_REQUIRED' using errcode = 'P0001';
    end if;

    return query
    select completed.*
    from public.find_completed_student_join(
      v_token_hash,
      p_request_key
    ) as completed;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'student-login-name:' || v_cohort_id::text || ':' || p_name_lookup_hash,
      0
    )
  );

  if (
    select count(*) >= 4
    from private.student_login_credentials as credentials
    join public.student_private_profiles as profiles
      on profiles.student_id = credentials.student_id
      and profiles.cohort_id = credentials.cohort_id
      and profiles.removed_at is null
    where credentials.cohort_id = v_cohort_id
      and credentials.name_lookup_hash = p_name_lookup_hash
  ) then
    raise exception 'STUDENT_NAME_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select cohorts.group_capacity
  into v_capacity
  from public.cohorts as cohorts
  where cohorts.id = v_cohort_id;

  select count(*)
  into v_member_count
  from public.student_private_profiles as profiles
  where profiles.group_id = v_group_id
    and profiles.removed_at is null;

  if v_member_count >= v_capacity then
    raise exception 'GROUP_FULL' using errcode = 'P0001';
  end if;

  v_nickname := 'Explorer ' || (v_member_count + 1)::text;

  insert into public.user_roles (user_id, role)
  values (p_student_id, 'student');

  insert into public.student_private_profiles (
    student_id, cohort_id, group_id, real_name
  ) values (
    p_student_id,
    v_cohort_id,
    v_group_id,
    regexp_replace(btrim(p_display_name), '\s+', ' ', 'g')
  );

  insert into public.student_public_profiles (
    student_id, cohort_id, group_id, nickname
  ) values (
    p_student_id, v_cohort_id, v_group_id, v_nickname
  );

  insert into private.student_login_credentials (
    student_id,
    cohort_id,
    name_lookup_hash,
    passcode_salt,
    passcode_hash,
    passcode_iterations
  ) values (
    p_student_id,
    v_cohort_id,
    p_name_lookup_hash,
    p_passcode_salt,
    p_passcode_hash,
    p_passcode_iterations
  );

  update public.groups as groups
  set identity_editor_id = p_student_id
  where groups.id = v_group_id
    and p_wants_leader
    and groups.identity_editor_id is null;

  insert into public.student_join_requests (
    join_window_id, request_key, student_id, cohort_id, group_id
  ) values (
    v_window.id, p_request_key, p_student_id, v_cohort_id, v_group_id
  );

  insert into public.audit_events (
    actor_user_id, cohort_id, event_type, entity_id, request_key
  ) values (
    p_student_id, v_cohort_id, 'student.joined', p_student_id, p_request_key
  );

  return query
  select completed.*
  from public.find_completed_student_join(
    v_token_hash,
    p_request_key
  ) as completed;
end;
$$;

comment on function public.complete_student_code_join(
  text, uuid, uuid, text, uuid, text, text, text, integer, boolean
) is
  'Completes a class-scoped code join, atomically storing credentials and honoring a first-writer leader request.';

create or replace function public.begin_student_login(
  p_student_access_id uuid,
  p_name_lookup_hash text,
  p_rate_key_hash text,
  p_request_key uuid
)
returns table (
  attempt_id uuid,
  student_id uuid,
  passcode_salt text,
  passcode_hash text,
  passcode_iterations integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cohort_id uuid;
  v_attempt private.student_login_attempts;
begin
  if p_name_lookup_hash !~ '^[a-f0-9]{64}$'
    or p_rate_key_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception 'STUDENT_LOGIN_NOT_ACCEPTED' using errcode = 'P0001';
  end if;

  select cohorts.id
  into v_cohort_id
  from public.cohorts as cohorts
  where cohorts.student_access_id = p_student_access_id
    and cohorts.archived_at is null
  for update;

  if not found then
    raise exception 'STUDENT_LOGIN_NOT_ACCEPTED' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('student-login-network:' || p_rate_key_hash, 0)
  );

  delete from private.student_login_attempts as attempts
  where attempts.attempted_at < now() - interval '10 minutes';

  select attempts.*
  into v_attempt
  from private.student_login_attempts as attempts
  where attempts.id = p_request_key
  for update;

  if found then
    if v_attempt.cohort_id <> v_cohort_id
      or v_attempt.name_lookup_hash <> p_name_lookup_hash
      or v_attempt.rate_key_hash <> p_rate_key_hash
      or v_attempt.finalized_at is not null
    then
      raise exception 'STUDENT_LOGIN_NOT_ACCEPTED' using errcode = 'P0001';
    end if;

    return query
    select
      v_attempt.id,
      credentials.student_id,
      credentials.passcode_salt,
      credentials.passcode_hash,
      credentials.passcode_iterations
    from private.student_login_credentials as credentials
    join public.student_private_profiles as profiles
      on profiles.student_id = credentials.student_id
      and profiles.cohort_id = credentials.cohort_id
      and profiles.removed_at is null
    where credentials.cohort_id = v_cohort_id
      and credentials.name_lookup_hash = p_name_lookup_hash
    order by credentials.created_at, credentials.student_id
    limit 4;

    if not found then
      return query
      select v_attempt.id, null::uuid, null::text, null::text, null::integer;
    end if;
    return;
  end if;

  if (
    select count(*) >= 5
    from private.student_login_attempts as attempts
    where attempts.cohort_id = v_cohort_id
      and attempts.name_lookup_hash = p_name_lookup_hash
      and attempts.succeeded = false
      and attempts.finalized_at is not null
      and attempts.attempted_at >= now() - interval '10 minutes'
  ) then
    raise exception 'STUDENT_LOGIN_NOT_ACCEPTED' using errcode = 'P0001';
  end if;

  if (
    select count(*) >= 90
    from private.student_login_attempts as attempts
    where attempts.rate_key_hash = p_rate_key_hash
      and attempts.attempted_at >= now() - interval '1 minute'
  ) then
    raise exception 'LOGIN_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  insert into private.student_login_attempts (
    id, cohort_id, name_lookup_hash, rate_key_hash
  ) values (
    p_request_key, v_cohort_id, p_name_lookup_hash, p_rate_key_hash
  );

  return query
  select
    p_request_key,
    credentials.student_id,
    credentials.passcode_salt,
    credentials.passcode_hash,
    credentials.passcode_iterations
  from private.student_login_credentials as credentials
  join public.student_private_profiles as profiles
    on profiles.student_id = credentials.student_id
    and profiles.cohort_id = credentials.cohort_id
    and profiles.removed_at is null
  where credentials.cohort_id = v_cohort_id
    and credentials.name_lookup_hash = p_name_lookup_hash
  order by credentials.created_at, credentials.student_id
  limit 4;

  if not found then
    return query
    select p_request_key, null::uuid, null::text, null::text, null::integer;
  end if;
end;
$$;

comment on function public.begin_student_login(uuid, text, text, uuid) is
  'Begins one class-scoped neutral credential check with name and shared-network rolling limits.';

create or replace function public.finish_student_login(
  p_attempt_id uuid,
  p_student_id uuid,
  p_succeeded boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt private.student_login_attempts;
begin
  if p_succeeded is null then
    raise exception 'STUDENT_LOGIN_NOT_ACCEPTED' using errcode = 'P0001';
  end if;

  select attempts.*
  into v_attempt
  from private.student_login_attempts as attempts
  where attempts.id = p_attempt_id
  for update;

  if not found or v_attempt.finalized_at is not null then
    raise exception 'STUDENT_LOGIN_NOT_ACCEPTED' using errcode = 'P0001';
  end if;

  if p_succeeded and (
    p_student_id is null
    or not exists (
      select 1
      from private.student_login_credentials as credentials
      join public.student_private_profiles as profiles
        on profiles.student_id = credentials.student_id
        and profiles.cohort_id = credentials.cohort_id
        and profiles.removed_at is null
      where credentials.student_id = p_student_id
        and credentials.cohort_id = v_attempt.cohort_id
        and credentials.name_lookup_hash = v_attempt.name_lookup_hash
    )
  ) then
    raise exception 'STUDENT_LOGIN_NOT_ACCEPTED' using errcode = 'P0001';
  end if;

  update private.student_login_attempts as attempts
  set succeeded = p_succeeded,
      finalized_at = now()
  where attempts.id = p_attempt_id
    and attempts.finalized_at is null;

  if not found then
    raise exception 'STUDENT_LOGIN_NOT_ACCEPTED' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.finish_student_login(uuid, uuid, boolean) is
  'Finalizes exactly one login attempt and validates any successful student against its class and name scope.';

revoke all on function public.complete_student_code_join(
  text, uuid, uuid, text, uuid, text, text, text, integer, boolean
) from public, anon, authenticated;
revoke all on function public.begin_student_login(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.finish_student_login(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.complete_student_code_join(text, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_student_join(
  text, uuid, uuid, smallint, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.complete_student_code_join(
  text, uuid, uuid, text, uuid, text, text, text, integer, boolean
) to service_role;
grant execute on function public.begin_student_login(uuid, text, text, uuid)
  to service_role;
grant execute on function public.finish_student_login(uuid, uuid, boolean)
  to service_role;

create or replace function public.get_teacher_classroom_readiness(
  p_cohort_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_expected integer;
  v_joined integer;
  v_active integer;
  v_started integer;
  v_submitted integer;
  v_incomplete integer;
  v_window record;
  v_groups jsonb;
begin
  if not public.teacher_owns_cohort(p_cohort_id) then
    raise exception 'COHORT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select title, (group_count * group_capacity)::integer
  into v_title, v_expected
  from public.cohorts
  where id = p_cohort_id and archived_at is null;

  if not found then
    raise exception 'COHORT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select id, request_key, expires_at
  into v_window
  from public.cohort_join_windows
  where cohort_id = p_cohort_id
    and closed_at is null
    and opens_at <= now()
    and expires_at > now()
  order by opens_at desc
  limit 1;

  select count(*)::integer into v_joined
  from public.student_private_profiles
  where cohort_id = p_cohort_id and removed_at is null;

  select count(distinct attempts.student_id)::integer into v_active
  from public.quest_attempts as attempts
  join public.student_private_profiles as profiles
    on profiles.student_id = attempts.student_id
    and profiles.cohort_id = attempts.cohort_id
    and profiles.removed_at is null
  where attempts.cohort_id = p_cohort_id and attempts.status = 'active';

  select count(distinct attempts.student_id)::integer into v_started
  from public.quest_attempts as attempts
  join public.student_private_profiles as profiles
    on profiles.student_id = attempts.student_id
    and profiles.cohort_id = attempts.cohort_id
    and profiles.removed_at is null
  where attempts.cohort_id = p_cohort_id;

  select count(distinct results.student_id)::integer into v_submitted
  from public.quest_results as results
  join public.student_private_profiles as profiles
    on profiles.student_id = results.student_id
    and profiles.cohort_id = results.cohort_id
    and profiles.removed_at is null
  where results.cohort_id = p_cohort_id;

  v_incomplete := greatest(v_started - v_submitted, 0);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'groupId', groups.id,
      'groupNumber', groups.group_number,
      'displayName', groups.display_name,
      'capacity', cohorts.group_capacity,
      'joinEnabled', v_window.id is not null and exists (
        select 1 from public.cohort_group_join_codes as codes
        where codes.join_window_id = v_window.id
          and codes.group_id = groups.id
          and codes.disabled_at is null
      ),
      'students', coalesce((
        select jsonb_agg(jsonb_build_object(
          'studentId', private_profiles.student_id,
          'displayName', private_profiles.real_name,
          'isGroupLeader', groups.identity_editor_id = private_profiles.student_id,
          'joinedAt', private_profiles.joined_at,
          'lastActiveAt', case when latest.id is null then null
            else coalesce(latest.last_response_at, latest.started_at) end,
          'activityStatus', case
            when latest.result_exists then 'submitted'
            when latest.id is null then 'joined'
            when latest.has_response then 'incomplete'
            else 'started'
          end,
          'currentPhase', latest.current_phase
        ) order by private_profiles.joined_at, private_profiles.student_id)
        from public.student_private_profiles as private_profiles
        left join lateral (
          select
            attempts.id,
            attempts.current_phase,
            attempts.started_at,
            (
              select max(submitted_at)
              from public.student_responses
              where attempt_id = attempts.id
            ) as last_response_at,
            exists (
              select 1 from public.student_responses
              where attempt_id = attempts.id
            ) as has_response,
            exists (
              select 1 from public.quest_results
              where attempt_id = attempts.id
            ) as result_exists
          from public.quest_attempts as attempts
          where attempts.cohort_id = p_cohort_id
            and attempts.student_id = private_profiles.student_id
          order by attempts.started_at desc
          limit 1
        ) as latest on true
        where private_profiles.cohort_id = p_cohort_id
          and private_profiles.group_id = groups.id
          and private_profiles.removed_at is null
      ), '[]'::jsonb)
    ) order by groups.group_number
  ), '[]'::jsonb)
  into v_groups
  from public.groups as groups
  join public.cohorts as cohorts on cohorts.id = groups.cohort_id
  where groups.cohort_id = p_cohort_id;

  return jsonb_build_object(
    'cohortId', p_cohort_id,
    'title', v_title,
    'expected', v_expected,
    'joined', v_joined,
    'active', v_active,
    'started', v_started,
    'submitted', v_submitted,
    'incomplete', v_incomplete,
    'errors', 0,
    'joining', jsonb_build_object(
      'open', v_window.id is not null,
      'joinWindowId', v_window.id,
      'requestKey', v_window.request_key,
      'expiresAt', v_window.expires_at
    ),
    'groups', v_groups
  );
end;
$$;
