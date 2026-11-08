import { createClient } from "@supabase/supabase-js";
import { deleteNearAccount } from "../../utils/delete-near-account";
import { getNearAuth } from "../../utils/get-near-auth";
import { isRecentAuth } from "../../utils/near-auth-policy";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  if (getHeader(event, "origin") !== String(config.nearAuthBaseUrl))
    throw createError({ statusCode: 403, statusMessage: "Invalid origin" });
  const key = String(config.nearAuthSupabaseSecretKey);
  const url = String(config.public.supabaseUrl);
  if (!key || !url)
    throw createError({
      statusCode: 503,
      statusMessage: "Deletion unavailable",
    });
  const { auth, database } = getNearAuth(event);
  const session = await auth.api.getSession({
    headers: toWebRequest(event).headers,
  });
  const method = (session?.session as { nearAuthMethod?: string } | undefined)
    ?.nearAuthMethod;
  if (
    !session?.user ||
    !isRecentAuth(method, session.session.createdAt, "passkey")
  )
    throw createError({
      statusCode: 403,
      statusMessage: "Recent passkey sign-in required",
    });
  const authorization = getHeader(event, "authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1] ?? "";
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await deleteNearAccount(session.user.id, token, {
    async findPending(id) {
      const found = await database.query<{ supabase_user_id: string }>(
        "select supabase_user_id from near_auth.deletion_jobs where better_auth_user_id = $1",
        [id],
      );
      return found.rows[0]?.supabase_user_id ?? null;
    },
    async startPending(id, supabaseId) {
      await database.query(
        "insert into near_auth.deletion_jobs (better_auth_user_id, supabase_user_id) values ($1, $2) on conflict do nothing",
        [id, supabaseId],
      );
      const found = await database.query<{ supabase_user_id: string }>(
        "select supabase_user_id from near_auth.deletion_jobs where better_auth_user_id = $1",
        [id],
      );
      return found.rows[0]?.supabase_user_id ?? null;
    },
    async verifyIdentity(accessToken, betterId) {
      const verified = await admin.auth.getUser(accessToken);
      if (verified.error || !verified.data.user) return null;
      const linked = verified.data.user.identities?.some(
        (identity) =>
          identity.provider === "custom:near" &&
          identity.identity_data?.sub === betterId,
      );
      return linked ? verified.data.user.id : null;
    },
    async deleteSupabaseUser(id) {
      const found = await admin.auth.admin.getUserById(id);
      if (found.error) return found.error.status === 404;
      if (!found.data.user) return true;
      const removed = await admin.auth.admin.deleteUser(id);
      return !removed.error || removed.error.status === 404;
    },
    async deleteBetterUser(id) {
      await database.query('delete from near_auth."user" where id = $1', [id]);
      return true;
    },
  });
  if (result === "unauthorized")
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  if (result !== "deleted")
    throw createError({ statusCode: 503, statusMessage: "Retry deletion" });
  return { message: "deleted" };
});
