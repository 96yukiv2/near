import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { toNodeHandler } from "better-auth/node";
import { build } from "esbuild";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { chromium, request } from "playwright";
import { createNearAuthOptions } from "../../apps/web/server/utils/near-auth.ts";

let server;
let browser;
let script;
let database;
const mailbox = new Map();
const origin = "http://localhost:33331";

before(async () => {
  database = new DatabaseSync(":memory:");
  const options = createNearAuthOptions({
    baseURL: origin,
    secret: "local-test-secret-never-used-in-production-123456",
    database,
    rpID: "localhost",
    origin,
    allowTestDeletion: true,
    hasPasskey: async (id) =>
      !!database
        .prepare('SELECT 1 FROM passkey WHERE "userId" = ? LIMIT 1')
        .get(id),
    revokePriorPasskeys: async (id, keepId) => {
      database
        .prepare('DELETE FROM passkey WHERE "userId" = ? AND id <> ?')
        .run(id, keepId);
    },
    async sendVerificationOTP({ email, otp, type }) {
      mailbox.set(`${type}:${email}`, otp);
    },
  });
  await (await getMigrations(options)).runMigrations();
  database
    .prepare(
      'INSERT INTO "oauthClient" (id, "clientId", "redirectUris", "skipConsent", "tokenEndpointAuthMethod", "scopes") VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      "test-client",
      "test-client",
      JSON.stringify(["http://localhost:33331/callback"]),
      1,
      "none",
      JSON.stringify(["openid"]),
    );
  const handler = toNodeHandler(betterAuth(options));
  server = createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!doctype html><title>Passkey test</title>");
    } else {
      handler(req, res);
    }
  });
  await new Promise((resolve) => server.listen(33331, "127.0.0.1", resolve));
  const bundle = await build({
    stdin: {
      contents: `import { createAuthClient } from 'better-auth/client';
        import { anonymousClient, emailOTPClient } from 'better-auth/client/plugins';
        import { passkeyClient } from '@better-auth/passkey/client';
        window.nearAuth = createAuthClient({ baseURL: ${JSON.stringify(origin)}, plugins: [anonymousClient(), passkeyClient(), emailOTPClient()] });`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
  });
  script = bundle.outputFiles[0].text;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.TEST_CHROMIUM_PATH
      ? { executablePath: process.env.TEST_CHROMIUM_PATH }
      : {}),
  });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  database?.close();
});

