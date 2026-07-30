insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'group-images',
  'group-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

create table private.group_media_assets (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  object_path text not null unique,
  uploader_id uuid not null references auth.users(id) on delete restrict,
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  declared_size integer not null check (declared_size between 1 and 5242880),
  verified_size integer,
  width integer,
  height integer,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'replaced', 'removed', 'rejected')),
  request_key uuid not null,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (uploader_id, request_key)
);

create index group_media_assets_cohort_id_idx
  on private.group_media_assets (cohort_id);
create index group_media_assets_group_id_idx
  on private.group_media_assets (group_id);
create index group_media_assets_status_idx
  on private.group_media_assets (status);

alter table private.group_media_assets enable row level security;
alter table private.group_media_assets force row level security;

create or replace function public.authorize_group_media_upload(
  p_group_id uuid,
  p_mime_type text,
  p_declared_size integer,
  p_request_key uuid
)
returns table (
  cohort_id uuid,
  group_id uuid,
  object_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_asset private.group_media_assets;
  v_extension text;
  v_allowed boolean;
begin
  select *
  into v_asset
  from private.group_media_assets
  where uploader_id = auth.uid()
    and request_key = p_request_key;

  if found then
    return query select v_asset.cohort_id, v_asset.group_id, v_asset.object_path;
    return;
  end if;

  select *
  into v_group
  from public.groups
  where id = p_group_id
  for update;

  if not found then
    raise exception 'MEDIA_ACTION_DENIED' using errcode = '42501';
  end if;

  v_allowed :=
    public.teacher_owns_cohort(v_group.cohort_id)
    or (
      v_group.identity_editor_id = auth.uid()
      and public.student_in_group(v_group.id)
      and v_group.identity_locked_at is null
    );
  if not v_allowed then
    raise exception 'MEDIA_ACTION_DENIED' using errcode = '42501';
  end if;

  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'MEDIA_TYPE_REJECTED' using errcode = '22023';
  end if;
  if p_declared_size < 1 or p_declared_size > 5242880 then
    raise exception 'MEDIA_TOO_LARGE' using errcode = '22023';
  end if;

  v_extension := case p_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    else 'webp'
  end;

  insert into private.group_media_assets (
    cohort_id,
    group_id,
    object_path,
    uploader_id,
    mime_type,
    declared_size,
    request_key
  )
  values (
    v_group.cohort_id,
    v_group.id,
    v_group.cohort_id::text || '/' || v_group.id::text || '/' ||
      gen_random_uuid()::text || '.' || v_extension,
    auth.uid(),
    p_mime_type,
    p_declared_size,
    p_request_key
  )
  returning * into v_asset;

  insert into public.audit_events (
    actor_user_id,
    cohort_id,
    event_type,
    entity_id,
    request_key
  )
  values (
    auth.uid(),
    v_group.cohort_id,
    'group_media.prepared',
    v_asset.id,
    p_request_key
  );

  return query select v_asset.cohort_id, v_asset.group_id, v_asset.object_path;
end;
$$;

create or replace function public.finalize_group_media_upload(
  p_group_id uuid,
  p_object_path text,
  p_mime_type text,
  p_verified_size integer,
  p_width integer,
  p_height integer,
  p_request_key uuid
)
returns table (
  group_id uuid,
  group_number smallint,
  display_name text,
  image_object_path text,
  locked_at timestamptz,
  previous_object_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_asset private.group_media_assets;
  v_previous_path text;
  v_allowed boolean;
begin
  select *
  into v_group
  from public.groups
  where id = p_group_id
  for update;

  if not found then
    raise exception 'MEDIA_ACTION_DENIED' using errcode = '42501';
  end if;

  v_allowed :=
    public.teacher_owns_cohort(v_group.cohort_id)
    or (
      v_group.identity_editor_id = auth.uid()
      and public.student_in_group(v_group.id)
      and v_group.identity_locked_at is null
    );
  if not v_allowed then
    raise exception 'MEDIA_ACTION_DENIED' using errcode = '42501';
  end if;

  select *
  into v_asset
  from private.group_media_assets as media_assets
  where media_assets.group_id = p_group_id
    and media_assets.object_path = p_object_path
    and media_assets.uploader_id = auth.uid()
  for update;

  if not found or v_asset.status not in ('pending', 'approved') then
    raise exception 'MEDIA_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if p_mime_type <> v_asset.mime_type then
    raise exception 'MEDIA_SIGNATURE_MISMATCH' using errcode = '22023';
  end if;
  if p_verified_size < 1 or p_verified_size > 2097152 then
    raise exception 'MEDIA_TOO_LARGE' using errcode = '22023';
  end if;
  if p_width < 1 or p_width > 2048 or p_height < 1 or p_height > 2048 then
    raise exception 'MEDIA_DIMENSIONS_REJECTED' using errcode = '22023';
  end if;

  if v_asset.status = 'approved' then
    return query
    select
      groups.id,
      groups.group_number,
      groups.display_name,
      groups.image_object_path,
      groups.identity_locked_at,
      null::text
    from public.groups as groups
    where groups.id = v_group.id;
    return;
  end if;

  v_previous_path := v_group.image_object_path;

  update private.group_media_assets as media_assets
  set status = 'replaced'
  where media_assets.group_id = v_group.id
    and media_assets.status = 'approved'
    and media_assets.object_path <> p_object_path;

  update private.group_media_assets
  set
    verified_size = p_verified_size,
    width = p_width,
    height = p_height,
    status = 'approved',
    verified_at = now()
  where id = v_asset.id;

  update public.groups
  set image_object_path = p_object_path
  where id = v_group.id;

  insert into public.audit_events (
    actor_user_id,
    cohort_id,
    event_type,
    entity_id,
    request_key
  )
  values (
    auth.uid(),
    v_group.cohort_id,
    'group_media.approved',
    v_asset.id,
    p_request_key
  )
  on conflict (actor_user_id, event_type, request_key) do nothing;

  return query
  select
    groups.id,
    groups.group_number,
    groups.display_name,
    groups.image_object_path,
    groups.identity_locked_at,
    v_previous_path
  from public.groups as groups
  where groups.id = v_group.id;
end;
$$;

create or replace function public.authorize_group_media_finalize(
  p_group_id uuid,
  p_object_path text
)
returns table (object_path text, mime_type text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_asset private.group_media_assets;
  v_allowed boolean;
begin
  select *
  into v_group
  from public.groups
  where id = p_group_id;

  if not found then
    raise exception 'MEDIA_ACTION_DENIED' using errcode = '42501';
  end if;

  v_allowed :=
    public.teacher_owns_cohort(v_group.cohort_id)
    or (
      v_group.identity_editor_id = auth.uid()
      and public.student_in_group(v_group.id)
      and v_group.identity_locked_at is null
    );
  if not v_allowed then
    raise exception 'MEDIA_ACTION_DENIED' using errcode = '42501';
  end if;

  select *
  into v_asset
  from private.group_media_assets as assets
  where assets.group_id = p_group_id
    and assets.object_path = p_object_path
    and assets.uploader_id = auth.uid()
    and assets.status = 'pending';

  if not found then
    raise exception 'MEDIA_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  return query select v_asset.object_path, v_asset.mime_type;
end;
$$;

create or replace function public.authorize_group_media_read(p_group_id uuid)
returns table (object_path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
begin
  select *
  into v_group
  from public.groups
  where id = p_group_id;

  if not found
    or v_group.image_object_path is null
    or (
      not public.teacher_owns_cohort(v_group.cohort_id)
      and not public.student_in_cohort(v_group.cohort_id)
    )
  then
    raise exception 'MEDIA_ACTION_DENIED' using errcode = '42501';
  end if;

  return query select v_group.image_object_path;
end;
$$;

create or replace function public.authorize_group_media_removal(p_group_id uuid)
returns table (object_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
begin
  select *
  into v_group
  from public.groups
  where id = p_group_id;

  if not found
    or v_group.image_object_path is null
    or not public.teacher_owns_cohort(v_group.cohort_id)
  then
    raise exception 'MEDIA_ACTION_DENIED' using errcode = '42501';
  end if;

  return query select v_group.image_object_path;
end;
$$;

create or replace function public.finalize_group_media_removal(
  p_group_id uuid,
  p_object_path text,
  p_request_key uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
begin
  select *
  into v_group
  from public.groups
  where id = p_group_id
  for update;

  if not found
    or not public.teacher_owns_cohort(v_group.cohort_id)
    or v_group.image_object_path is distinct from p_object_path
  then
    raise exception 'MEDIA_ACTION_DENIED' using errcode = '42501';
  end if;

  update public.groups set image_object_path = null where id = v_group.id;
  update private.group_media_assets
  set status = 'removed'
  where group_id = v_group.id
    and object_path = p_object_path
    and status = 'approved';

  insert into public.audit_events (
    actor_user_id,
    cohort_id,
    event_type,
    entity_id,
    request_key
  )
  values (
    auth.uid(),
    v_group.cohort_id,
    'group_media.removed',
    v_group.id,
    p_request_key
  )
  on conflict (actor_user_id, event_type, request_key) do nothing;

end;
$$;

create or replace function public.reject_group_media_upload(
  p_group_id uuid,
  p_object_path text
)
returns table (object_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset private.group_media_assets;
begin
  select *
  into v_asset
  from private.group_media_assets as assets
  where assets.group_id = p_group_id
    and assets.object_path = p_object_path
    and assets.uploader_id = auth.uid()
    and assets.status = 'pending'
  for update;

  if not found then
    raise exception 'MEDIA_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  update private.group_media_assets
  set status = 'rejected', verified_at = now()
  where id = v_asset.id
    and status = 'pending';

  return query select v_asset.object_path;
end;
$$;

revoke all on function public.authorize_group_media_upload(
  uuid,
  text,
  integer,
  uuid
) from public;
revoke all on function public.finalize_group_media_upload(
  uuid,
  text,
  text,
  integer,
  integer,
  integer,
  uuid
) from public;
revoke all on function public.authorize_group_media_finalize(uuid, text)
  from public;
revoke all on function public.authorize_group_media_read(uuid) from public;
revoke all on function public.authorize_group_media_removal(uuid) from public;
revoke all on function public.finalize_group_media_removal(uuid, text, uuid)
  from public;
revoke all on function public.reject_group_media_upload(uuid, text) from public;

grant execute on function public.authorize_group_media_upload(
  uuid,
  text,
  integer,
  uuid
) to authenticated;
grant execute on function public.finalize_group_media_upload(
  uuid,
  text,
  text,
  integer,
  integer,
  integer,
  uuid
) to authenticated;
grant execute on function public.authorize_group_media_finalize(uuid, text)
  to authenticated;
grant execute on function public.authorize_group_media_read(uuid)
  to authenticated;
grant execute on function public.authorize_group_media_removal(uuid)
  to authenticated;
grant execute on function public.finalize_group_media_removal(uuid, text, uuid)
  to authenticated;
grant execute on function public.reject_group_media_upload(uuid, text)
  to authenticated;
