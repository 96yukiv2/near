import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const {
  TEST_SUPABASE_URL: url,
  TEST_SUPABASE_ANON_KEY: key,
  TEST_SUPABASE_SERVICE_ROLE_KEY: serviceKey,
} = process.env;
if (!url || !key || !serviceKey)
  throw new Error("Local Supabase test configuration is missing");
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(url).hostname))
  throw new Error("Tests may run only against disposable local Supabase");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);

test("account deletion requires a user JWT and deletes only that user's data", async () => {
  const ids = [];
  try {
    const users = [];
    for (let i = 0; i < 2; i++) {
      const email = `near-delete-${crypto.randomUUID()}@example.test`,
        password = crypto.randomUUID();
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      assert.ifError(created.error);
      ids.push(created.data.user.id);
      const user = createClient(url, key, options);
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
    const [a, b] = users;
    const anonymous = createClient(url, key, options);
    assert.ok(
      (await anonymous.functions.invoke("delete-account", { body: {} })).error,
    );
    assert.ifError(
      (
        await a.rpc("near_location_action", {
          action: "start",
          latitude: 35,
          longitude: 139,
          accuracy_m: 20,
        })
      ).error,
    );
    const invite = await a.rpc("near_friend_action", {
      action: "create_invite",
    });
    assert.ifError(invite.error);
    assert.ifError(
      (
        await b.rpc("near_friend_action", {
          action: "request",
          token: invite.data.token,
        })
      ).error,
    );
    const incoming = await a.rpc("near_friend_action", { action: "list" });
    assert.ifError(incoming.error);
    assert.ifError(
      (
        await a.rpc("near_friend_action", {
          action: "accept",
          target: incoming.data.incoming[0].id,
        })
      ).error,
    );
    assert.equal(
      (await b.rpc("near_location_action", { action: "list" })).data
        .locations[0].id,
      ids[0],
    );
    const deletedId = ids[0];
    const deletion = await a.functions.invoke("delete-account", {
      body: { id: ids[1] },
    });
    if (deletion.error?.context instanceof Response) {
      const body = await deletion.error.context.text();
      assert.fail(
        `Account deletion failed: ${deletion.error.context.status} ${body}`,
      );
    }
    assert.ifError(deletion.error);
    assert.equal(deletion.data.message, "deleted");
    ids.shift();
    assert.ok((await admin.auth.admin.getUserById(deletedId)).error);
    assert.ifError((await admin.auth.admin.getUserById(ids[0])).error);
    const locations = await b.rpc("near_location_action", { action: "list" });
    assert.ifError(locations.error);
    assert.equal(locations.data.locations.length, 0);
    const friends = await b.rpc("near_friend_action", { action: "list" });
    assert.ifError(friends.error);
    assert.equal(friends.data.friends.length, 0);
  } finally {
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  }
});
