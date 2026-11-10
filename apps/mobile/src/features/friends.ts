import type { SupabaseClient } from "@supabase/supabase-js";

export type Person = { id: string; name: string; icon?: string };
export type FriendRequest = { id: string; user_id: string; name: string };
export type Relationships = {
  friends: Person[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  blocked: Person[];
};

export async function friendAction(
  client: SupabaseClient,
  action: string,
  target?: string,
  token?: string,
) {
  const { data, error } = await client.rpc("near_friend_action", {
    action,
    ...(target ? { target } : {}),
    ...(token ? { token } : {}),
  });
  if (error) throw error;
  return data;
}
