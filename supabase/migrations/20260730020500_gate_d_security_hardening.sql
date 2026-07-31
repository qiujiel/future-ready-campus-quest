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
    raise exception using
      errcode = 'P0001',
      message = 'CONTROL_NOT_AVAILABLE';
  end if;
  if p_group_id is not null and not exists (
    select 1
    from public.groups
    where id = p_group_id
      and cohort_id = p_cohort_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CONTROL_NOT_AVAILABLE';
  end if;
  if p_student_id is not null and not exists (
    select 1
    from public.student_private_profiles
    where student_id = p_student_id
      and cohort_id = p_cohort_id
      and (p_group_id is null or group_id = p_group_id)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CONTROL_NOT_AVAILABLE';
  end if;
  return true;
end;
$$;

revoke all on function public.assert_teacher_control_scope(
  uuid,
  uuid,
  uuid
) from public;
grant execute on function public.assert_teacher_control_scope(
  uuid,
  uuid,
  uuid
) to authenticated;

create or replace function public.enforce_cohort_entry_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.cohorts
    where id = new.cohort_id
      and archived_at is not null
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

revoke all on function public.enforce_cohort_entry_state() from public;

create trigger cohort_join_windows_entry_state
before insert on public.cohort_join_windows
for each row execute function public.enforce_cohort_entry_state();

create trigger quest_attempts_entry_state
before insert on public.quest_attempts
for each row execute function public.enforce_cohort_entry_state();

create or replace function public.enforce_closed_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.closed_at is not null
    and (tg_op = 'INSERT' or old.closed_at is null)
  then
    update public.quest_attempts
    set status = 'abandoned'
    where cohort_id = new.cohort_id
      and status = 'active';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_closed_session() from public;

create trigger cohort_session_controls_close_active
after insert or update on public.cohort_session_controls
for each row execute function public.enforce_closed_session();
