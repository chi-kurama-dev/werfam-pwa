-- weRfam v0.4 — Supabase family chat and parent-only child unlink
-- Applied to production via migration: werfam_family_chat_and_parent_remove_child
-- All chat access is family-scoped; only signed-in members may read messages.
create or replace function public.is_family_chat_member(p_family uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select (select auth.uid()) is not null and
  (exists(select 1 from public.families f where f.id=p_family and f.owner_id=(select auth.uid()))
    or exists(select 1 from public.family_members fm where fm.family_id=p_family and fm.user_id=(select auth.uid())))
$$;
revoke all on function public.is_family_chat_member(uuid) from public,anon;
grant execute on function public.is_family_chat_member(uuid) to authenticated;

create table if not exists public.family_chat_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'message' check (kind in ('message','emergency','quick')),
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists family_chat_messages_recent_idx on public.family_chat_messages(family_id,created_at desc,id desc);
alter table public.family_chat_messages enable row level security;
drop policy if exists family_chat_members_read on public.family_chat_messages;
create policy family_chat_members_read on public.family_chat_messages
 for select to authenticated using (public.is_family_chat_member(family_id));
revoke all on public.family_chat_messages from public,anon,authenticated;
grant select on public.family_chat_messages to authenticated;

-- Only a verified family member can post; children must send from a paired browser.
create or replace function public.send_family_chat_message(
 p_family_id uuid,p_body text,p_kind text default 'message',p_device_token text default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_user uuid := auth.uid(); v_kind text := lower(coalesce(p_kind,'message')); v_id uuid; v_role text;
begin
 if v_user is null then raise exception 'Sign in to chat'; end if;
 if p_body is null or length(trim(p_body)) < 1 or length(trim(p_body)) > 500 then
   raise exception 'Message must contain 1 to 500 characters';
 end if;
 if v_kind not in ('message','emergency','quick') then raise exception 'Invalid message type'; end if;
 if not public.is_family_chat_member(p_family_id) then raise exception 'You are not linked to this family chat'; end if;
 select role into v_role from public.profiles where id=v_user;
 if v_role='child' then
   if p_device_token is null or p_device_token !~ '^[a-f0-9]{64}$'
      or not exists (
        select 1 from public.child_devices d join public.family_members fm on fm.user_id=d.child_id
        where d.child_id=v_user and fm.family_id=p_family_id
          and d.token_sha256=encode(sha256(convert_to(p_device_token,'UTF8')),'hex')
      ) then raise exception 'Chat access requires the paired child phone'; end if;
 elsif v_role<>'parent' or not exists(
    select 1 from public.families f where f.id=p_family_id and f.owner_id=v_user
 ) then raise exception 'Parent ownership required'; end if;
 insert into public.family_chat_messages(family_id,sender_id,body,kind)
 values(p_family_id,v_user,trim(p_body),v_kind) returning id into v_id;
 return v_id;
end;$$;
revoke all on function public.send_family_chat_message(uuid,text,text,text) from public,anon;
grant execute on function public.send_family_chat_message(uuid,text,text,text) to authenticated;

-- Parent removes child association and its sensitive data, not the Supabase auth user itself.
create or replace function public.remove_child_from_family(p_child_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_family uuid; v_parent uuid := auth.uid();
begin
 if v_parent is null then raise exception 'Parent sign-in required'; end if;
 select f.id into v_family from public.families f where f.owner_id=v_parent
   and exists(select 1 from public.family_members fm where fm.family_id=f.id and fm.user_id=p_child_id)
 for update;
 if v_family is null then raise exception 'Only the family parent may remove a linked child'; end if;
 if not exists(select 1 from public.profiles where id=p_child_id and role='child') then
  raise exception 'Only a child can be removed'; end if;
 delete from public.family_chat_messages where family_id=v_family and sender_id=p_child_id;
 delete from public.location_latest where user_id=p_child_id;
 delete from public.child_invites where family_id=v_family and used_by=p_child_id;
 delete from public.child_devices where child_id=p_child_id;
 delete from public.family_members where family_id=v_family and user_id=p_child_id;
end;$$;
revoke all on function public.remove_child_from_family(uuid) from public,anon;
grant execute on function public.remove_child_from_family(uuid) to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.family_chat_messages;
  exception when duplicate_object then null; end;
end $$;
