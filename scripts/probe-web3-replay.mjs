// Security probe against a disposable local Supabase only; never output the key or proof.
import { createClient } from "@supabase/supabase-js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { bytesToHex } from "viem";
const {
  TEST_SUPABASE_URL: url,
  TEST_SUPABASE_ANON_KEY: key,
  TEST_SUPABASE_SERVICE_ROLE_KEY: serviceKey,
} = process.env;
if (
  !url ||
  !key ||
  !serviceKey ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw new Error("Disposable local Supabase required");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
const client = createClient(url, key, options);
const account = privateKeyToAccount(generatePrivateKey());
const now = new Date();
const message = createSiweMessage({
  address: account.address,
  chainId: 1,
  domain: "localhost:3000",
  nonce: bytesToHex(crypto.getRandomValues(new Uint8Array(16))).slice(2),
  uri: "http://localhost:3000/account",
  version: "1",
  issuedAt: now,
  notBefore: new Date(now.getTime() - 5000),
  expirationTime: new Date(now.getTime() + 120000),
});
const signature = await account.signMessage({ message });
let userId;
try {
  const first = await client.auth.signInWithWeb3({
    chain: "ethereum",
    message,
    signature,
  });
  if (first.error)
    throw new Error(`initial sign-in failed: ${first.error.message}`);
  userId = first.data.user.id;
  const second = await createClient(url, key, options).auth.signInWithWeb3({
    chain: "ethereum",
    message,
    signature,
  });
  console.log(
    `SECURITY PROBE: repeated proof ${second.error ? "rejected" : "accepted"}`,
  );
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
}
