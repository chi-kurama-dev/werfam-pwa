-- weRfam v0.3: authenticated, device-bound family roster and permitted location snapshot.
-- Applied to the official Supabase project via migration werfam_child_family_snapshot.
-- Returns members ONLY of the signed-in child's own family and ONLY latest enabled coordinates.
create or replace function public.child_family_snapshot(p_device_token text)
returns table (
  user_id uuid, relation text, full_name text, avatar_url text,
  enabled boolean, latitude double precision, longitude double precision,
  accuracy_m double precision, updated_at timestamptz
)
language sql stable security definer set search_path=''
as $$
  select m.user_id, m.relation, p.full_name, p.avatar_url,
    coalesce(l.enabled,false), l.latitude, l.longitude, l.accuracy_m, l.updated_at
  from public.family_members m
  join public.profiles p on p.id=m.user_id
  left join public.location_latest l on l.user_id=m.user_id and l.enabled
  where exists (
    select 1
    from public.family_members mine
    join public.child_devices d on d.child_id=mine.user_id
    where mine.user_id=(select auth.uid())
      and mine.family_id=m.family_id
      and p_device_token ~ '^[a-f0-9]{64}$'
      and d.token_sha256=encode(sha256(convert_to(p_device_token,'UTF8')),'hex')
  );
$$;

revoke all on function public.child_family_snapshot(text) from public,anon;
grant execute on function public.child_family_snapshot(text) to authenticated;
