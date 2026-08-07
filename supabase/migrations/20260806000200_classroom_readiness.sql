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

  select
    cohorts.title,
    (cohorts.group_count * cohorts.group_capacity)::integer
  into v_title, v_expected
  from public.cohorts as cohorts
  where cohorts.id = p_cohort_id
    and cohorts.archived_at is null;

  if not found then
    raise exception 'COHORT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select windows.id, windows.request_key, windows.expires_at
  into v_window
  from public.cohort_join_windows as windows
  where windows.cohort_id = p_cohort_id
    and windows.closed_at is null
    and windows.opens_at <= now()
    and windows.expires_at > now()
  order by windows.opens_at desc
  limit 1;

  select count(*)::integer
  into v_joined
  from public.student_private_profiles
  where cohort_id = p_cohort_id;

  select count(distinct student_id)::integer
  into v_active
  from public.quest_attempts
  where cohort_id = p_cohort_id
    and status = 'active';

  select count(distinct student_id)::integer
  into v_started
  from public.quest_attempts
  where cohort_id = p_cohort_id;

  select count(distinct student_id)::integer
  into v_submitted
  from public.quest_results
  where cohort_id = p_cohort_id;

  v_incomplete := greatest(v_started - v_submitted, 0);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'groupId', groups.id,
        'groupNumber', groups.group_number,
        'displayName', groups.display_name,
        'capacity', cohorts.group_capacity,
        'joinEnabled', v_window.id is not null and exists (
          select 1
          from public.cohort_group_join_codes as codes
          where codes.join_window_id = v_window.id
            and codes.group_id = groups.id
            and codes.disabled_at is null
        ),
        'students', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'studentId', profiles.student_id,
              'displayName', profiles.real_name,
              'joinedAt', profiles.joined_at,
              'lastActiveAt', case
                when latest.id is null then null
                else coalesce(latest.last_response_at, latest.started_at)
              end,
              'activityStatus', case
                when latest.result_exists then 'submitted'
                when latest.id is null then 'joined'
                when latest.status = 'active' then 'incomplete'
                else 'incomplete'
              end,
              'currentPhase', latest.current_phase
            )
            order by profiles.joined_at, profiles.student_id
          )
          from public.student_private_profiles as profiles
          left join lateral (
            select
              attempts.id,
              attempts.status,
              attempts.current_phase,
              attempts.started_at,
              (
                select max(responses.submitted_at)
                from public.student_responses as responses
                where responses.attempt_id = attempts.id
              ) as last_response_at,
              exists (
                select 1
                from public.quest_results as results
                where results.attempt_id = attempts.id
              ) as result_exists
            from public.quest_attempts as attempts
            where attempts.cohort_id = p_cohort_id
              and attempts.student_id = profiles.student_id
            order by attempts.started_at desc
            limit 1
          ) as latest on true
          where profiles.cohort_id = p_cohort_id
            and profiles.group_id = groups.id
        ), '[]'::jsonb)
      )
      order by groups.group_number
    ),
    '[]'::jsonb
  )
  into v_groups
  from public.groups as groups
  join public.cohorts as cohorts
    on cohorts.id = groups.cohort_id
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

revoke all on function public.get_teacher_classroom_readiness(uuid)
  from public;
grant execute on function public.get_teacher_classroom_readiness(uuid)
  to authenticated;

comment on function public.get_teacher_classroom_readiness(uuid) is
  'Teacher-owned readiness roster. The trusted Edge boundary removes requestKey and derives raw group codes.';
