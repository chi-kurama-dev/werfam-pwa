-- Migration applied to official Supabase project as werfam_optin_parent_location_and_child_family_snapshot
-- Parent location is opt-in. Children may see a sharing parent only in their own family.
create or replace function public.set_parent_tracking_enabled(p_enabled boolean,p_device_token text)
returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid:=auth.uid();
begin
 if p_device_token is null or p_device_token !~ '^[a-f0-9]{64}$'
    or not exists (
      select 1 from public.profiles p join public.families f on f.owner_id=p.id
      join public.parent_devices d on d.parent_id=p.id
      where p.id=v_id and p.role='parent'
        and d.token_sha256=encode(sha256(convert_to(p_device_token,'UTF8')),'hex')
    ) then raise exception 'Only a registered parent can control parent location sharing'; end if;
 insert into public.location_latest(user_id,enabled,latitude,longitude,accuracy_m,heading,speed_mps,updated_at)
 values(v_id,coalesce(p_enabled,false),null,null,null,null,null,now())
 on conflict(user_id) do update set enabled=excluded.enabled,latitude=null,longitude=null,
 accuracy_m=null,heading=null,speed_mps=null,updated_at=now();
end;$$;

create or replace function public.publish_parent_location(
 p_lat double precision,p_lng double precision,p_accuracy double precision,
 p_heading double precision default null,p_speed double precision default null,p_device_token text default null
)
returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid:=auth.uid();
begin
 if p_device_token is null or p_device_token !~ '^[a-f0-9]{64}$'
   or p_lat is null or p_lat not between -90 and 90
   or p_lng is null or p_lng not between -180 and 180
   or p_accuracy is null or p_accuracy not between 0 and 100000 then
   raise exception 'Invalid GPS coordinates or parent device credential'; end if;
 if not exists(
   select 1 from public.parent_devices d
   join public.profiles p on p.id=d.parent_id
   join public.families f on f.owner_id=p.id
   where d.parent_id=v_id and p.role='parent'
   and d.token_sha256=encode(sha256(convert_to(p_device_token,'UTF8')),'hex')
 ) then raise exception 'Unauthorized parent device'; end if;
 update public.location_latest set latitude=p_lat,longitude=p_lng,accuracy_m=p_accuracy,
 heading=p_heading,speed_mps=p_speed,updated_at=now()
 where user_id=v_id and enabled=true;
 if not found then raise exception 'Parent location sharing is off'; end if;
end;$$;

create or replace function public.child_family_snapshot(p_device_token text)
returns table (
 user_id uuid,relation text,full_name text,avatar_url text,enabled boolean,
 latitude double precision,longitude double precision,
 accuracy_m double precision,updated_at timestamptz
)
language sql stable security definer set search_path='' as $$
 with authorized_family as (
   select fm.family_id from public.family_members fm
   join public.child_devices d on d.child_id=fm.user_id
   where fm.user_id=(select auth.uid())
    and p_device_token ~ '^[a-f0-9]{64}$'
    and d.token_sha256=encode(sha256(convert_to(p_device_token,'UTF8')),'hex')
 )
 select m.user_id,m.relation,p.full_name,p.avatar_url,
    coalesce(l.enabled,false),l.latitude,l.longitude,l.accuracy_m,l.updated_at
 from authorized_family af
 join public.family_members m on m.family_id=af.family_id
 join public.profiles p on p.id=m.user_id
 left join public.location_latest l on l.user_id=m.user_id and l.enabled
 union all
 select f.owner_id,'parent'::text,p.full_name,p.avatar_url,
    coalesce(l.enabled,false),l.latitude,l.longitude,l.accuracy_m,l.updated_at
 from authorized_family af
 join public.families f on f.id=af.family_id
 join public.profiles p on p.id=f.owner_id
 left join public.location_latest l on l.user_id=f.owner_id and l.enabled
 where not exists(select 1 from public.family_members fm
                  where fm.family_id=f.id and fm.user_id=f.owner_id);
$$;

revoke all on function public.set_parent_tracking_enabled(boolean,text),
 public.publish_parent_location(double precision,double precision,double precision,double precision,double precision,text)
 from public,anon,authenticated;
grant execute on function public.set_parent_tracking_enabled(boolean,text),
 public.publish_parent_location(double precision,double precision,double precision,double precision,double precision,text)
 to authenticated;

