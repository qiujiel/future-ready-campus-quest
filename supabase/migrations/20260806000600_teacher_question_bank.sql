create or replace function public.get_teacher_question_bank(
  p_cohort_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content_version_id uuid;
  v_result jsonb;
begin
  if not public.teacher_owns_cohort(p_cohort_id) then
    raise exception 'COHORT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select launches.content_version_id
  into v_content_version_id
  from public.cohort_quest_launches as launches
  where launches.cohort_id = p_cohort_id;

  if v_content_version_id is null then
    select versions.id
    into v_content_version_id
    from content.content_versions as versions
    where versions.item_count = 24
      and versions.concept_count = 8
      and (
        select count(*)
        from content.learning_items as items
        where items.version_id = versions.id
      ) = 24
    order by versions.imported_at desc, versions.id desc
    limit 1;
  end if;

  if v_content_version_id is null then
    raise exception 'CONTENT_NOT_READY' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'versionKey', versions.version_key,
    'itemCount', versions.item_count,
    'conceptCount', versions.concept_count,
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'itemId', items.item_key,
          'conceptId', items.concept_id,
          'form', items.form,
          'stem', items.stem,
          'interaction', items.interaction_payload - array[
            'correctOptionIds',
            'correctOrderIds',
            'correctCategoryByPrompt'
          ],
          'correctResponse', items.correct_response,
          'rationale', items.rationale,
          'sourcePageLabels', coalesce(
            (
              select jsonb_agg(
                source_refs.source_document || ' p. ' ||
                  source_refs.page_start::text ||
                  case
                    when source_refs.page_end is not null
                      and source_refs.page_end <> source_refs.page_start
                    then '–' || source_refs.page_end::text
                    else ''
                  end
                order by source_refs.source_document, source_refs.page_start
              )
              from content.item_source_refs as source_refs
              where source_refs.item_id = items.id
            ),
            '[]'::jsonb
          )
        )
        order by items.concept_id, items.item_key
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from content.content_versions as versions
  join content.learning_items as items
    on items.version_id = versions.id
  where versions.id = v_content_version_id
  group by versions.id, versions.version_key,
    versions.item_count, versions.concept_count;

  if v_result is null
    or jsonb_array_length(v_result->'items') <> 24
  then
    raise exception 'CONTENT_NOT_READY' using errcode = 'P0001';
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_teacher_question_bank(uuid)
  from public, anon;
grant execute on function public.get_teacher_question_bank(uuid)
  to authenticated;

comment on function public.get_teacher_question_bank(uuid) is
  'Returns the complete launched content bank only to the owning teacher.';
