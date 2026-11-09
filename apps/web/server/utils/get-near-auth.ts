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
      async revokePriorPasskeys(userId, keepPasskeyId) {
        await database.query(
          'delete from near_auth.passkey where "userId" = $1 and id <> $2',
          [userId, keepPasskeyId],
        );
      },
    }),
  );
  instance = { auth, database };
  return instance;
}
