alter table public.student_private_profiles
  add column removed_at timestamptz,
  add column removed_by uuid references auth.users(id) on delete restrict;

create index student_private_profiles_active_group_idx
  on public.student_private_profiles (group_id, joined_at)
  where removed_at is null;

create table private.teacher_roster_control_receipts (
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  request_key uuid not null,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  action text not null check (
    action in ('move-student', 'remove-student', 'reset-student')
  ),
  student_id uuid not null references auth.users(id) on delete restrict,
  target_group_id uuid references public.groups(id) on delete restrict,
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object'),
  created_at timestamptz not null default now(),
  primary key (actor_user_id, request_key)
);

revoke all on table private.teacher_roster_control_receipts
  from public, anon, authenticated;

create or replace function public.student_in_cohort(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_private_profiles
    where student_id = auth.uid()
      and cohort_id = p_cohort_id
      and removed_at is null
      and public.current_role() = 'student'
  )
$$;

create or replace function public.student_in_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_private_profiles
    where student_id = auth.uid()
      and group_id = p_group_id
      and removed_at is null
      and public.current_role() = 'student'
  )
$$;

create or replace function public.assert_teacher_control_scope(
  p_cohort_id uuid,
  p_group_id uuid,
  p_student_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.teacher_owns_cohort(p_cohort_id) then
    raise exception 'CONTROL_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if p_group_id is not null and not exists (
    select 1 from public.groups
    where id = p_group_id and cohort_id = p_cohort_id
  ) then
    raise exception 'CONTROL_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if p_student_id is not null and not exists (
    select 1 from public.student_private_profiles
    where student_id = p_student_id
      and cohort_id = p_cohort_id
      and removed_at is null
      and (p_group_id is null or group_id = p_group_id)
  ) then
    raise exception 'CONTROL_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  return true;
end;
$$;

drop policy student_private_profiles_self_read
  on public.student_private_profiles;
create policy student_private_profiles_self_read
on public.student_private_profiles
for select
to authenticated
using (
  student_id = auth.uid()
  and public.student_in_cohort(cohort_id)
);

drop policy quest_attempts_student_read on public.quest_attempts;
create policy quest_attempts_student_read
on public.quest_attempts
for select
to authenticated
using (
  student_id = auth.uid()
  and public.student_in_cohort(cohort_id)
);

drop policy phase_progress_student_read on public.phase_progress;
create policy phase_progress_student_read
on public.phase_progress
for select
to authenticated
using (
  exists (
    select 1
    from public.quest_attempts
    where quest_attempts.id = phase_progress.attempt_id
      and quest_attempts.student_id = auth.uid()
      and public.student_in_cohort(quest_attempts.cohort_id)
  )
);

drop policy concept_evidence_student_read on public.concept_evidence;
create policy concept_evidence_student_read
on public.concept_evidence
for select
to authenticated
using (
  exists (
    select 1
    from public.quest_attempts
    where quest_attempts.id = concept_evidence.attempt_id
      and quest_attempts.student_id = auth.uid()
      and public.student_in_cohort(quest_attempts.cohort_id)
  )
);

drop policy student_responses_student_read on public.student_responses;
create policy student_responses_student_read
on public.student_responses
for select
to authenticated
using (
  student_id = auth.uid()
  and exists (
    select 1
    from public.quest_attempts
    where quest_attempts.id = student_responses.attempt_id
      and public.student_in_cohort(quest_attempts.cohort_id)
  )
);

drop policy attempt_items_student_read on public.attempt_items;
create policy attempt_items_student_read
on public.attempt_items
for select
to authenticated
using (
  exists (
    select 1
    from public.quest_attempts
    where quest_attempts.id = attempt_items.attempt_id
      and quest_attempts.student_id = auth.uid()
      and public.student_in_cohort(quest_attempts.cohort_id)
  )
);

drop policy quest_reflections_student_read on public.quest_reflections;
create policy quest_reflections_student_read
on public.quest_reflections
for select
to authenticated
using (
  student_id = auth.uid()
  and exists (
    select 1
    from public.quest_attempts
    where quest_attempts.id = quest_reflections.attempt_id
      and public.student_in_cohort(quest_attempts.cohort_id)
  )
);

drop policy quest_results_student_read on public.quest_results;
create policy quest_results_student_read
on public.quest_results
for select
to authenticated
using (
  student_id = auth.uid()
  and public.student_in_cohort(cohort_id)
);

drop policy team_score_snapshots_cohort_read on public.team_score_snapshots;
create policy team_score_snapshots_cohort_read
on public.team_score_snapshots
for select
to authenticated
using (
  public.teacher_owns_cohort(cohort_id)
  or public.student_in_cohort(cohort_id)
);

