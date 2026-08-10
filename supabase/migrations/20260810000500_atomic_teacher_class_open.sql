create or replace function public.create_teacher_cohort(
  p_title text,
  p_group_count smallint,
  p_group_capacity smallint,
  p_request_key uuid
)
returns public.cohorts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cohort public.cohorts;
begin
  if public.current_role() is distinct from 'teacher' then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;

  select *
  into v_cohort
  from public.cohorts
  where teacher_id = auth.uid()
    and creation_request_key = p_request_key;

  if found then
    return v_cohort;
  end if;

  insert into public.cohorts (
    teacher_id,
    title,
    group_count,
    group_capacity,
    creation_request_key
  )
  values (
    auth.uid(),
    btrim(p_title),
    p_group_count,
    20,
    p_request_key
  )
  returning * into v_cohort;

  insert into public.audit_events (
    actor_user_id,
    cohort_id,
    event_type,
    entity_id,
    request_key
  )
  values (
    auth.uid(),
    v_cohort.id,
    'cohort.created',
    v_cohort.id,
    p_request_key
  );

  return v_cohort;
end;
$$;

comment on function public.create_teacher_cohort(text, smallint, smallint, uuid)
is 'Creates a teacher class idempotently. The capacity argument is retained for compatibility but every new group is fixed at 20 students.';

create or replace function public.open_cohort_join_window_with_codes(
  p_cohort_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_request_key uuid,
  p_codes jsonb
)
returns public.cohort_join_windows
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window public.cohort_join_windows;
  v_expected integer;
  v_valid integer;
begin
  if not public.teacher_owns_cohort(p_cohort_id) then
    raise exception 'COHORT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_cohort_id::text, 0)
  );

  select group_count::integer
  into v_expected
  from public.cohorts
  where id = p_cohort_id
    and archived_at is null;

  if v_expected is null
    or p_codes is null
    or jsonb_typeof(p_codes) is distinct from 'array'
  then
    raise exception 'INVALID_GROUP_CODES' using errcode = '22023';
  end if;

  if jsonb_array_length(p_codes) <> v_expected then
    raise exception 'INVALID_GROUP_CODES' using errcode = '22023';
  end if;

  select count(distinct groups.id)::integer
  into v_valid
  from jsonb_array_elements(p_codes) as code(value)
  join public.groups as groups
    on groups.id = (code.value ->> 'groupId')::uuid
    and groups.cohort_id = p_cohort_id
  where code.value ->> 'codeHash' ~ '^[a-f0-9]{64}$';

  if v_valid <> v_expected then
    raise exception 'INVALID_GROUP_CODES' using errcode = '22023';
  end if;

  select *
  into v_window
  from public.cohort_join_windows
  where cohort_id = p_cohort_id
    and request_key = p_request_key;

  if found then
    if v_window.token_hash <> p_token_hash
      or exists (
        (
          select codes.group_id, codes.code_hash
          from public.cohort_group_join_codes as codes
          where codes.join_window_id = v_window.id
        )
        except
        (
          select
            (code.value ->> 'groupId')::uuid,
            code.value ->> 'codeHash'
          from jsonb_array_elements(p_codes) as code(value)
        )
      )
      or exists (
        (
          select
            (code.value ->> 'groupId')::uuid,
            code.value ->> 'codeHash'
          from jsonb_array_elements(p_codes) as code(value)
        )
        except
        (
          select codes.group_id, codes.code_hash
          from public.cohort_group_join_codes as codes
          where codes.join_window_id = v_window.id
        )
      )
    then
      raise exception 'JOIN_WINDOW_REPLAY_MISMATCH' using errcode = 'P0001';
    end if;
    return v_window;
  end if;

  select opened.*
  into v_window
  from public.open_cohort_join_window(
    p_cohort_id,
    p_token_hash,
    p_expires_at,
    p_request_key
  ) as opened;

  perform public.configure_cohort_group_join_codes(
    p_cohort_id,
    v_window.id,
    p_codes
  );

  return v_window;
end;
$$;

comment on function public.open_cohort_join_window_with_codes(
  uuid, text, timestamptz, uuid, jsonb
) is 'Atomically opens one teacher-owned join window and persists every deterministic group-code hash; same-key retries converge on the complete original window.';

revoke all on function public.open_cohort_join_window_with_codes(
  uuid, text, timestamptz, uuid, jsonb
) from public, anon, authenticated;
revoke execute on function public.open_cohort_join_window(
  uuid, text, timestamptz, uuid
) from authenticated;
revoke execute on function public.configure_cohort_group_join_codes(
  uuid, uuid, jsonb
) from authenticated;

grant execute on function public.open_cohort_join_window_with_codes(
  uuid, text, timestamptz, uuid, jsonb
) to authenticated;
grant execute on function public.open_cohort_join_window(
  uuid, text, timestamptz, uuid
) to service_role;
grant execute on function public.configure_cohort_group_join_codes(
  uuid, uuid, jsonb
) to service_role;
