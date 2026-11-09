import type { H3Event } from "h3";
import { getNearAuth } from "./get-near-auth";
import { isRecentAuth } from "./near-auth-policy";

export async function requireRecoverySession(
  event: H3Event,
  method: "passkey" | "recovery",
) {
  const config = useRuntimeConfig(event);
  if (getHeader(event, "origin") !== String(config.nearAuthBaseUrl))
    throw createError({ statusCode: 403, statusMessage: "Invalid origin" });
  const { auth, database } = getNearAuth(event);
  const session = await auth.api.getSession({
    headers: toWebRequest(event).headers,
  });
  const authMethod = (
    session?.session as { nearAuthMethod?: string } | undefined
  )?.nearAuthMethod;
  if (
    !session?.user ||
    !isRecentAuth(authMethod, session.session.createdAt, method)
  )
    throw createError({
      statusCode: 403,
      statusMessage: "Recent authentication required",
    });
  return { config, database, session };
}
