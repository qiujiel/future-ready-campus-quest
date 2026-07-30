create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('teacher', 'student');

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now()
);

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 100),
  group_count smallint not null default 5
    check (group_count between 1 and 20),
  group_capacity smallint not null default 6
    check (group_capacity between 1 and 20),
  created_at timestamptz not null default now(),
  unique (id, teacher_id)
);

create index cohorts_teacher_id_idx on public.cohorts (teacher_id);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  group_number smallint not null check (group_number between 1 and 20),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 40),
  identity_editor_id uuid references auth.users(id) on delete set null,
  identity_locked_at timestamptz,
  image_object_path text,
  created_at timestamptz not null default now(),
  unique (cohort_id, group_number),
  unique (id, cohort_id)
);

create index groups_cohort_id_idx on public.groups (cohort_id);
create index groups_identity_editor_id_idx
  on public.groups (identity_editor_id)
  where identity_editor_id is not null;

create table public.student_private_profiles (
  student_id uuid primary key references auth.users(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  group_id uuid not null,
  real_name text not null check (char_length(btrim(real_name)) between 1 and 100),
  joined_at timestamptz not null default now(),
  constraint student_private_profiles_group_cohort_fk
    foreign key (group_id, cohort_id)
    references public.groups(id, cohort_id)
    on delete cascade
);

create index student_private_profiles_cohort_id_idx
  on public.student_private_profiles (cohort_id);
create index student_private_profiles_group_id_idx
  on public.student_private_profiles (group_id);

create table public.student_public_profiles (
  student_id uuid primary key
    references public.student_private_profiles(student_id)
    on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  group_id uuid not null,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 40),
  constraint student_public_profiles_group_cohort_fk
    foreign key (group_id, cohort_id)
    references public.groups(id, cohort_id)
    on delete cascade
);

create index student_public_profiles_cohort_id_idx
  on public.student_public_profiles (cohort_id);
create index student_public_profiles_group_id_idx
  on public.student_public_profiles (group_id);

create or replace function public.create_default_groups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.groups (cohort_id, group_number, display_name)
  select
    new.id,
    group_number::smallint,
    'Group ' || group_number::text
  from generate_series(1, new.group_count) as group_number;

  return new;
end;
$$;

revoke all on function public.create_default_groups() from public;

create trigger create_default_groups_after_cohort
after insert on public.cohorts
for each row execute function public.create_default_groups();

comment on table public.student_private_profiles is
  'Teacher-only real names and immutable cohort/group membership.';
comment on table public.student_public_profiles is
  'Group-visible neutral nicknames; never use real names as fallback values.';

revoke all on table public.user_roles from anon, authenticated;
revoke all on table public.cohorts from anon, authenticated;
revoke all on table public.groups from anon, authenticated;
revoke all on table public.student_private_profiles from anon, authenticated;
revoke all on table public.student_public_profiles from anon, authenticated;

grant select on table public.cohorts to authenticated;
grant select on table public.groups to authenticated;
grant select on table public.student_private_profiles to authenticated;
grant select on table public.student_public_profiles to authenticated;
