import { betterAuth } from "better-auth";
import type { H3Event } from "h3";
import { Pool } from "pg";
import { createNearAuthOptions } from "./near-auth";
import { createRecoveryMailer } from "./recovery-mail";
import { RECOVERY_PREFIX } from "./recovery-code";

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
  const databaseCa = String(config.nearAuthDatabaseCa);
  let connectionString = databaseURL;
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
    if (databaseCa) {
      const db = new URL(databaseURL);
      if (!["postgres:", "postgresql:"].includes(db.protocol))
        throw new Error("invalid database URL");
      // pg connection-string SSL parameters would otherwise override the CA.
      for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"])
        db.searchParams.delete(key);
      connectionString = db.toString();
    }
    sendVerificationOTP = createRecoveryMailer(
      String(config.nearAuthSmtpUrl),
      String(config.nearAuthMailFrom),
    );
  } catch {
    throw createError({ statusCode: 503, statusMessage: "Auth unavailable" });
  }
  const database = new Pool({
    connectionString,
    ...(databaseCa
      ? {
          ssl: {
            ca: databaseCa.replace(/\\n/g, "\n"),
            rejectUnauthorized: true,
          },
        }
      : {}),
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
      async revokePriorPasskeys(userId, keepPasskeyId, sessionId) {
        const client = await database.connect();
        try {
          await client.query("begin");
          const consumed = await client.query(
            `delete from near_auth.verification where id = $1 and value::jsonb->>'reservedSession' = $2`,
            [RECOVERY_PREFIX + userId, sessionId],
          );
          if (consumed.rowCount !== 1)
            throw new Error("Recovery authorization expired");
          await client.query(
            'delete from near_auth.passkey where "userId" = $1 and id <> $2',
            [userId, keepPasskeyId],
          );
          const completed = await client.query(
            `update near_auth."session" set "nearAuthMethod" = 'recovery_complete' where id = $1 and "userId" = $2 and "nearAuthMethod" = 'recovery_verified'`,
            [sessionId, userId],
          );
          if (completed.rowCount !== 1)
            throw new Error("Recovery authorization expired");
          await client.query(
            'delete from near_auth."session" where "userId" = $1 and id <> $2',
            [userId, sessionId],
          );
          await client.query("commit");
        } catch (error) {
          await client.query("rollback");
          throw error;
        } finally {
          client.release();
        }
      },
    }),
  );
  instance = { auth, database };
  return instance;
}
