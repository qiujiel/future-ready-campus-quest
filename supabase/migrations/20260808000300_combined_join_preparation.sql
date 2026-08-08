create or replace function public.prepare_student_code_join(
  p_code_hash text,
  p_request_key uuid,
  p_rate_key_hash text
)
returns table (
  completed boolean,
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
  v_group_number smallint;
begin
  return query
  select
    true,
    stored.student_id,
    stored.cohort_id,
    stored.group_id,
    stored.group_number,
    stored.nickname,
    stored.is_group_identity_editor
  from public.find_completed_student_code_join(
    p_code_hash,
    p_request_key
  ) as stored;

  if found then
    return;
  end if;

  v_group_number := public.preflight_student_code_join(
    p_code_hash,
    p_rate_key_hash
  );

  return query
  select
    false,
    null::uuid,
    null::uuid,
    null::uuid,
    v_group_number,
    null::text,
    false;
end;
$$;

comment on function public.prepare_student_code_join(text, uuid, text) is
  'Combines idempotent replay detection with protected code, rate, and capacity preflight in one trusted round trip.';

revoke all on function public.prepare_student_code_join(text, uuid, text)
  from public;
grant execute on function public.prepare_student_code_join(text, uuid, text)
  to service_role;