create or replace function public.manage_teacher_roster(
  p_cohort_id uuid,
  p_action text,
  p_student_id uuid,
  p_target_group_id uuid,
  p_request_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing private.teacher_roster_control_receipts;
  v_profile public.student_private_profiles;
  v_target public.groups;
  v_capacity integer;
  v_members integer;
  v_affected integer := 0;
  v_receipt jsonb;
begin
  if not public.teacher_owns_cohort(p_cohort_id) then
    raise exception 'CONTROL_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if p_action not in ('move-student', 'remove-student', 'reset-student') then
    raise exception 'INVALID_CONTROL' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':' || p_request_key::text, 0)
  );
  select *
  into v_existing
  from private.teacher_roster_control_receipts
  where actor_user_id = auth.uid()
    and request_key = p_request_key;
  if found then
    if v_existing.cohort_id <> p_cohort_id
      or v_existing.action <> p_action
      or v_existing.student_id <> p_student_id
      or v_existing.target_group_id is distinct from p_target_group_id
    then
      raise exception 'INVALID_CONTROL' using errcode = '22023';
    end if;
    return v_existing.receipt;
  end if;

  select *
  into v_profile
  from public.student_private_profiles
  where student_id = p_student_id
    and cohort_id = p_cohort_id
    and removed_at is null
  for update;
  if not found then
    raise exception 'CONTROL_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if p_action = 'move-student' then
    if p_target_group_id is null or p_target_group_id = v_profile.group_id then
      raise exception 'INVALID_CONTROL' using errcode = '22023';
    end if;
    if exists (
      select 1
      from public.quest_attempts
      where cohort_id = p_cohort_id
        and student_id = p_student_id
    ) then
      raise exception 'STUDENT_ALREADY_STARTED' using errcode = 'P0001';
    end if;

    select groups.*
    into v_target
    from public.groups as groups
    where groups.id = p_target_group_id
      and groups.cohort_id = p_cohort_id
    for update of groups;
    if not found then
      raise exception 'CONTROL_NOT_AVAILABLE' using errcode = 'P0001';
    end if;
    select group_capacity::integer
    into v_capacity
    from public.cohorts
    where id = p_cohort_id;
    select count(*)::integer
    into v_members
    from public.student_private_profiles
    where group_id = p_target_group_id
      and removed_at is null;
    if v_members >= v_capacity then
      raise exception 'GROUP_FULL' using errcode = 'P0001';
    end if;

    update public.student_private_profiles
    set group_id = p_target_group_id
    where student_id = p_student_id;
    update public.student_public_profiles
    set group_id = p_target_group_id
    where student_id = p_student_id;
    update public.groups
    set identity_editor_id = (
      select profiles.student_id
      from public.student_private_profiles as profiles
      where profiles.group_id = v_profile.group_id
        and profiles.removed_at is null
      order by profiles.joined_at, profiles.student_id
      limit 1
    )
    where id = v_profile.group_id
      and identity_editor_id = p_student_id;
    update public.groups
    set identity_editor_id = coalesce(identity_editor_id, p_student_id)
    where id = v_target.id;
    v_affected := 1;
  elsif p_action = 'remove-student' then
    update public.student_private_profiles
    set removed_at = now(), removed_by = auth.uid()
    where student_id = p_student_id;
    update public.quest_attempts
    set status = 'abandoned'
    where cohort_id = p_cohort_id
      and student_id = p_student_id
      and status = 'active';
    update public.groups
    set identity_editor_id = (
      select profiles.student_id
      from public.student_private_profiles as profiles
      where profiles.group_id = v_profile.group_id
        and profiles.removed_at is null
      order by profiles.joined_at, profiles.student_id
      limit 1
    )
    where id = v_profile.group_id
      and identity_editor_id = p_student_id;
    update private.session_recovery_tokens
    set invalidated_at = coalesce(invalidated_at, now())
    where cohort_id = p_cohort_id
      and student_id = p_student_id
      and redeemed_at is null;
    delete from public.user_roles
    where user_id = p_student_id
      and role = 'student';
    v_affected := 1;
  else
    update public.quest_attempts
    set status = 'abandoned'
    where cohort_id = p_cohort_id
      and student_id = p_student_id
      and status = 'active';
    get diagnostics v_affected = row_count;
  end if;

  v_receipt := jsonb_build_object(
    'affected', v_affected,
    'actionState', 'applied'
  );
  insert into public.audit_events (
    actor_user_id, cohort_id, event_type, entity_id, request_key
  )
  values (
    auth.uid(),
    p_cohort_id,
    case p_action
      when 'move-student' then 'roster.student_moved'
      when 'remove-student' then 'roster.student_removed'
      else 'roster.student_reset'
    end,
    p_student_id,
    p_request_key
  );
  insert into private.teacher_roster_control_receipts (
    actor_user_id, request_key, cohort_id, action,
    student_id, target_group_id, receipt
  )
  values (
    auth.uid(), p_request_key, p_cohort_id, p_action,
    p_student_id, p_target_group_id, v_receipt
  );
  return v_receipt;
end;
$$;

