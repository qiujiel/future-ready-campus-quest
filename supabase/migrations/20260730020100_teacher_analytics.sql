create or replace view private.teacher_concept_aggregates
with (security_barrier = true)
as
select
  quest_attempts.cohort_id,
  concept_evidence.concept_id,
  concept_evidence.phase,
  count(*) filter (
    where concept_evidence.support_state = 'needs_support'
  )::integer as needs_support_count,
  count(*) filter (
    where concept_evidence.support_state = 'developing'
  )::integer as developing_count,
  count(*) filter (
    where concept_evidence.support_state = 'secure'
  )::integer as secure_count,
  coalesce(sum(concept_evidence.correct_count), 0)::integer
    as correct_count,
  coalesce(sum(concept_evidence.total_count), 0)::integer
    as total_count
from public.concept_evidence
join public.quest_attempts
  on quest_attempts.id = concept_evidence.attempt_id
group by
  quest_attempts.cohort_id,
  concept_evidence.concept_id,
  concept_evidence.phase;

create or replace view private.teacher_missed_items
with (security_barrier = true)
as
select
  quest_attempts.cohort_id,
  learning_items.id as item_id,
  learning_items.concept_id,
  learning_items.item_key || ' ' || learning_items.form as short_label,
  count(*) filter (
    where not student_responses.correct
  )::integer as incorrect_count,
  count(*)::integer as response_count
from public.student_responses
join public.quest_attempts
  on quest_attempts.id = student_responses.attempt_id
join content.learning_items
  on learning_items.id = student_responses.item_id
where student_responses.phase in ('diagnostic', 'final')
group by
  quest_attempts.cohort_id,
  learning_items.id,
  learning_items.concept_id,
  learning_items.item_key,
  learning_items.form;

create or replace view private.teacher_misconception_counts
with (security_barrier = true)
as
select
  quest_attempts.cohort_id,
  student_responses.item_id,
  student_responses.misconception_tag as tag,
  count(*)::integer as misconception_count
from public.student_responses
join public.quest_attempts
  on quest_attempts.id = student_responses.attempt_id
where student_responses.misconception_tag is not null
  and not student_responses.correct
  and student_responses.phase in ('diagnostic', 'final')
group by
  quest_attempts.cohort_id,
  student_responses.item_id,
  student_responses.misconception_tag;

create or replace view private.teacher_team_scores
with (security_barrier = true)
as
select
  groups.cohort_id,
  groups.id as group_id,
  groups.group_number,
  groups.display_name,
  team_score_snapshots.team_score,
  coalesce(team_score_snapshots.completed_member_count, 0)::integer
    as completed_members,
  count(distinct student_private_profiles.student_id)::integer
    as enrolled_members
from public.groups
left join public.student_private_profiles
  on student_private_profiles.group_id = groups.id
left join public.team_score_snapshots
  on team_score_snapshots.cohort_id = groups.cohort_id
  and team_score_snapshots.group_id = groups.id
group by
  groups.cohort_id,
  groups.id,
  groups.group_number,
  groups.display_name,
  team_score_snapshots.team_score,
  team_score_snapshots.completed_member_count;

revoke all on private.teacher_concept_aggregates
  from public, anon, authenticated;
revoke all on private.teacher_missed_items
  from public, anon, authenticated;
revoke all on private.teacher_misconception_counts
  from public, anon, authenticated;
revoke all on private.teacher_team_scores
  from public, anon, authenticated;

