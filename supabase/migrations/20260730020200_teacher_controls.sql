create table public.cohort_session_controls (
  cohort_id uuid primary key
    references public.cohorts(id)
    on delete cascade,
  quest_starts_allowed boolean not null default true,
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id) on delete restrict
);

create table private.teacher_control_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  action text not null check (
    action in ('set-quest-starts', 'extend-phase', 'close-session')
  ),
  target_ids jsonb not null default '{}'::jsonb
    check (jsonb_typeof(target_ids) = 'object'),
  result text not null check (result in ('applied', 'rejected')),
  affected_count integer not null default 0 check (affected_count >= 0),
  request_key uuid not null,
  created_at timestamptz not null default now(),
  unique (actor_user_id, request_key)
);

revoke all on table public.cohort_session_controls
  from anon, authenticated;
revoke all on table private.teacher_control_audit
  from public, anon, authenticated;

alter table public.cohort_session_controls enable row level security;
alter table public.cohort_session_controls force row level security;

grant select on table public.cohort_session_controls to authenticated;

create policy cohort_session_controls_teacher_read
on public.cohort_session_controls
for select
to authenticated
using (public.teacher_owns_cohort(cohort_id));

create policy cohort_session_controls_student_read
on public.cohort_session_controls
for select
to authenticated
using (public.student_in_cohort(cohort_id));

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
    select count(*)::integer
    into v_affected
    from public.quest_attempts
    where cohort_id = p_cohort_id
      and status = 'active';
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

revoke all on function public.apply_teacher_control(
  uuid,
  text,
  text,
  integer,
  boolean,
  uuid
) from public;
grant execute on function public.apply_teacher_control(
  uuid,
  text,
  text,
  integer,
  boolean,
  uuid
) to authenticated;

comment on table private.teacher_control_audit is
  'Opaque teacher control audit: IDs, action class, result, and timestamp only.';
