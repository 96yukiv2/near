import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { getAuthorizationCode } from "./auth-callback";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const callbackUrl = "near://auth/callback";

const storage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) =>
    SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: "pkce",
        },
      })
    : null;

export async function signIn() {
  if (!supabase) throw new Error("接続先が設定されていません。");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "custom:near",
    options: {
      redirectTo: callbackUrl,
      scopes: "openid",
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) throw new Error("認証を開始できませんでした。");
  const result = await WebBrowser.openAuthSessionAsync(data.url, callbackUrl);
  if (result.type !== "success") return;
  const code = getAuthorizationCode(result.url);
  if (!code) throw new Error("認証を完了できませんでした。");
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw new Error("認証を完了できませんでした。");
}
