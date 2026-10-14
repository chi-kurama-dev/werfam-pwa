-- weRfam v0.1 - execute once in YOUR Supabase SQL editor.
-- This app intentionally keeps only the latest shared GPS coordinates (no route history).
-- Auth: email + password with email confirmation recommended.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  role text not null check (role in ('parent','child')),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 55),
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  relation text not null check (relation in ('son','daughter')),
  joined_at timestamptz not null default now(),
  unique(family_id, user_id)
);

create table if not exists public.child_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  parent_id uuid not null references public.profiles(id) on delete cascade,
  child_name text not null check (char_length(child_name) between 2 and 80),
  relation text not null check (relation in ('son','daughter')),
  code text not null unique,
  expires_at timestamptz not null default (now() + interval '14 days'),
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists child_invites_family_idx on public.child_invites(family_id);
create index if not exists family_members_family_idx on public.family_members(family_id);

create table if not exists public.location_latest (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  heading double precision,
  speed_mps double precision,
  updated_at timestamptz not null default now(),
  constraint latitude_valid check (latitude is null or latitude between -90 and 90),
  constraint longitude_valid check (longitude is null or longitude between -180 and 180),
  constraint accuracy_valid check (accuracy_m is null or accuracy_m between 0 and 100000)
);

-- Only the Auth trigger can create profiles; browser clients never get write privileges.
create or replace function public.new_user_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name,role)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),split_part(new.email,'@',1)),80),
    case when new.raw_user_meta_data->>'role'='parent' then 'parent' else 'child' end
  );
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_werfam on auth.users;
create trigger on_auth_user_created_werfam after insert on auth.users
for each row execute function public.new_user_profile();

-- Owner check executed with definer rights to avoid recursive RLS checks.
create or replace function public.is_family_owner(p_family uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.families where id=p_family and owner_id=(select auth.uid()));
$$;

create or replace function public.can_view_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) = p_user
  or exists (
    select 1 from public.family_members m
    join public.families f on f.id=m.family_id
    where m.user_id=p_user and f.owner_id=(select auth.uid())
  )
  or exists (
    select 1 from public.family_members m
    join public.families f on f.id=m.family_id
    where m.user_id=(select auth.uid()) and f.owner_id=p_user
  );
$$;

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.child_invites enable row level security;
alter table public.location_latest enable row level security;

-- Authenticated clients only read records that belong to their family.
drop policy if exists profiles_read_family on public.profiles;
create policy profiles_read_family on public.profiles for select to authenticated using (public.can_view_profile(id));

drop policy if exists families_read_own on public.families;
create policy families_read_own on public.families for select to authenticated using (
  owner_id=(select auth.uid())
  or exists(select 1 from public.family_members m where m.family_id=id and m.user_id=(select auth.uid()))
);

drop policy if exists memberships_read on public.family_members;
create policy memberships_read on public.family_members for select to authenticated using (
  user_id=(select auth.uid()) or public.is_family_owner(family_id)
);

drop policy if exists invites_owner_read on public.child_invites;
create policy invites_owner_read on public.child_invites for select to authenticated using (
  parent_id=(select auth.uid()) and public.is_family_owner(family_id)
);

drop policy if exists locations_family_read on public.location_latest;
create policy locations_family_read on public.location_latest for select to authenticated using (
  user_id=(select auth.uid())
  or exists (
    select 1 from public.family_members fm
    where fm.user_id=location_latest.user_id
    and public.is_family_owner(fm.family_id)
  )
);

-- Privileged operations with server-side authorization and validation.
create or replace function public.create_family(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='parent') then
    raise exception 'Only registered parent accounts can create a family.';
  end if;
  insert into public.families(owner_id,name)
  values(auth.uid(),trim(p_name)) returning id into v_id;
  return v_id;
end;$$;

create or replace function public.create_child_invite(p_name text,p_relation text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_family uuid; v_code text;
begin
  select id into v_family from public.families where owner_id=auth.uid();
  if v_family is null then raise exception 'Create your parent family first.'; end if;
  if p_relation not in ('son','daughter') then raise exception 'Invalid relationship.'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 80 then raise exception 'Enter the child full name.'; end if;
  v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)); -- 48-bit, single-use code
  insert into public.child_invites(family_id,parent_id,child_name,relation,code)
  values(v_family,auth.uid(),trim(p_name),p_relation,v_code);
  return v_code;
end;$$;

create or replace function public.redeem_child_invite(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_invite public.child_invites%rowtype;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='child') then
    raise exception 'Sign in using a child account.';
  end if;
  if exists(select 1 from public.family_members where user_id=auth.uid()) then
    raise exception 'This account is already linked to a family.';
  end if;
  select * into v_invite from public.child_invites
  where code=upper(trim(p_code)) and used_by is null and expires_at > now() for update;
  if not found then raise exception 'Invalid, expired, or already used invitation code.'; end if;
  insert into public.family_members(family_id,user_id,relation)
  values(v_invite.family_id,auth.uid(),v_invite.relation);
  update public.child_invites set used_by=auth.uid(),used_at=now() where id=v_invite.id;
  return v_invite.family_id;
end;$$;

create or replace function public.set_tracking_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(
    select 1 from public.profiles p join public.family_members m on m.user_id=p.id
    where p.id=auth.uid() and p.role='child'
  ) then raise exception 'Only linked child accounts can share their location.'; end if;
  -- Clear coordinates when disabling OR beginning a new tracking session.
  insert into public.location_latest(user_id,enabled,latitude,longitude,accuracy_m,heading,speed_mps,updated_at)
  values(auth.uid(),coalesce(p_enabled,false),null,null,null,null,null,now())
  on conflict(user_id) do update set
    enabled=excluded.enabled,latitude=null,longitude=null,accuracy_m=null,
    heading=null,speed_mps=null,updated_at=now();
end;$$;

create or replace function public.publish_location(
  p_lat double precision,p_lng double precision,p_accuracy double precision,
  p_heading double precision default null,p_speed double precision default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180
     or not (p_accuracy between 0 and 100000)
  then raise exception 'Invalid GPS coordinates.'; end if;
  update public.location_latest set latitude=p_lat,longitude=p_lng,accuracy_m=p_accuracy,
    heading=p_heading,speed_mps=p_speed,updated_at=now()
  where user_id=auth.uid() and enabled=true
    and exists(select 1 from public.family_members where user_id=auth.uid());
  if not found then raise exception 'Location sharing is off or this child is not linked.'; end if;
end;$$;

-- Anonymous and direct client writes are deliberately prohibited.
revoke all on public.profiles,public.families,public.family_members,public.child_invites,public.location_latest from anon,authenticated;
grant select on public.profiles,public.families,public.family_members,public.child_invites,public.location_latest to authenticated;
revoke all on function public.create_family(text),public.create_child_invite(text,text),public.redeem_child_invite(text),public.set_tracking_enabled(boolean),public.publish_location(double precision,double precision,double precision,double precision,double precision),public.is_family_owner(uuid),public.can_view_profile(uuid) from public,anon;
grant execute on function public.create_family(text),public.create_child_invite(text,text),public.redeem_child_invite(text),public.set_tracking_enabled(boolean),public.publish_location(double precision,double precision,double precision,double precision,double precision),public.is_family_owner(uuid),public.can_view_profile(uuid) to authenticated;

-- Allow RLS-filtered realtime notifications. Existing publication may already include these.
do $$ begin
  begin alter publication supabase_realtime add table public.location_latest; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.family_members; exception when duplicate_object then null; end;
end $$;