revoke all on function public.manage_teacher_roster(
  uuid, text, uuid, uuid, uuid
) from public;
grant execute on function public.manage_teacher_roster(
  uuid, text, uuid, uuid, uuid
) to authenticated;

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
begin
  select * into v_window
  from public.cohort_join_windows
  where token_hash = p_token_hash
  for update;
  if not found
    or v_window.closed_at is not null
    or v_window.opens_at > now()
    or v_window.expires_at <= now()
  then
    raise exception 'JOIN_WINDOW_CLOSED' using errcode = 'P0001';
  end if;

  delete from private.join_attempts
  where attempted_at < now() - interval '10 minutes';
  if (
    select count(*) >= 90
    from private.join_attempts
    where token_hash = p_token_hash
      and attempted_at >= now() - interval '1 minute'
  ) or (
    select count(*) >= 12
    from private.join_attempts
    where rate_key_hash = p_rate_key_hash
      and attempted_at >= now() - interval '1 minute'
  ) then
    raise exception 'JOIN_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  insert into private.join_attempts (token_hash, rate_key_hash)
  values (p_token_hash, p_rate_key_hash);

  select * into v_group
  from public.groups
  where cohort_id = v_window.cohort_id
    and group_number = p_group_number;
  if not found then
    raise exception 'INVALID_GROUP' using errcode = 'P0001';
  end if;
  select group_capacity into v_capacity
  from public.cohorts where id = v_group.cohort_id;
  if (
    select count(*) >= v_capacity
    from public.student_private_profiles
    where group_id = v_group.id
      and removed_at is null
  ) then
    raise exception 'GROUP_FULL' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.find_completed_student_join(
  p_token_hash text,
  p_request_key uuid
)
returns table (
  student_id uuid,
  cohort_id uuid,
  group_id uuid,
  group_number smallint,
  nickname text,
  is_group_identity_editor boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    requests.student_id,
    requests.cohort_id,
    requests.group_id,
    groups.group_number,
    profiles.nickname,
    groups.identity_editor_id = requests.student_id
  from public.student_join_requests as requests
  join public.cohort_join_windows as windows
    on windows.id = requests.join_window_id
  join public.groups as groups on groups.id = requests.group_id
  join public.student_public_profiles as profiles
    on profiles.student_id = requests.student_id
  join public.student_private_profiles as private_profiles
    on private_profiles.student_id = requests.student_id
    and private_profiles.removed_at is null
  where windows.token_hash = p_token_hash
    and requests.request_key = p_request_key
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
  select * into v_window
  from public.cohort_join_windows
  where token_hash = p_token_hash
  for update;
  if not found
    or v_window.closed_at is not null
    or v_window.opens_at > now()
    or v_window.expires_at <= now()
  then
    raise exception 'JOIN_WINDOW_CLOSED' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.student_join_requests as requests
    where requests.join_window_id = v_window.id
      and requests.request_key = p_request_key
  ) then
    return query
    select * from public.find_completed_student_join(p_token_hash, p_request_key);
    return;
  end if;

  select groups.* into v_group
  from public.groups as groups
  where groups.cohort_id = v_window.cohort_id
    and groups.group_number = p_group_number
  for update;
  if not found then
    raise exception 'INVALID_GROUP' using errcode = 'P0001';
  end if;
  select group_capacity into v_capacity
  from public.cohorts as cohorts
  where cohorts.id = v_group.cohort_id;
  select count(*) into v_member_count
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
  where groups.id = v_group.id and groups.identity_editor_id is null;
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
  select * from public.find_completed_student_join(p_token_hash, p_request_key);
end;
$$;

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

  select id, request_key, expires_at into v_window
  from public.cohort_join_windows
  where cohort_id = p_cohort_id
    and closed_at is null
    and opens_at <= now()
    and expires_at > now()
  order by opens_at desc limit 1;

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
          'studentId', profiles.student_id,
          'displayName', profiles.real_name,
          'joinedAt', profiles.joined_at,
          'lastActiveAt', case when latest.id is null then null
            else coalesce(latest.last_response_at, latest.started_at) end,
          'activityStatus', case
            when latest.result_exists then 'submitted'
            when latest.id is null then 'joined'
            when latest.has_response then 'incomplete'
            else 'started'
          end,
          'currentPhase', latest.current_phase
        ) order by profiles.joined_at, profiles.student_id)
        from public.student_private_profiles as profiles
        left join lateral (
          select
            attempts.id,
            attempts.current_phase,
            attempts.started_at,
            (select max(submitted_at) from public.student_responses where attempt_id = attempts.id) as last_response_at,
            exists (select 1 from public.student_responses where attempt_id = attempts.id) as has_response,
            exists (select 1 from public.quest_results where attempt_id = attempts.id) as result_exists
          from public.quest_attempts as attempts
          where attempts.cohort_id = p_cohort_id
            and attempts.student_id = profiles.student_id
          order by attempts.started_at desc limit 1
        ) as latest on true
        where profiles.cohort_id = p_cohort_id
          and profiles.group_id = groups.id
          and profiles.removed_at is null
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

comment on function public.manage_teacher_roster(uuid, text, uuid, uuid, uuid) is
  'Teacher-owned, idempotent move/remove/reset controls. Removal revokes access while retaining evidence.';
