import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { createDeleteAccountHandler } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) throw new Error("Missing server configuration");
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(
  createDeleteAccountHandler({
    async getUser(token) {
      const { data, error } = await admin.auth.getUser(token);
      return error ? null : data.user;
    },
    async deleteUser(id) {
      const { error } = await admin.auth.admin.deleteUser(id);
      return !error;
    },
    now: () => Date.now(),
  }),
);
