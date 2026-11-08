import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const {
  TEST_SUPABASE_URL: url,
  TEST_SUPABASE_ANON_KEY: anonKey,
  TEST_SUPABASE_SERVICE_ROLE_KEY: serviceKey,
} = process.env;
if (!url || !anonKey || !serviceKey)
  throw new Error(
    "Set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_ROLE_KEY for a disposable local Supabase instance.",
  );
const parsed = new URL(url);
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname))
  throw new Error(
    "These destructive test operations are restricted to local Supabase.",
  );
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
const anonymous = createClient(url, anonKey, options);

test("profile API restricts access to its owner", async () => {
  const ids = [];
  try {
    const accounts = [];
    for (let i = 0; i < 2; i++) {
      const email = `near-test-${crypto.randomUUID()}@example.test`;
      const password = crypto.randomUUID();
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      assert.ifError(created.error);
      ids.push(created.data.user.id);
      const user = createClient(url, anonKey, options);
      const login = await user.auth.signInWithPassword({ email, password });
      assert.ifError(login.error);
      accounts.push(user);
    }
    const [alice, bob] = accounts;
    const own = await alice
      .from("profiles")
      .insert({ id: ids[0], display_name: "Alice" });
    assert.ifError(own.error);
    const ownRead = await alice
      .from("profiles")
      .select("id, display_name")
      .eq("id", ids[0]);
    assert.equal(ownRead.data?.[0]?.display_name, "Alice");
    const otherRead = await bob.from("profiles").select("id").eq("id", ids[0]);
    assert.ifError(otherRead.error);
    assert.deepEqual(otherRead.data, []);
    const anonRead = await anonymous.from("profiles").select("id");
    assert.ok(anonRead.error || anonRead.data?.length === 0);
    const impersonate = await bob
      .from("profiles")
      .insert({ id: ids[0], display_name: "forged" });
    assert.ok(impersonate.error);
    const changeOther = await bob
      .from("profiles")
      .update({ display_name: "forged" })
      .eq("id", ids[0])
      .select();
    assert.ifError(changeOther.error);
    assert.deepEqual(changeOther.data, []);
    const invalid = await bob
      .from("profiles")
      .insert({ id: ids[1], display_name: "   " });
    assert.ok(invalid.error);
    const after = await alice.from("profiles").select("display_name").single();
    assert.equal(after.data?.display_name, "Alice");
  } finally {
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  }
});
