create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table private.near_invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz
);
create table private.near_friend_requests (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references auth.users(id) on delete cascade,
  applicant_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (inviter_id <> applicant_id),
  unique (inviter_id, applicant_id)
);
create table private.near_friendships (
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high)
);
create index near_friendships_high on private.near_friendships (user_high);
create table private.near_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index near_blocks_blocked on private.near_blocks (blocked_id);
alter table private.near_invites enable row level security;
alter table private.near_friend_requests enable row level security;
alter table private.near_friendships enable row level security;
alter table private.near_blocks enable row level security;
revoke all on private.near_invites, private.near_friend_requests, private.near_friendships, private.near_blocks from public, anon, authenticated;

create function private.near_friend_action(action text, target uuid default null, token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  other uuid;
  secret text;
  invite private.near_invites%rowtype;
  req private.near_friend_requests%rowtype;
  result jsonb;
begin
  if actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  -- Serialize relationship changes so concurrent block/accept/remove cannot bypass each other.
  perform pg_catalog.pg_advisory_xact_lock(1948242652);
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
      'friends', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', p.id, 'name', p.display_name) order by p.display_name) from private.near_friendships f join public.profiles p on p.id = case when f.user_low = actor then f.user_high else f.user_low end where actor in (f.user_low,f.user_high) and not exists (select 1 from private.near_blocks b where (b.blocker_id = actor and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = actor))), '[]'::jsonb),
      'incoming', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', r.id, 'user_id', p.id, 'name', p.display_name)) from private.near_friend_requests r join public.profiles p on p.id = r.applicant_id where r.inviter_id = actor), '[]'::jsonb),
      'outgoing', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', r.id, 'user_id', p.id, 'name', p.display_name)) from private.near_friend_requests r join public.profiles p on p.id = r.inviter_id where r.applicant_id = actor), '[]'::jsonb),
      'blocked', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', p.id, 'name', p.display_name)) from private.near_blocks b join public.profiles p on p.id = b.blocked_id where b.blocker_id = actor), '[]'::jsonb)
    ) into result;
    return result;
  end if;
  raise exception 'unknown action';
end $$;
revoke all on function private.near_friend_action(text, uuid, text) from public, anon;
grant execute on function private.near_friend_action(text, uuid, text) to authenticated;
create function public.near_friend_action(action text, target uuid default null, token text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.near_friend_action(action, target, token);
$$;
revoke all on function public.near_friend_action(text, uuid, text) from public, anon;
grant execute on function public.near_friend_action(text, uuid, text) to authenticated;
