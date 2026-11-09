-- A signed JWT may remain valid after its Supabase session is revoked. Check
-- its session record for every profile, relationship, and location operation.
create function private.near_session_active()
returns boolean language sql volatile security definer set search_path = '' as $$
  select case
    when (auth.jwt() ->> 'session_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then exists (
      select 1 from auth.sessions s
      where s.id = (auth.jwt() ->> 'session_id')::uuid
        and s.user_id = auth.uid()
    )
    else false
  end;
$$;
revoke all on function private.near_session_active() from public, anon;
grant execute on function private.near_session_active() to authenticated;

-- The dedicated authentication server can revoke sessions only for the
-- Supabase account linked to the recovered Better Auth identity.
create function near_auth.revoke_supabase_sessions(p_better_user_id text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  target_id uuid;
  matches bigint;
  revoked integer;
begin
  if p_better_user_id is null or p_better_user_id = '' then
    raise exception 'invalid identity';
  end if;
  select count(distinct i.user_id) into matches
    from auth.identities i
    where i.provider = 'custom:near' and i.identity_data ->> 'sub' = p_better_user_id;
  if matches <> 1 then raise exception 'identity mapping unavailable'; end if;
  select i.user_id into target_id from auth.identities i
    where i.provider = 'custom:near' and i.identity_data ->> 'sub' = p_better_user_id limit 1;
  perform pg_catalog.pg_advisory_xact_lock(1948242652);
  delete from auth.sessions s where s.user_id = target_id;
  get diagnostics revoked = row_count;
  return revoked;
end $$;
revoke all on function near_auth.revoke_supabase_sessions(text) from public, anon, authenticated;
grant execute on function near_auth.revoke_supabase_sessions(text) to near_auth_server;

-- Existing policies are replaced in-place so a revoked token cannot use
-- the profile API until its JWT expires.
drop policy "Users can read their own profile" on public.profiles;
drop policy "Users can create their own profile" on public.profiles;
drop policy "Users can update their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id and (select private.near_session_active()));
create policy "Users can create their own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id and (select private.near_session_active()));
create policy "Users can update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id and (select private.near_session_active()))
  with check ((select auth.uid()) = id and (select private.near_session_active()));

create or replace function private.near_location_action(action text, latitude double precision default null, longitude double precision default null, accuracy_m double precision default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  result jsonb;
begin
  if actor is null or not private.near_session_active() or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  -- Use the same transaction lock as friendship, block and removal changes.
  perform pg_catalog.pg_advisory_xact_lock(1948242652);
  if not private.near_session_active() then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if action = 'start' or action = 'update' then
    if latitude is null or longitude is null or accuracy_m is null or not (latitude between -90 and 90) or not (longitude between -180 and 180) or not (accuracy_m between 0 and 100000) then
      raise exception 'invalid location';
    end if;
    if not exists (select 1 from public.profiles p where p.id = actor) then raise exception 'profile required'; end if;
    if action = 'update' and not exists (select 1 from private.near_location_settings s where s.user_id = actor and s.sharing) then
      raise exception 'sharing is off';
    end if;
    if action = 'start' then
      insert into private.near_location_settings(user_id, sharing) values (actor, true)
      on conflict (user_id) do update set sharing = true;
    end if;
    insert into private.near_locations as loc(user_id, latitude, longitude, accuracy_m, updated_at)
      values (actor, latitude, longitude, accuracy_m, now())
    on conflict (user_id) do update set latitude = excluded.latitude, longitude = excluded.longitude, accuracy_m = excluded.accuracy_m, updated_at = now();
    return pg_catalog.jsonb_build_object('sharing', true);
  elsif action = 'stop' then
    insert into private.near_location_settings as settings(user_id, sharing) values (actor, false)
      on conflict (user_id) do update set sharing = false;
    delete from private.near_locations l where l.user_id = actor;
    return pg_catalog.jsonb_build_object('sharing', false);
  elsif action = 'list' then
    select pg_catalog.jsonb_build_object(
      'sharing', coalesce((select s.sharing from private.near_location_settings s where s.user_id = actor), false),
      'locations', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', l.user_id, 'name', p.display_name, 'icon', p.icon, 'latitude', l.latitude, 'longitude', l.longitude, 'accuracy_m', l.accuracy_m, 'updated_at', l.updated_at) order by l.user_id)
        from private.near_locations l
        join private.near_location_settings s on s.user_id = l.user_id and s.sharing
        join public.profiles p on p.id = l.user_id
        where l.user_id = actor or (
          exists (select 1 from private.near_friendships f where f.user_low = least(actor, l.user_id) and f.user_high = greatest(actor, l.user_id))
          and not exists (select 1 from private.near_blocks b where (b.blocker_id = actor and b.blocked_id = l.user_id) or (b.blocker_id = l.user_id and b.blocked_id = actor))
        )
      ), '[]'::jsonb)
    ) into result;
    return result;
  end if;
  raise exception 'unknown action';
end $$;

