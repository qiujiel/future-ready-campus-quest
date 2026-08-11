create or replace view private.teacher_review_responses
with (security_barrier = true)
as
select
  quest_attempts.cohort_id,
  student_private_profiles.group_id,
  student_responses.student_id,
  learning_items.item_key,
  learning_items.concept_id,
  student_responses.correct
from public.student_responses
join public.quest_attempts
  on quest_attempts.id = student_responses.attempt_id
join public.student_private_profiles
  on student_private_profiles.student_id = student_responses.student_id
  and student_private_profiles.cohort_id = quest_attempts.cohort_id
join content.learning_items
  on learning_items.id = student_responses.item_id
where student_responses.phase in ('diagnostic', 'final');

revoke all on private.teacher_review_responses
  from public, anon, authenticated;

create or replace function private.teacher_concept_focus(
  p_cohort_id uuid,
  p_group_id uuid default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with ranked as (
    select
      review.concept_id,
      count(distinct review.student_id) filter (
        where not review.correct
      )::integer as missed_students
    from private.teacher_review_responses as review
    where review.cohort_id = p_cohort_id
      and (p_group_id is null or review.group_id = p_group_id)
    group by review.concept_id
    having count(*) filter (where not review.correct) > 0
    order by
      count(distinct review.student_id) filter (
        where not review.correct
      ) desc,
      review.concept_id
    limit 1
  )
  select jsonb_build_object(
    'conceptId', ranked.concept_id,
    'missedStudents', ranked.missed_students,
    'studentCount', (
      select count(*)::integer
      from public.student_private_profiles as profiles
      where profiles.cohort_id = p_cohort_id
        and (p_group_id is null or profiles.group_id = p_group_id)
    ),
    'missedQuestions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'itemId', questions.item_key,
            'incorrectResponses', questions.incorrect_responses,
            'responses', questions.responses
          )
          order by
            questions.incorrect_responses desc,
            questions.item_key
        )
        from (
          select
            review.item_key,
            count(*) filter (
              where not review.correct
            )::integer as incorrect_responses,
            count(*)::integer as responses
          from private.teacher_review_responses as review
          where review.cohort_id = p_cohort_id
            and (p_group_id is null or review.group_id = p_group_id)
            and review.concept_id = ranked.concept_id
          group by review.item_key
          having count(*) filter (where not review.correct) > 0
        ) as questions
      ),
      '[]'::jsonb
    )
  )
  from ranked;
$$;

revoke all on function private.teacher_concept_focus(uuid, uuid)
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
        'enrolledMembers', team_scores.enrolled_members,
        'conceptFocus', private.teacher_concept_focus(
          p_cohort_id,
          team_scores.group_id
        )
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
    'classFocus', private.teacher_concept_focus(p_cohort_id),
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
  'Returns aggregate-only analytics, including class and team review focus, after a neutral teacher ownership check.';
