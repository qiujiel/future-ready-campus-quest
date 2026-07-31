create or replace function public.enforce_cohort_entry_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('cohort-session:' || new.cohort_id::text, 0)
  );
  if exists (
    select 1
    from public.cohorts
    where id = new.cohort_id
      and archived_at is not null
  ) or (
    tg_table_name = 'cohort_join_windows'
    and exists (
      select 1
      from public.cohort_session_controls
      where cohort_id = new.cohort_id
        and closed_at is not null
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COHORT_NOT_AVAILABLE';
  end if;
  if tg_table_name = 'quest_attempts' and exists (
    select 1
    from public.cohort_session_controls
    where cohort_id = new.cohort_id
      and (
        not quest_starts_allowed
        or closed_at is not null
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'QUEST_STARTS_PAUSED';
  end if;
  return new;
end;
$$;

create or replace function public.apply_teacher_control(
  p_cohort_id uuid,
  p_action text,
  p_phase text,
  p_seconds integer,
  p_allowed boolean,
  p_request_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_affected integer := 0;
  v_existing private.teacher_control_audit;
begin
  if not public.teacher_owns_cohort(p_cohort_id) then
    raise exception using
      errcode = 'P0001',
      message = 'CONTROL_NOT_AVAILABLE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':' || p_request_key::text, 0)
  );
  select *
  into v_existing
  from private.teacher_control_audit
  where actor_user_id = auth.uid()
    and request_key = p_request_key;
  if found then
    return jsonb_build_object(
      'affected', v_existing.affected_count,
      'actionState', v_existing.result
    );
  end if;

  if p_action = 'set-quest-starts' then
    if p_allowed is null then
      raise exception using
        errcode = '22023',
        message = 'INVALID_CONTROL';
    end if;
    insert into public.cohort_session_controls (
      cohort_id,
      quest_starts_allowed,
      updated_by
    )
    values (p_cohort_id, p_allowed, auth.uid())
    on conflict (cohort_id) do update
    set
      quest_starts_allowed = excluded.quest_starts_allowed,
      updated_at = now(),
      updated_by = auth.uid();
    select count(*)::integer
    into v_affected
    from public.quest_attempts
    where cohort_id = p_cohort_id
      and status = 'active';
  elsif p_action = 'extend-phase' then
    if p_seconds is null
      or p_seconds < 1
      or p_seconds > 300
      or p_phase not in (
        'diagnostic',
        'mission',
        'final',
        'retry',
        'reflection'
      )
    then
      raise exception using
        errcode = '22023',
        message = 'CONTROL_LIMIT_EXCEEDED';
    end if;
    update public.quest_attempts
    set phase_deadline_at =
      phase_deadline_at + make_interval(secs => p_seconds)
    where cohort_id = p_cohort_id
      and status = 'active'
      and current_phase = p_phase;
    get diagnostics v_affected = row_count;
  elsif p_action = 'close-session' then
    select count(*)::integer
    into v_affected
    from public.quest_attempts
    where cohort_id = p_cohort_id
      and status = 'active';
    insert into public.cohort_session_controls (
      cohort_id,
      quest_starts_allowed,
      closed_at,
      updated_by
    )
    values (p_cohort_id, false, now(), auth.uid())
    on conflict (cohort_id) do update
    set
      quest_starts_allowed = false,
      closed_at = coalesce(
        public.cohort_session_controls.closed_at,
        now()
      ),
      updated_at = now(),
      updated_by = auth.uid();
  else
    raise exception using
      errcode = '22023',
      message = 'INVALID_CONTROL';
  end if;

  insert into private.teacher_control_audit (
    actor_user_id,
    cohort_id,
    action,
    target_ids,
    result,
    affected_count,
    request_key
  )
  values (
    auth.uid(),
    p_cohort_id,
    p_action,
    jsonb_strip_nulls(
      jsonb_build_object(
        'cohortId', p_cohort_id,
        'phase', p_phase
      )
    ),
    'applied',
    v_affected,
    p_request_key
  );

  return jsonb_build_object(
    'affected', v_affected,
    'actionState', 'applied'
  );
end;
$$;

create or replace function public.close_teacher_session(
  p_cohort_id uuid,
  p_request_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.teacher_owns_cohort(p_cohort_id) then
    raise exception using
      errcode = 'P0001',
      message = 'CONTROL_NOT_AVAILABLE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('cohort-session:' || p_cohort_id::text, 0)
  );

  update public.cohort_join_windows
  set closed_at = coalesce(closed_at, now())
  where cohort_id = p_cohort_id
    and closed_at is null;

  v_result := public.apply_teacher_control(
    p_cohort_id,
    'close-session',
    null,
    null,
    null,
    p_request_key
  );
  return v_result;
end;
$$;

revoke all on function public.close_teacher_session(uuid, uuid) from public;
grant execute on function public.close_teacher_session(uuid, uuid)
  to authenticated;