create or replace function private.near_friend_action(action text, target uuid default null, token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  other uuid;
  secret text;
  invite private.near_invites%rowtype;
  req private.near_friend_requests%rowtype;
  result jsonb;
begin
  if actor is null or not private.near_session_active() or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  -- Serialize relationship changes so concurrent block/accept/remove cannot bypass each other.
  perform pg_catalog.pg_advisory_xact_lock(1948242652);
  if not private.near_session_active() then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if action in ('create_invite', 'request') and not exists (select 1 from public.profiles where id = actor) then raise exception 'profile required'; end if;
  if action = 'create_invite' then
    secret := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
    insert into private.near_invites(owner_id, token_hash, expires_at)
      values (actor, pg_catalog.encode(extensions.digest(secret, 'sha256'), 'hex'), now() + interval '24 hours');
    return pg_catalog.jsonb_build_object('token', secret, 'expires_at', now() + interval '24 hours');
  elsif action = 'request' then
    if token is null or token !~ '^[0-9a-f]{64}$' then raise exception 'invalid invitation'; end if;
    select * into invite from private.near_invites where token_hash = pg_catalog.encode(extensions.digest(token, 'sha256'), 'hex') for update;
    if invite.id is null or invite.used_at is not null or invite.expires_at <= now() or invite.owner_id = actor then raise exception 'invalid invitation'; end if;
    other := invite.owner_id;
    if exists (select 1 from private.near_blocks where (blocker_id = actor and blocked_id = other) or (blocker_id = other and blocked_id = actor)) then raise exception 'invalid invitation'; end if;
    if exists (select 1 from private.near_friendships where user_low = least(actor,other) and user_high = greatest(actor,other)) then raise exception 'already friends'; end if;
    if exists (select 1 from private.near_friend_requests where (inviter_id = actor and applicant_id = other) or (inviter_id = other and applicant_id = actor)) then raise exception 'request already pending'; end if;
    insert into private.near_friend_requests(inviter_id, applicant_id) values (other, actor);
    update private.near_invites set used_at = now() where id = invite.id;
    return pg_catalog.jsonb_build_object('status', 'pending');
  elsif action = 'accept' or action = 'decline' then
    select * into req from private.near_friend_requests where id = target and inviter_id = actor for update;
    if req.id is null then raise exception 'request unavailable'; end if;
    other := req.applicant_id;
    if exists (select 1 from private.near_blocks where (blocker_id = actor and blocked_id = other) or (blocker_id = other and blocked_id = actor)) then raise exception 'request unavailable'; end if;
    if action = 'accept' then
      insert into private.near_friendships(user_low,user_high) values (least(actor,other), greatest(actor,other)) on conflict do nothing;
    end if;
    delete from private.near_friend_requests where id = req.id;
    return pg_catalog.jsonb_build_object('status', action);
  elsif action = 'remove' or action = 'block' then
    if target is null or target = actor then raise exception 'user unavailable'; end if;
    if not exists (select 1 from private.near_friendships where user_low = least(actor,target) and user_high = greatest(actor,target)) and not exists (select 1 from private.near_friend_requests where (inviter_id = actor and applicant_id = target) or (inviter_id = target and applicant_id = actor)) then raise exception 'user unavailable'; end if;
    if action = 'block' then insert into private.near_blocks(blocker_id,blocked_id) values (actor,target) on conflict do nothing; end if;
    delete from private.near_friendships where user_low = least(actor,target) and user_high = greatest(actor,target);
    delete from private.near_friend_requests where (inviter_id = actor and applicant_id = target) or (inviter_id = target and applicant_id = actor);
    return pg_catalog.jsonb_build_object('status', action);
  elsif action = 'unblock' then
    delete from private.near_blocks where blocker_id = actor and blocked_id = target;
    return pg_catalog.jsonb_build_object('status', 'unblocked');
  elsif action = 'list' then
    select pg_catalog.jsonb_build_object(
      'friends', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', p.id, 'name', p.display_name, 'icon', p.icon) order by p.display_name) from private.near_friendships f join public.profiles p on p.id = case when f.user_low = actor then f.user_high else f.user_low end where actor in (f.user_low,f.user_high) and not exists (select 1 from private.near_blocks b where (b.blocker_id = actor and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = actor))), '[]'::jsonb),
      'incoming', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', r.id, 'user_id', p.id, 'name', p.display_name)) from private.near_friend_requests r join public.profiles p on p.id = r.applicant_id where r.inviter_id = actor), '[]'::jsonb),
      'outgoing', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', r.id, 'user_id', p.id, 'name', p.display_name)) from private.near_friend_requests r join public.profiles p on p.id = r.inviter_id where r.applicant_id = actor), '[]'::jsonb),
      'blocked', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', p.id, 'name', p.display_name)) from private.near_blocks b join public.profiles p on p.id = b.blocked_id where b.blocker_id = actor), '[]'::jsonb)
    ) into result;
    return result;
  end if;
  raise exception 'unknown action';
end $$;
