import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { checkLocationPermissions } from "./location-assertions.mjs";

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

test("latest locations are available only to direct friends while sharing", async () => {
  const ids = [];
  try {
    const users = [];
    for (let i = 0; i < 3; i++) {
      const email = `near-location-${crypto.randomUUID()}@example.test`,
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
    await checkLocationPermissions(
      users,
      createClient(url, key, options),
      ids,
      async (id) => {
        const { error } = await admin.auth.admin.deleteUser(id);
        assert.ifError(error);
        ids.splice(ids.indexOf(id), 1);
      },
    );
  } finally {
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  }
});
