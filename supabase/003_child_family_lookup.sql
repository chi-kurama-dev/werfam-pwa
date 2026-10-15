-- Applied to the production Supabase project: werfam_reliable_child_family_lookup.
-- Returns family details only to a signed-in child on their previously paired browser.
create or replace function public.get_my_child_family(p_device_token text)
returns table (id uuid, name text, owner_id uuid)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_device_token is null
    or p_device_token !~ '^[a-f0-9]{64}$' then
    return;
  end if;
  return query
    select f.id, f.name, f.owner_id
    from public.families f
    join public.family_members fm on fm.family_id = f.id
    join public.child_devices d on d.child_id = fm.user_id
    join public.profiles p on p.id = fm.user_id
    where fm.user_id = auth.uid()
      and p.role = 'child'
      and d.token_sha256 = encode(sha256(convert_to(p_device_token,'UTF8')),'hex')
    limit 1;
end;
$$;

revoke all on function public.get_my_child_family(text) from public, anon, authenticated;
grant execute on function public.get_my_child_family(text) to authenticated;
