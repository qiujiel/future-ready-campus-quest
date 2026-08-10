create or replace function public.load_student_login_identity(
  p_student_id uuid
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
    private_profiles.student_id,
    private_profiles.cohort_id,
    private_profiles.group_id,
    groups.group_number,
    public_profiles.nickname,
    coalesce(groups.identity_editor_id = private_profiles.student_id, false)
  from public.student_private_profiles as private_profiles
  join public.student_public_profiles as public_profiles
    on public_profiles.student_id = private_profiles.student_id
    and public_profiles.cohort_id = private_profiles.cohort_id
    and public_profiles.group_id = private_profiles.group_id
  join public.groups as groups
    on groups.id = private_profiles.group_id
    and groups.cohort_id = private_profiles.cohort_id
  where private_profiles.student_id = p_student_id
    and private_profiles.removed_at is null;
$$;

revoke all on function public.load_student_login_identity(uuid)
  from public, anon, authenticated;
grant execute on function public.load_student_login_identity(uuid)
  to service_role;

comment on function public.load_student_login_identity(uuid) is
  'Loads one active returning-student identity without granting direct profile reads.';