create or replace function public.get_teacher_dashboard_summary(
  p_cohort_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enrolled integer;
  v_active integer;
  v_completed integer;
  v_concepts jsonb;
  v_most_missed jsonb;
  v_team_scores jsonb;
begin
  if not public.teacher_owns_cohort(p_cohort_id) then
    raise exception using
      errcode = 'P0001',
      message = 'COHORT_NOT_AVAILABLE';
  end if;

  select count(*)::integer
  into v_enrolled
  from public.student_private_profiles
  where cohort_id = p_cohort_id;

  select count(distinct student_id)::integer
  into v_active
  from public.quest_attempts
  where cohort_id = p_cohort_id
    and status = 'active';

  select count(distinct student_id)::integer
  into v_completed
  from public.quest_results
  where cohort_id = p_cohort_id;

  select jsonb_agg(
    jsonb_build_object(
      'conceptId', concepts.concept_id,
      'first', jsonb_build_object(
        'needs_support',
          coalesce(diagnostic.needs_support_count, 0),
        'developing',
          coalesce(diagnostic.developing_count, 0),
        'secure',
          coalesce(diagnostic.secure_count, 0)
      ),
      'final', jsonb_build_object(
        'needs_support',
          coalesce(final.needs_support_count, 0),
        'developing',
          coalesce(final.developing_count, 0),
        'secure',
          coalesce(final.secure_count, 0)
      ),
      'retryCorrect', coalesce(retry.correct_count, 0),
      'retryAttempted', coalesce(retry.total_count, 0)
    )
    order by concepts.concept_number
  )
  into v_concepts
  from (
    select
      concept_number,
      'C' || concept_number::text as concept_id
    from generate_series(1, 8) as concept_number
  ) as concepts
  left join private.teacher_concept_aggregates as diagnostic
    on diagnostic.cohort_id = p_cohort_id
    and diagnostic.concept_id = concepts.concept_id
    and diagnostic.phase = 'diagnostic'
  left join private.teacher_concept_aggregates as final
    on final.cohort_id = p_cohort_id
    and final.concept_id = concepts.concept_id
    and final.phase = 'final'
  left join private.teacher_concept_aggregates as retry
    on retry.cohort_id = p_cohort_id
    and retry.concept_id = concepts.concept_id
    and retry.phase = 'retry';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'itemId', ranked.item_id,
        'conceptId', ranked.concept_id,
        'shortLabel', ranked.short_label,
        'incorrectCount', ranked.incorrect_count,
        'responseCount', ranked.response_count,
        'misconceptionTags', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'tag', misconception.tag,
                'count', misconception.misconception_count
              )
              order by
                misconception.misconception_count desc,
                misconception.tag
            )
            from private.teacher_misconception_counts
              as misconception
            where misconception.cohort_id = p_cohort_id
              and misconception.item_id = ranked.item_id
          ),
          '[]'::jsonb
        )
      )
      order by
        ranked.incorrect_count desc,
        ranked.concept_id,
        ranked.item_id
    ),
    '[]'::jsonb
  )
  into v_most_missed
  from (
    select *
    from private.teacher_missed_items
    where cohort_id = p_cohort_id
      and incorrect_count > 0
    order by incorrect_count desc, concept_id, item_id
    limit 5
  ) as ranked;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'groupId', team_scores.group_id,
        'groupNumber', team_scores.group_number,
        'displayName', team_scores.display_name,
        'score', team_scores.team_score,
        'completedMembers', team_scores.completed_members,
        'enrolledMembers', team_scores.enrolled_members
      )
      order by
        team_scores.team_score desc nulls last,
        team_scores.group_number
    ),
    '[]'::jsonb
  )
  into v_team_scores
  from private.teacher_team_scores as team_scores
  where team_scores.cohort_id = p_cohort_id;

  return jsonb_build_object(
    'cohortId', p_cohort_id,
    'enrolled', v_enrolled,
    'active', v_active,
    'completed', v_completed,
    'conceptAggregates', v_concepts,
    'mostMissed', v_most_missed,
    'teamScores', v_team_scores,
    'generatedAt', to_jsonb(clock_timestamp())
  );
end;
$$;

revoke all on function public.get_teacher_dashboard_summary(uuid)
  from public;
grant execute on function public.get_teacher_dashboard_summary(uuid)
  to authenticated;

comment on function public.get_teacher_dashboard_summary(uuid) is
  'Returns aggregate-only analytics after a neutral teacher ownership check.';