test("register and sign in with a passkey without a real email", async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    const originalAuthenticator = await cdp.send(
      "WebAuthn.addVirtualAuthenticator",
      {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
        },
      },
    );
    await page.goto(origin);
    await page.addScriptTag({ content: script });
    const created = await page.evaluate(async () => {
      const created = await window.nearAuth.signIn.anonymous();
      if (created.error) return { error: created.error.message };
      return { id: created.data.user.id };
    });
    assert.ok(created.id);
    const prematureRecovery = await page.evaluate(() =>
      window.nearAuth.emailOtp.requestEmailChange({
        newEmail: "near-test@recovery.invalid",
      }),
    );
    assert.equal(prematureRecovery.error?.status, 403);
    await page.evaluate(() =>
      window.nearAuth.updateSession({ nearAuthMethod: "passkey" }),
    );
    const forgedRecovery = await page.evaluate(() =>
      window.nearAuth.emailOtp.requestEmailChange({
        newEmail: "near-test@recovery.invalid",
      }),
    );
    assert.equal(forgedRecovery.error?.status, 403);
    const unverifiedRecovery = await page.evaluate(() =>
      window.nearAuth.emailOtp.requestEmailChange({
        newEmail: "unverified@recovery.invalid",
      }),
    );
    assert.ok(unverifiedRecovery.error);
    const clientRegistration = await page.evaluate(async () => {
      const response = await fetch("/api/auth/oauth2/create-client", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:33331/untrusted"],
          token_endpoint_auth_method: "none",
          scope: "openid",
        }),
      });
      return response.status;
    });
    assert.ok(clientRegistration >= 400);
    const verifier = "test-verifier-with-sufficient-random-length-1234567890";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: "test-client",
      redirect_uri: `${origin}/callback`,
      scope: "openid",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "local-test-state",
    });
    const authorizeUrl = `${origin}/api/auth/oauth2/authorize?${params}`;
    const beforeRegistration = await context.request.get(authorizeUrl, {
      maxRedirects: 0,
    });
    assert.equal(beforeRegistration.status(), 302);
    const setupRedirect = new URL(
      beforeRegistration.headers().location,
      origin,
    );
    assert.equal(setupRedirect.pathname, "/auth/setup");
    const bypass = await page.evaluate(async (oauthQuery) => {
      const response = await fetch("/api/auth/oauth2/continue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ created: true, oauth_query: oauthQuery }),
      });
      return { status: response.status, body: await response.json() };
    }, setupRedirect.search.slice(1));
    assert.equal(bypass.status, 200);
    assert.equal(new URL(bypass.body.url, origin).pathname, "/auth/setup");
    const registration = await page.evaluate(async () => {
      const registered = await window.nearAuth.passkey.addPasskey();
      if (registered.error) return { error: registered.error.message };
      return { registered: true };
    });
    assert.deepEqual(registration, { registered: true });
    const beforeSignIn = await context.request.get(authorizeUrl, {
      maxRedirects: 0,
    });
    assert.equal(
      new URL(beforeSignIn.headers().location, origin).pathname,
      "/auth/setup",
    );
    const result = await page.evaluate(async (id) => {
      await window.nearAuth.signOut();
      const signedIn = await window.nearAuth.signIn.passkey();
      if (signedIn.error) return { error: signedIn.error.message };
      return { sameUser: signedIn.data.user.id === id };
    }, created.id);
    assert.deepEqual(result, { sameUser: true });
    const additionalPasskey = await page.evaluate(() =>
      window.nearAuth.passkey.addPasskey(),
    );
    assert.ok(additionalPasskey.error);
    const otherContext = await browser.newContext();
    let otherId;
    try {
      const otherPage = await otherContext.newPage();
      await otherPage.goto(origin);
      await otherPage.addScriptTag({ content: script });
      const otherUser = await otherPage.evaluate(() =>
        window.nearAuth.signIn.anonymous(),
      );
      assert.equal(otherUser.error, null);
      otherId = otherUser.data.user.id;
      const otherAuthorization = await otherContext.request.get(authorizeUrl, {
        maxRedirects: 0,
      });
      assert.equal(otherAuthorization.status(), 302);
      assert.equal(
        new URL(otherAuthorization.headers().location, origin).pathname,
        "/auth/setup",
      );
    } finally {
      await otherContext.close();
    }
    const authorized = await context.request.get(authorizeUrl, {
      maxRedirects: 0,
    });
    assert.equal(authorized.status(), 302);
    const redirect = new URL(authorized.headers().location, origin);
    assert.equal(redirect.pathname, "/callback");
    const code = redirect.searchParams.get("code");
    assert.ok(code);
    assert.equal(redirect.searchParams.get("state"), "local-test-state");
    const tokenBody = {
      grant_type: "authorization_code",
      client_id: "test-client",
      code,
      code_verifier: verifier,
      redirect_uri: `${origin}/callback`,
    };
    const tokenClient = await request.newContext();
    const exchange = await tokenClient.post(`${origin}/api/auth/oauth2/token`, {
      form: tokenBody,
    });
    assert.equal(exchange.status(), 200, await exchange.text());
    const tokens = await exchange.json();
    const keys = createRemoteJWKSet(new URL(`${origin}/api/auth/jwks`));
    const verified = await jwtVerify(tokens.id_token, keys, {
      issuer: `${origin}/api/auth`,
      audience: "test-client",
    });
    assert.equal(verified.payload.sub, created.id);
    assert.equal(verified.payload.email, undefined);
    const replay = await tokenClient.post(`${origin}/api/auth/oauth2/token`, {
      form: tokenBody,
    });
    assert.equal(replay.status(), 400);
    await tokenClient.dispose();
    const users = database.prepare("SELECT email FROM user").all();
    assert.equal(users.length, 2);
    for (const user of users)
      assert.match(user.email, /@anonymous\.placeholder\.invalid$/);

    // This mailbox exists only in memory; no actual email is sent.
    const recoveryEmail = "near-test@recovery.invalid";
    const requested = await page.evaluate(
      async (newEmail) =>
        window.nearAuth.emailOtp.requestEmailChange({ newEmail }),
      recoveryEmail,
    );
    assert.equal(requested.error, null);
    const confirmationCode = mailbox.get(`change-email:${recoveryEmail}`);
    assert.ok(confirmationCode);
    const changed = await page.evaluate(
      async ({ newEmail, otp }) =>
        window.nearAuth.emailOtp.changeEmail({ newEmail, otp }),
      { newEmail: recoveryEmail, otp: confirmationCode },
    );
    assert.equal(changed.error, null);
    await page.evaluate(() => window.nearAuth.signOut());
    const recoveryRequest = await page.evaluate(
      async (email) =>
        window.nearAuth.emailOtp.sendVerificationOtp({
          email,
          type: "sign-in",
        }),
      recoveryEmail,
    );
    assert.equal(recoveryRequest.error, null);
    const recoveryCode = mailbox.get(`sign-in:${recoveryEmail}`);
    assert.ok(recoveryCode);
    const wrongCode = recoveryCode === "000000" ? "111111" : "000000";
    const incorrect = await page.evaluate(
      async ({ email, otp }) => window.nearAuth.signIn.emailOtp({ email, otp }),
      { email: recoveryEmail, otp: wrongCode },
    );
    assert.ok(incorrect.error);
    const recovered = await page.evaluate(
      async ({ email, otp }) => window.nearAuth.signIn.emailOtp({ email, otp }),
      { email: recoveryEmail, otp: recoveryCode },
    );
    assert.equal(recovered.error, null);
    assert.equal(recovered.data.user.id, created.id);
    const recoveryChange = await page.evaluate(() =>
      window.nearAuth.emailOtp.requestEmailChange({
        newEmail: "another-test@recovery.invalid",
      }),
    );
    assert.equal(recoveryChange.error?.status, 403);
    const beforeReplacement = await context.request.get(authorizeUrl, {
      maxRedirects: 0,
    });
    assert.equal(
      new URL(beforeReplacement.headers().location, origin).pathname,
      "/auth/setup",
    );
    await cdp.send("WebAuthn.removeVirtualAuthenticator", {
      authenticatorId: originalAuthenticator.authenticatorId,
    });
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    });
    const replacement = await page.evaluate(() =>
      window.nearAuth.passkey.addPasskey(),
    );
    assert.equal(replacement.error, null);
    assert.equal(
      database.prepare("SELECT count(*) AS n FROM passkey").get().n,
      1,
    );
    await page.evaluate(() => window.nearAuth.signOut());
    const reuse = await page.evaluate(
      async ({ email, otp }) => window.nearAuth.signIn.emailOtp({ email, otp }),
      { email: recoveryEmail, otp: recoveryCode },
    );
    assert.ok(reuse.error);

    const deletion = await page.evaluate(async () => {
      const session = await window.nearAuth.signIn.passkey();
      if (session.error) return { error: session.error.message };
      const deleted = await window.nearAuth.deleteUser();
      return { error: deleted.error?.message ?? null };
    });
    assert.deepEqual(deletion, { error: null });
    assert.equal(database.prepare("SELECT count(*) AS n FROM user").get().n, 1);
    assert.equal(database.prepare("SELECT id FROM user").get().id, otherId);
    assert.equal(
      database.prepare("SELECT count(*) AS n FROM passkey").get().n,
      0,
    );
    assert.equal(
      database.prepare("SELECT count(*) AS n FROM session").get().n,
      1,
    );
  } finally {
    await context.close();
  }
});
