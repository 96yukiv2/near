import { betterAuth } from "better-auth";
import type { H3Event } from "h3";
import { Pool } from "pg";
import { createNearAuthOptions } from "./near-auth";
import { createRecoveryMailer } from "./recovery-mail";

let instance:
  { auth: ReturnType<typeof betterAuth>; database: Pool } | undefined;

export function getNearAuth(event: H3Event) {
  const config = useRuntimeConfig(event);
  if (String(config.nearAuthEnabled) !== "true")
    throw createError({ statusCode: 503, statusMessage: "Auth unavailable" });
  if (instance) return instance;
  const baseURL = String(config.nearAuthBaseUrl);
  const secret = String(config.nearAuthSecret);
  const databaseURL = String(config.nearAuthDatabaseUrl);
  let parsed: URL;
  let sendVerificationOTP;
  try {
    parsed = new URL(baseURL);
    const isLocal = ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (
      (parsed.protocol !== "https:" &&
        !(isLocal && parsed.protocol === "http:")) ||
      parsed.origin !== baseURL ||
      secret.length < 32 ||
      !databaseURL
    )
      throw new Error("invalid configuration");
    sendVerificationOTP = createRecoveryMailer(
      String(config.nearAuthSmtpUrl),
      String(config.nearAuthMailFrom),
    );
  } catch {
    throw createError({ statusCode: 503, statusMessage: "Auth unavailable" });
  }
  const database = new Pool({
    connectionString: databaseURL,
    max: 2,
    options: "-c search_path=near_auth",
  });
  const auth = betterAuth(
    createNearAuthOptions({
      baseURL,
      secret,
      database,
      rpID: parsed.hostname,
      origin: parsed.origin,
      sendVerificationOTP,
      async hasPasskey(userId) {
        const result = await database.query(
          'select 1 from near_auth.passkey where "userId" = $1 limit 1',
          [userId],
        );
        return result.rowCount === 1;
      },
      async revokePriorPasskeys(userId) {
        await database.query(
          'delete from near_auth.passkey where "userId" = $1',
          [userId],
        );
      },
    }),
  );
  instance = { auth, database };
  return instance;
}
