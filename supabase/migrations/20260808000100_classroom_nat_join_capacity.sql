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
  select *
  into v_window
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
  ) then
    raise exception 'GROUP_FULL' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.preflight_student_join(text, smallint, text) is
  'Validates a join window, group capacity, a 90-request window burst, and a 45-request shared-network burst suitable for one 30-student class.';
