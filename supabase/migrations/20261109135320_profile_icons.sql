-- Preset icons avoid storing user-uploaded images or requiring external storage.
alter table public.profiles add column icon text not null default 'sun'
  check (icon in ('sun', 'moon', 'flower', 'cat', 'dog', 'frog', 'bear', 'star'));

-- Preserve all existing location authorization checks; include the profile icon
-- only for the same locations the caller is already allowed to retrieve.
create or replace function private.near_location_action(action text, latitude double precision default null, longitude double precision default null, accuracy_m double precision default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  result jsonb;
begin
  if actor is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  -- Use the same transaction lock as friendship, block and removal changes.
  perform pg_catalog.pg_advisory_xact_lock(1948242652);
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
