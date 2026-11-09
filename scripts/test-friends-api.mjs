import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const {
  TEST_SUPABASE_URL: url,
  TEST_SUPABASE_ANON_KEY: anonKey,
  TEST_SUPABASE_SERVICE_ROLE_KEY: serviceKey,
} = process.env;
if (!url || !anonKey || !serviceKey)
  throw new Error("Local Supabase test configuration is missing");
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(url).hostname))
  throw new Error("Tests may run only against disposable local Supabase");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
const anonymous = createClient(url, anonKey, options);
async function call(client, action, params = {}) {
  return client.rpc("near_friend_action", { action, ...params });
}
async function ok(client, action, params = {}) {
  const { data, error } = await call(client, action, params);
  assert.ifError(error);
  return data;
}
async function denied(client, action, params = {}) {
  const { error } = await call(client, action, params);
  assert.ok(error, `${action} must be rejected`);
}

test("friend requests require consent and only direct friends are listed", async () => {
  const ids = [];
  try {
    const users = [];
    for (let i = 0; i < 3; i++) {
      const email = `near-friend-test-${crypto.randomUUID()}@example.test`,
        password = crypto.randomUUID();
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      assert.ifError(created.error);
      ids.push(created.data.user.id);
      const user = createClient(url, anonKey, options);
      assert.ifError(
        (await user.auth.signInWithPassword({ email, password })).error,
      );
      assert.ifError(
        (
          await user
            .from("profiles")
            .insert({ id: ids[i], display_name: `User ${i}` })
        ).error,
      );
      users.push(user);
    }
    const [a, b, c] = users;
    await denied(anonymous, "list");
    let invite = await ok(a, "create_invite");
    await denied(a, "request", { token: invite.token });
    await ok(b, "request", { token: invite.token });
    await denied(c, "request", { token: invite.token });
    let list = await ok(a, "list");
    assert.equal(list.incoming.length, 1);
    const request = list.incoming[0].id;
    await denied(c, "accept", { target: request });
    await denied(b, "accept", { target: request });
    assert.equal((await ok(b, "list")).friends.length, 0);
    await ok(a, "accept", { target: request });
    assert.equal((await ok(a, "list")).friends[0].id, ids[1]);
    invite = await ok(b, "create_invite");
    await ok(c, "request", { token: invite.token });
    list = await ok(b, "list");
    await ok(b, "accept", { target: list.incoming[0].id });
    assert.deepEqual(
      (await ok(a, "list")).friends.map((f) => f.id),
      [ids[1]],
    );
    assert.deepEqual(
      (await ok(c, "list")).friends.map((f) => f.id),
      [ids[1]],
    );
    await denied(c, "remove", { target: ids[0] });
    await ok(a, "block", { target: ids[1] });
    assert.equal((await ok(a, "list")).friends.length, 0);
    assert.deepEqual(
      (await ok(b, "list")).friends.map((f) => f.id),
      [ids[2]],
    );
    invite = await ok(b, "create_invite");
    await denied(a, "request", { token: invite.token });
    await ok(a, "unblock", { target: ids[1] });
    await ok(a, "request", { token: invite.token });
    list = await ok(b, "list");
    await ok(b, "accept", { target: list.incoming[0].id });
    await ok(a, "remove", { target: ids[1] });
    assert.equal((await ok(a, "list")).friends.length, 0);
  } finally {
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  }
});
