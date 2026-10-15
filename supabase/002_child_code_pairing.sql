-- Supabase migration: werfam_child_code_only_device_pairing

-- weRfam v0.2: One-device code-only child access and required profile completion.
alter table public.profiles add column if not exists profile_completed boolean not null default true;

create table if not exists public.parent_devices (
  parent_id uuid not null references public.profiles(id) on delete cascade,
  token_sha256 text not null,
  created_at timestamptz not null default now(),
  primary key(parent_id, token_sha256)
);
create index if not exists parent_devices_token_idx on public.parent_devices(token_sha256);

create table if not exists public.child_devices (
  child_id uuid primary key references public.profiles(id) on delete cascade,
  token_sha256 text not null,
  paired_at timestamptz not null default now()
);
create index if not exists child_devices_token_idx on public.child_devices(token_sha256);

create table if not exists public.child_code_attempts (
  source_hash text primary key,
  attempts integer not null default 0,
  reset_at timestamptz not null default (now() + interval '15 minutes')
);

alter table public.parent_devices enable row level security;
alter table public.child_devices enable row level security;
alter table public.child_code_attempts enable row level security;
revoke all on public.parent_devices,public.child_devices,public.child_code_attempts from public,anon,authenticated;

create or replace function public.register_parent_device(p_device_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
 if p_device_token is null or p_device_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid device binding'; end if;
 if not exists (select 1 from public.profiles where id=auth.uid() and role='parent') then raise exception 'Parent account required'; end if;
 v_hash := encode(sha256(convert_to(p_device_token,'UTF8')),'hex');
 if exists (select 1 from public.child_devices where token_sha256=v_hash) then
   raise exception 'This browser is already paired as a child. Use the parent''s separate device.';
 end if;
 insert into public.parent_devices(parent_id,token_sha256) values(auth.uid(),v_hash) on conflict do nothing;
end;$$;

create or replace function public.rate_limit_child_code(p_source_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_attempts integer;
begin
 if p_source_hash is null or p_source_hash !~ '^[a-f0-9]{64}$' then return false; end if;
 insert into public.child_code_attempts(source_hash,attempts,reset_at)
 values(p_source_hash,1,now()+interval '15 minutes')
 on conflict(source_hash) do update set
 attempts=case when public.child_code_attempts.reset_at<=now() then 1 else public.child_code_attempts.attempts+1 end,
 reset_at=case when public.child_code_attempts.reset_at<=now() then now()+interval '15 minutes' else public.child_code_attempts.reset_at end
 returning attempts into v_attempts;
 return v_attempts<=8;
end;$$;

-- This RPC is service-role only. It atomically consumes the code, binds the child browser,
-- and forces the child to complete their profile before using GPS controls.
create or replace function public.claim_child_code(
 p_code text,p_child_id uuid,p_device_token text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_invite public.child_invites%rowtype;v_hash text;
begin
 if p_device_token is null or p_device_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid device token'; end if;
 v_hash:=encode(sha256(convert_to(p_device_token,'UTF8')),'hex');
 if exists(select 1 from public.parent_devices where token_sha256=v_hash) then raise exception 'Use a different browser/device from the parent'; end if;
 select * into v_invite from public.child_invites
  where code=upper(trim(p_code)) and used_by is null and expires_at>now() for update;
 if not found then raise exception 'Invalid or expired invitation'; end if;
 if not exists(select 1 from public.profiles where id=p_child_id and role='child') then raise exception 'Invalid child account'; end if;
 if exists(select 1 from public.family_members where user_id=p_child_id) then raise exception 'Child already paired'; end if;
 insert into public.family_members(family_id,user_id,relation)
 values(v_invite.family_id,p_child_id,v_invite.relation);
 insert into public.child_devices(child_id,token_sha256) values(p_child_id,v_hash);
 update public.profiles set profile_completed=false where id=p_child_id;
 update public.child_invites set used_by=p_child_id,used_at=now() where id=v_invite.id;
 return v_invite.family_id;
end;$$;

create or replace function public.complete_child_profile(p_full_name text,p_device_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if p_full_name is null or length(trim(p_full_name))<2 or length(trim(p_full_name))>80 then
   raise exception 'Please enter your full name (2-80 characters)';
 end if;
 if p_device_token is null or p_device_token !~ '^[a-f0-9]{64}$' then raise exception 'Device binding missing'; end if;
 if not exists(select 1 from public.child_devices
   where child_id=auth.uid() and token_sha256=encode(sha256(convert_to(p_device_token,'UTF8')),'hex')
 ) then raise exception 'This child account belongs to another paired browser'; end if;
 if not exists(select 1 from public.family_members where user_id=auth.uid()) then raise exception 'Child is not linked to a family'; end if;
 update public.profiles set full_name=trim(p_full_name),profile_completed=true
 where id=auth.uid() and role='child';
 if not found then raise exception 'Child account required'; end if;
end;$$;

-- Existing code generation now issues a longer 16-character secret.
create or replace function public.create_child_invite(p_name text,p_relation text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_family uuid; v_code text;
begin
 select id into v_family from public.families where owner_id=auth.uid();
 if v_family is null then raise exception 'Create your parent family first.'; end if;
 if p_relation not in ('son','daughter') then raise exception 'Invalid relationship'; end if;
 if char_length(trim(coalesce(p_name,''))) not between 2 and 80 then raise exception 'Enter the child full name'; end if;
 v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
 insert into public.child_invites(family_id,parent_id,child_name,relation,code)
 values(v_family,auth.uid(),trim(p_name),p_relation,v_code);
 return v_code;
end;$$;

-- Delete the old unauthenticated-by-device GPS RPC signatures to avoid a bypass.
drop function if exists public.set_tracking_enabled(boolean);
drop function if exists public.publish_location(double precision,double precision,double precision,double precision,double precision);

create or replace function public.set_tracking_enabled(p_enabled boolean,p_device_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if p_device_token is null or p_device_token !~ '^[a-f0-9]{64}$' then raise exception 'Device binding missing'; end if;
 if not exists(
   select 1 from public.profiles p
   join public.family_members m on m.user_id=p.id
   join public.child_devices d on d.child_id=p.id
   where p.id=auth.uid() and p.role='child' and p.profile_completed=true
     and d.token_sha256=encode(sha256(convert_to(p_device_token,'UTF8')),'hex')
 ) then raise exception 'Finish profile setup on the paired device before sharing GPS'; end if;
 insert into public.location_latest(user_id,enabled,latitude,longitude,accuracy_m,heading,speed_mps,updated_at)
 values(auth.uid(),coalesce(p_enabled,false),null,null,null,null,null,now())
 on conflict(user_id) do update set enabled=excluded.enabled,latitude=null,longitude=null,
 accuracy_m=null,heading=null,speed_mps=null,updated_at=now();
end;$$;

create or replace function public.publish_location(
 p_lat double precision,p_lng double precision,p_accuracy double precision,
 p_heading double precision default null,p_speed double precision default null,p_device_token text default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if p_device_token is null or p_device_token !~ '^[a-f0-9]{64}$' then raise exception 'Device binding missing'; end if;
 if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180
 or p_accuracy is null or p_accuracy<0 or p_accuracy>100000 then raise exception 'Invalid GPS coordinates'; end if;
 if not exists(select 1 from public.child_devices d join public.profiles p on p.id=d.child_id
 where d.child_id=auth.uid() and p.role='child' and p.profile_completed
 and d.token_sha256=encode(sha256(convert_to(p_device_token,'UTF8')),'hex')) then
 raise exception 'This device is not authorized for child GPS'; end if;
 update public.location_latest set latitude=p_lat,longitude=p_lng,accuracy_m=p_accuracy,
 heading=p_heading,speed_mps=p_speed,updated_at=now()
 where user_id=auth.uid() and enabled=true
 and exists(select 1 from public.family_members where user_id=auth.uid());
 if not found then raise exception 'Location sharing is off or child not linked'; end if;
end;$$;

-- A legacy child account must not be able to redeem a new code directly,
-- avoiding bypass of the code-only device-pairing flow.
revoke all on function public.redeem_child_invite(text) from public,anon,authenticated;
revoke all on function public.register_parent_device(text),
  public.rate_limit_child_code(text),public.claim_child_code(text,uuid,text),
  public.complete_child_profile(text,text),public.set_tracking_enabled(boolean,text),
  public.publish_location(double precision,double precision,double precision,double precision,double precision,text)
  from public,anon,authenticated;
grant execute on function public.register_parent_device(text),
 public.complete_child_profile(text,text),public.set_tracking_enabled(boolean,text),
 public.publish_location(double precision,double precision,double precision,double precision,double precision,text)
 to authenticated;
grant execute on function public.rate_limit_child_code(text),
 public.claim_child_code(text,uuid,text) to service_role;

