alter table public.student_private_profiles
  add constraint student_private_profiles_student_cohort_unique
  unique (student_id, cohort_id);

create table public.quest_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  content_version_id uuid not null
    references content.content_versions(id)
    on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'completed', 'abandoned')),
  current_phase text not null default 'diagnostic'
    check (
      current_phase in (
        'diagnostic',
        'mission',
        'final',
        'retry',
        'reflection'
      )
    ),
  started_at timestamptz not null default now(),
  phase_started_at timestamptz not null default now(),
  phase_deadline_at timestamptz not null,
  last_accepted_sequence integer not null default 0
    check (last_accepted_sequence >= 0),
  completed_at timestamptz,
  constraint quest_attempts_student_cohort_fk
    foreign key (student_id, cohort_id)
    references public.student_private_profiles(student_id, cohort_id)
    on delete cascade,
  check (phase_deadline_at >= phase_started_at),
  check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create unique index quest_attempts_one_active_per_student_idx
  on public.quest_attempts (student_id, cohort_id)
  where status = 'active';
create index quest_attempts_cohort_status_idx
  on public.quest_attempts (cohort_id, status);
create index quest_attempts_content_version_idx
  on public.quest_attempts (content_version_id);

create table public.phase_progress (
  attempt_id uuid not null
    references public.quest_attempts(id)
    on delete cascade,
  phase text not null
    check (
      phase in (
        'diagnostic',
        'mission',
        'final',
        'retry',
        'reflection'
      )
    ),
  required_item_count smallint not null default 0
    check (required_item_count >= 0),
  completed_item_count smallint not null default 0
    check (
      completed_item_count >= 0
      and completed_item_count <= required_item_count
    ),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (attempt_id, phase)
);

create table public.concept_evidence (
  attempt_id uuid not null
    references public.quest_attempts(id)
    on delete cascade,
  concept_id text not null check (concept_id ~ '^C[1-8]$'),
  phase text not null
    check (phase in ('diagnostic', 'mission', 'final', 'retry')),
  correct_count smallint not null default 0 check (correct_count >= 0),
  total_count smallint not null default 0
    check (total_count >= 0 and correct_count <= total_count),
  hinted_correct_count smallint not null default 0
    check (
      hinted_correct_count >= 0
      and hinted_correct_count <= correct_count
    ),
  updated_at timestamptz not null default now(),
  primary key (attempt_id, concept_id, phase)
);

create table public.student_responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null
    references public.quest_attempts(id)
    on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null
    references content.learning_items(id)
    on delete restrict,
  phase text not null
    check (phase in ('diagnostic', 'mission', 'final', 'retry')),
  selected_option_ids text[] not null
    check (cardinality(selected_option_ids) >= 1),
  correct boolean not null,
  misconception_tag text,
  idempotency_key uuid not null,
  client_sequence integer not null check (client_sequence > 0),
  submitted_at timestamptz not null default now(),
  unique (attempt_id, idempotency_key),
  unique (attempt_id, client_sequence),
  unique (attempt_id, item_id, phase)
);

create index student_responses_student_id_idx
  on public.student_responses (student_id);
create index student_responses_attempt_phase_idx
  on public.student_responses (attempt_id, phase);
create index student_responses_item_id_idx
  on public.student_responses (item_id);

revoke all on table public.quest_attempts from anon, authenticated;
revoke all on table public.phase_progress from anon, authenticated;
revoke all on table public.concept_evidence from anon, authenticated;
revoke all on table public.student_responses from anon, authenticated;

grant select on table public.quest_attempts to authenticated;
grant select on table public.phase_progress to authenticated;
grant select on table public.concept_evidence to authenticated;
grant select on table public.student_responses to authenticated;

alter table public.quest_attempts enable row level security;
alter table public.phase_progress enable row level security;
alter table public.concept_evidence enable row level security;
alter table public.student_responses enable row level security;

create policy quest_attempts_student_read
on public.quest_attempts
for select
to authenticated
using (student_id = auth.uid());

create policy quest_attempts_teacher_read
on public.quest_attempts
for select
to authenticated
using (public.teacher_owns_cohort(cohort_id));

create policy phase_progress_student_read
on public.phase_progress
for select
to authenticated
using (
  exists (
    select 1
    from public.quest_attempts
    where quest_attempts.id = phase_progress.attempt_id
      and quest_attempts.student_id = auth.uid()
  )
);

create policy phase_progress_teacher_read
on public.phase_progress
for select
to authenticated
using (
  exists (
    select 1
    from public.quest_attempts
    where quest_attempts.id = phase_progress.attempt_id
      and public.teacher_owns_cohort(quest_attempts.cohort_id)
  )
);

create policy concept_evidence_student_read
on public.concept_evidence
for select
to authenticated
using (
  exists (
    select 1
    from public.quest_attempts
    where quest_attempts.id = concept_evidence.attempt_id
      and quest_attempts.student_id = auth.uid()
  )
);

create policy concept_evidence_teacher_read
on public.concept_evidence
for select
to authenticated
using (
  exists (
    select 1
    from public.quest_attempts
    where quest_attempts.id = concept_evidence.attempt_id
      and public.teacher_owns_cohort(quest_attempts.cohort_id)
  )
);

create policy student_responses_student_read
on public.student_responses
for select
to authenticated
using (student_id = auth.uid());

create policy student_responses_teacher_read
on public.student_responses
for select
to authenticated
using (
  exists (
    select 1
    from public.quest_attempts
    where quest_attempts.id = student_responses.attempt_id
      and public.teacher_owns_cohort(quest_attempts.cohort_id)
  )
);

comment on table public.quest_attempts is
  'Server-authoritative active phase, deadline, content version, and sequence.';
comment on table public.concept_evidence is
  'Separate diagnostic, mission, final, and retry evidence by concept.';
comment on table public.student_responses is
  'Immutable server-scored response records; browsers receive read-only access to their own rows.';
