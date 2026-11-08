import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { chromium } from "playwright";

const databaseURL = process.env.NEAR_TEST_POSTGRES_URL;
if (!databaseURL) throw new Error("NEAR_TEST_POSTGRES_URL is required");
const db = new URL(databaseURL);
if (
  !["localhost", "127.0.0.1"].includes(db.hostname) ||
  db.pathname !== "/near_browser_test"
)
  throw new Error("Use only a disposable local near_browser_test database");
const origin = "http://localhost:31337";
let pool;
let server;
let browser;
let supabaseMock;
let betterUserId;
let deleteAttempts = 0;
const supabaseUserId = "20db329e-c003-49bc-a24f-719e05e0c3b1";

before(async () => {
  pool = new pg.Pool({ connectionString: databaseURL });
  const existing = await pool.query(
    "select 1 from pg_namespace where nspname = 'near_auth'",
  );
  if (existing.rowCount) throw new Error("Test database must be empty");
  await pool.query(
    "do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if; if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if; end $$",
  );
  await pool.query(
    await readFile(
      "supabase/migrations/20261108123536_near_identity.sql",
      "utf8",
    ),
  );
  await pool.query(
    'insert into near_auth."oauthClient" (id, "clientId", "redirectUris", "skipConsent", "tokenEndpointAuthMethod", scopes) values ($1,$2,$3,$4,$5,$6)',
    [
      "test-client",
      "test-client",
      JSON.stringify([`${origin}/callback`]),
      true,
      "none",
      JSON.stringify(["openid"]),
    ],
  );
  supabaseMock = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    const identity = {
      id: supabaseUserId,
      aud: "authenticated",
      identities: [
        { provider: "custom:near", identity_data: { sub: betterUserId } },
      ],
    };
    if (req.url === "/auth/v1/user" && req.method === "GET") {
      if (req.headers.authorization !== "Bearer local-valid-token") {
        res.writeHead(401).end(JSON.stringify({ message: "Unauthorized" }));
        return;
      }
      res.end(JSON.stringify(identity));
      return;
    }
    if (req.url === `/auth/v1/admin/users/${supabaseUserId}`) {
      if (req.method === "GET") {
        res.end(JSON.stringify(identity));
        return;
      }
      if (req.method === "DELETE") {
        deleteAttempts++;
        if (deleteAttempts === 1) {
          res
            .writeHead(503)
            .end(JSON.stringify({ message: "temporary failure" }));
          return;
        }
        res.end("{}");
        return;
      }
    }
    res.writeHead(404).end(JSON.stringify({ message: "Not found" }));
  });
  await new Promise((resolve) =>
    supabaseMock.listen(31338, "127.0.0.1", resolve),
  );
  server = spawn(process.execPath, ["apps/web/.output/server/index.mjs"], {
    env: {
      ...process.env,
      NITRO_HOST: "127.0.0.1",
      NITRO_PORT: "31337",
      NUXT_NEAR_AUTH_ENABLED: "true",
      NUXT_NEAR_AUTH_BASE_URL: origin,
      NUXT_NEAR_AUTH_SECRET: "test-only-secret-never-used-in-production-123456",
      NUXT_NEAR_AUTH_DATABASE_URL: databaseURL,
      NUXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:31338",
      NUXT_NEAR_AUTH_SUPABASE_SECRET_KEY: "test-service-key-only",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw new Error("Nuxt server exited before starting");
    try {
      await fetch("http://127.0.0.1:31337/");
      break;
    } catch {
      await delay(100);
    }
    if (i === 99) throw new Error("Nuxt server did not start");
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.TEST_CHROMIUM_PATH
      ? { executablePath: process.env.TEST_CHROMIUM_PATH }
      : {}),
  });
});

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) server.kill();
  if (supabaseMock) await new Promise((resolve) => supabaseMock.close(resolve));
  await pool?.end();
});

test("Nuxt and PostgreSQL register a passkey before issuing an OAuth code", async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    });
    const verifier =
      "local-test-verifier-with-at-least-43-characters-0123456789";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: "test-client",
      redirect_uri: `${origin}/callback`,
      scope: "openid",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      state: "near-test-state",
    });
    await page.goto(`${origin}/api/auth/oauth2/authorize?${params}`);
    assert.equal(new URL(page.url()).pathname, "/auth/login");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "はじめて利用する" }).click();
    await page.waitForURL(/\/callback\?/, { timeout: 20000 });
    const callback = new URL(page.url());
    assert.equal(callback.searchParams.get("state"), "near-test-state");
    assert.ok(callback.searchParams.get("code"));
    const users = await pool.query('select id, email from near_auth."user"');
    assert.equal(users.rowCount, 1);
    assert.match(users.rows[0].email, /@anonymous\.placeholder\.invalid$/);
    betterUserId = users.rows[0].id;
    assert.equal(
      (await pool.query("select 1 from near_auth.passkey")).rowCount,
      1,
    );
    const sessions = await pool.query(
      'select "ipAddress", "userAgent" from near_auth.session',
    );
    assert.ok(sessions.rows.length);
    assert.ok(
      sessions.rows.every((entry) => !entry.ipAddress && !entry.userAgent),
    );

    const invalidOrigin = await context.request.post(
      `${origin}/api/account/delete`,
      {
        headers: {
          Origin: "https://other.invalid",
          Authorization: "Bearer local-valid-token",
        },
      },
    );
    assert.equal(invalidOrigin.status(), 403);
    const wrongIdentity = await context.request.post(
      `${origin}/api/account/delete`,
      {
        headers: { Origin: origin, Authorization: "Bearer invalid-token" },
      },
    );
    assert.equal(wrongIdentity.status(), 401);
    assert.equal(deleteAttempts, 0);
    const firstDeletion = await context.request.post(
      `${origin}/api/account/delete`,
      {
        headers: { Origin: origin, Authorization: "Bearer local-valid-token" },
      },
    );
    assert.equal(firstDeletion.status(), 503);
    assert.equal(
      (await pool.query("select 1 from near_auth.deletion_jobs")).rowCount,
      1,
    );
    assert.equal(
      (await pool.query('select 1 from near_auth."user"')).rowCount,
      1,
    );
    const retry = await context.request.post(`${origin}/api/account/delete`, {
      headers: { Origin: origin },
    });
    assert.equal(retry.status(), 200);
    assert.equal(deleteAttempts, 2);
    assert.equal(
      (await pool.query("select 1 from near_auth.deletion_jobs")).rowCount,
      0,
    );
    assert.equal(
      (await pool.query('select 1 from near_auth."user"')).rowCount,
      0,
    );
    assert.equal(
      (await pool.query("select 1 from near_auth.passkey")).rowCount,
      0,
    );
    const afterDeletion = await context.request.post(
      `${origin}/api/account/delete`,
      {
        headers: { Origin: origin, Authorization: "Bearer local-valid-token" },
      },
    );
    assert.equal(afterDeletion.status(), 403);
  } finally {
    await context.close();
  }
});
