import { createClient } from "@supabase/supabase-js";
import {
  generateRecoveryCode,
  hashRecoveryCode,
  RECOVERY_PREFIX,
} from "../../utils/recovery-code";
import { requireRecoverySession } from "../../utils/recovery-request";

export default defineEventHandler(async (event) => {
  const { config, database, session } = await requireRecoverySession(
    event,
    "passkey",
  );
  if (!session.user.emailVerified || session.user.email.endsWith(".invalid"))
    throw createError({
      statusCode: 403,
      statusMessage: "Verified recovery email required",
    });
  const token = /^Bearer\s+(\S+)$/i.exec(
    getHeader(event, "authorization") ?? "",
  )?.[1];
  const key = String(config.nearAuthSupabaseSecretKey);
  if (!token || !key)
    throw createError({
      statusCode: 403,
      statusMessage: "Authentication required",
    });
  const admin = createClient(String(config.public.supabaseUrl), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verified = await admin.auth.getUser(token);
  if (
    verified.error ||
    !verified.data.user?.identities?.some(
      (identity) =>
        identity.provider === "custom:near" &&
        identity.identity_data?.sub === session.user.id,
    )
  )
    throw createError({
      statusCode: 403,
      statusMessage: "Authentication required",
    });
  const code = generateRecoveryCode();
  const identifier = RECOVERY_PREFIX + session.user.id;
  const value = JSON.stringify({
    hash: hashRecoveryCode(code, String(config.nearAuthSecret)),
    attempts: 0,
    lockedUntil: 0,
  });
  await database.query(
    `insert into near_auth.verification (id, identifier, value, "expiresAt") values ($1, $1, $2, '9999-12-31')
     on conflict (id) do update set value = excluded.value, "updatedAt" = now()`,
    [identifier, value],
  );
  setHeader(event, "Cache-Control", "no-store");
  return { code };
});
