import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const databaseURL = process.env.NEAR_AUTH_DATABASE_URL;
const clientId = process.env.NEAR_OIDC_CLIENT_ID;
const clientSecret = process.env.NEAR_OIDC_CLIENT_SECRET;
const supabaseURL = process.env.NEAR_SUPABASE_URL;

if (!databaseURL || !clientId || !clientSecret || !supabaseURL) {
  throw new Error(
    "Set NEAR_AUTH_DATABASE_URL, NEAR_OIDC_CLIENT_ID, NEAR_OIDC_CLIENT_SECRET, and NEAR_SUPABASE_URL in a secure environment.",
  );
}
if (clientSecret.length < 32)
  throw new Error("The OIDC client secret must be at least 32 characters.");
const parsed = new URL(supabaseURL);
const isLocal = ["localhost", "127.0.0.1"].includes(parsed.hostname);
if (
  parsed.origin !== supabaseURL ||
  (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:"))
) {
  throw new Error(
    "NEAR_SUPABASE_URL must be an HTTPS origin, or a local development origin.",
  );
}
const secretHash = createHash("sha256")
  .update(clientSecret)
  .digest("base64url");
const pool = new pg.Pool({ connectionString: databaseURL, max: 1 });
try {
  await pool.query(
    `insert into near_auth."oauthClient"
      (id, "clientId", "clientSecret", "redirectUris", "skipConsent", "tokenEndpointAuthMethod", "applicationType", scopes, "requirePKCE")
      values ($1, $2, $3, $4::jsonb, true, 'client_secret_basic', 'web', $5::jsonb, true)`,
    [
      randomUUID(),
      clientId,
      secretHash,
      JSON.stringify([`${parsed.origin}/auth/v1/callback`]),
      JSON.stringify(["openid"]),
    ],
  );
  console.log(
    "OIDC client registered. Configure the matching client in Supabase Auth.",
  );
} catch {
  throw new Error(
    "Could not register the OIDC client. Check the database connection and whether the client ID already exists.",
  );
} finally {
  await pool.end();
}
