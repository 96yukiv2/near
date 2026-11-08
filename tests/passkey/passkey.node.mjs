import assert from "node:assert/strict";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { toNodeHandler } from "better-auth/node";
import { anonymous } from "better-auth/plugins";
import { build } from "esbuild";
import { chromium } from "playwright";

let server;
let browser;
let script;
let database;
const origin = "http://localhost:33331";

before(async () => {
  database = new DatabaseSync(":memory:");
  const options = {
    baseURL: origin,
    secret: "local-test-secret-never-used-in-production-123456",
    database,
    plugins: [anonymous(), passkey({ rpID: "localhost", origin })],
  };
  await (await getMigrations(options)).runMigrations();
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
        import { anonymousClient } from 'better-auth/client/plugins';
        import { passkeyClient } from '@better-auth/passkey/client';
        window.nearAuth = createAuthClient({ baseURL: ${JSON.stringify(origin)}, plugins: [anonymousClient(), passkeyClient()] });`,
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
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    });
    await page.goto(origin);
    await page.addScriptTag({ content: script });
    const result = await page.evaluate(async () => {
      const created = await window.nearAuth.signIn.anonymous();
      if (created.error) return { error: created.error.message };
      const id = created.data.user.id;
      const registered = await window.nearAuth.passkey.addPasskey();
      if (registered.error) return { error: registered.error.message };
      await window.nearAuth.signOut();
      const signedIn = await window.nearAuth.signIn.passkey();
      if (signedIn.error) return { error: signedIn.error.message };
      return { sameUser: signedIn.data.user.id === id };
    });
    assert.deepEqual(result, { sameUser: true });
    const users = database.prepare("SELECT email FROM user").all();
    assert.equal(users.length, 1);
    assert.match(users[0].email, /@anonymous\.placeholder\.invalid$/);
  } finally {
    await context.close();
  }
});
