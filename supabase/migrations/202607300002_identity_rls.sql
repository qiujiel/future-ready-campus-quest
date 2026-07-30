alter table public.user_roles enable row level security;
alter table public.cohorts enable row level security;
alter table public.groups enable row level security;
alter table public.student_private_profiles enable row level security;
alter table public.student_public_profiles enable row level security;

alter table public.user_roles force row level security;
alter table public.cohorts force row level security;
alter table public.groups force row level security;
alter table public.student_private_profiles force row level security;
alter table public.student_public_profiles force row level security;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.user_roles
  where user_id = auth.uid()
$$;

create or replace function public.teacher_owns_cohort(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cohorts
    where id = p_cohort_id
      and teacher_id = auth.uid()
      and public.current_role() = 'teacher'
  )
$$;

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
      and public.current_role() = 'student'
  )
$$;

revoke all on function public.current_role() from public;
revoke all on function public.teacher_owns_cohort(uuid) from public;
revoke all on function public.student_in_cohort(uuid) from public;
revoke all on function public.student_in_group(uuid) from public;

grant execute on function public.current_role() to authenticated;
grant execute on function public.teacher_owns_cohort(uuid) to authenticated;
grant execute on function public.student_in_cohort(uuid) to authenticated;
grant execute on function public.student_in_group(uuid) to authenticated;

create policy cohorts_teacher_read
on public.cohorts
for select
to authenticated
using (public.teacher_owns_cohort(id));

create policy cohorts_student_read
on public.cohorts
for select
to authenticated
using (public.student_in_cohort(id));

create policy groups_teacher_read
on public.groups
for select
to authenticated
using (public.teacher_owns_cohort(cohort_id));

create policy groups_student_read
on public.groups
for select
to authenticated
using (public.student_in_cohort(cohort_id));

create policy student_private_profiles_self_read
on public.student_private_profiles
for select
to authenticated
using (student_id = auth.uid());

create policy student_private_profiles_teacher_read
on public.student_private_profiles
for select
to authenticated
using (public.teacher_owns_cohort(cohort_id));

create policy student_public_profiles_group_read
on public.student_public_profiles
for select
to authenticated
using (public.student_in_group(group_id));

create policy student_public_profiles_teacher_read
on public.student_public_profiles
for select
to authenticated
using (public.teacher_owns_cohort(cohort_id));
