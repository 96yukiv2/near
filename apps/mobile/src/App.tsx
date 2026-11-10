import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { signIn, supabase } from "./lib/supabase";
import { friendAction, type Relationships } from "./features/friends";
import { LocationScreen } from "./features/LocationScreen";
import { stopBackgroundLocation } from "./features/location-task";
import { parseInvitation } from "./features/invitation";

const empty: Relationships = {
  friends: [],
  incoming: [],
  outgoing: [],
  blocked: [],
};
const icons = [
  "sun",
  "moon",
  "flower",
  "cat",
  "dog",
  "frog",
  "bear",
  "star",
] as const;
const symbols = ["☀️", "🌙", "🌼", "🐱", "🐶", "🐸", "🐻", "⭐"];
type Tab = "map" | "friends" | "profile";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("map");
  const [relations, setRelations] = useState<Relationships>(empty);
  const [name, setName] = useState("");
  const [invitation, setInvitation] = useState("");
  const [icon, setIcon] = useState<string>("sun");
  const [message, setMessage] = useState("");
  const currentUser = useRef<string | null>(null);

  const refresh = useCallback(async (current: Session) => {
    if (!supabase) return;
    const [profile, friends] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name,icon")
        .eq("id", current.user.id)
        .maybeSingle(),
      friendAction(supabase, "list") as Promise<Relationships>,
    ]);
    if (currentUser.current !== current.user.id) return;
    if (profile.error) throw profile.error;
    setName(profile.data?.display_name ?? "");
    setIcon(profile.data?.icon ?? "sun");
    setRelations(friends);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    const client = supabase;
    const { data } = client.auth.onAuthStateChange((_event, current) => {
      currentUser.current = current?.user.id ?? null;
      setSession(current);
      setReady(true);
      if (current)
        setTimeout(
          () =>
            void refresh(current).catch(() =>
              setMessage("情報を読み込めませんでした。"),
            ),
          0,
        );
      else {
        void stopBackgroundLocation().catch(() => undefined);
        setRelations(empty);
        setInvitation("");
        setName("");
        setIcon("sun");
      }
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
    if (AppState.currentState === "active") client.auth.startAutoRefresh();
    return () => {
      currentUser.current = null;
      data.subscription.unsubscribe();
      subscription.remove();
      client.auth.stopAutoRefresh();
    };
  }, [refresh]);

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch {
      setMessage(
        "操作できませんでした。接続やアカウントの状態を確認してください。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function act(action: string, target?: string) {
    if (!supabase || !session) return;
    await run(async () => {
      await friendAction(supabase!, action, target);
      await refresh(session);
    });
  }
  async function invite() {
    if (!supabase) return;
    await run(async () => {
      const web = process.env.EXPO_PUBLIC_WEB_URL;
      if (!web || !web.startsWith("https://"))
        throw new Error("web URL required");
      const result = await friendAction(supabase!, "create_invite");
      await Share.share({
        message: `${web.replace(/\/$/, "")}/friends#invite=${result.token}`,
      });
    });
  }
  async function requestFriend() {
    if (!supabase || !session) return;
    const token = parseInvitation(invitation, process.env.EXPO_PUBLIC_WEB_URL);
    if (!token) {
      setMessage("Near の有効な招待リンクを入力してください。");
      return;
    }
    if (!name.trim()) {
      setMessage("先に設定画面で表示名を保存してください。");
      return;
    }
    await run(async () => {
      await friendAction(supabase!, "request", undefined, token);
      setInvitation("");
      await refresh(session);
      setMessage("友達申請を送りました。相手の承認を待ちましょう。");
    });
  }
  async function saveProfile() {
    if (!supabase || !session) return;
    const value = name.trim();
    if (!value || [...value].length > 40) {
      setMessage("表示名は1〜40文字で入力してください。");
      return;
    }
    await run(async () => {
      const { error } = await supabase!.from("profiles").upsert({
        id: session.user.id,
        display_name: value,
        icon,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setName(value);
      setMessage("プロフィールを保存しました。");
    });
  }
  const button = (label: string, onPress: () => void, secondary = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={[styles.button, secondary && styles.secondary]}
    >
      <Text style={secondary ? styles.secondaryText : styles.buttonText}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.brand}>near.</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {!!message && (
          <Text accessibilityRole="alert" style={styles.notice}>
            {message}
          </Text>
        )}
        {!ready ? (
          <ActivityIndicator />
        ) : !supabase ? (
          <Text style={styles.text}>
            接続先を設定してください。設定方法は mobile の README
            を参照してください。
          </Text>
        ) : !session ? (
          <>
            <Text style={styles.title}>いつものみんなを、もっと近くに。</Text>
            <Text style={styles.text}>パスキーを使ってログインします。</Text>
            {button("パスキーではじめる", () => void run(signIn))}
          </>
        ) : tab === "map" ? (
          <LocationScreen
            key={session.user.id}
            userId={session.user.id}
            onBusyChange={setBusy}
          />
        ) : tab === "profile" ? (
          <>
            <Text style={styles.title}>プロフィール</Text>
            <Text style={styles.text}>表示名</Text>
            <TextInput
              accessibilityLabel="表示名"
              style={styles.input}
              value={name}
              onChangeText={setName}
              maxLength={80}
            />
            <Text style={styles.text}>アイコン</Text>
            <View style={styles.icons}>
              {icons.map((value, i) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={value}
                  accessibilityState={{ selected: icon === value }}
                  key={value}
                  onPress={() => setIcon(value)}
                  style={[styles.icon, icon === value && styles.selected]}
                >
                  <Text style={styles.emoji}>{symbols[i]}</Text>
                </Pressable>
              ))}
            </View>
            {button("保存する", () => void saveProfile())}
            {button(
              "ログアウト",
              () =>
                Alert.alert(
                  "ログアウト",
                  "位置共有を停止してログアウトしますか？",
                  [
                    { text: "キャンセル" },
                    {
                      text: "ログアウト",
                      onPress: () =>
                        void run(async () => {
                          await stopBackgroundLocation();
                          const { error: stopError } = await supabase!.rpc(
                            "near_location_action",
                            { action: "stop" },
                          );
                          if (stopError) throw stopError;
                          const { error } = await supabase!.auth.signOut();
                          if (error) throw error;
                        }),
                    },
                  ],
                ),
              true,
            )}
            <Text style={styles.text}>
              アカウント削除はWeb版の設定画面から行えます。復旧は準備中です。
            </Text>
            {button(
              "Webの設定画面を開く",
              () =>
                void run(async () => {
                  const web = process.env.EXPO_PUBLIC_WEB_URL;
                  if (!web || !web.startsWith("https://"))
                    throw new Error("web URL required");
                  const url = new URL("/account", web);
                  await Linking.openURL(url.toString());
                }),
              true,
            )}
          </>
        ) : (
          <>
            <Text style={styles.title}>友達とつながろう。</Text>
            <Text style={styles.text}>
              招待リンクを送り、相手からの申請を承認します。
            </Text>
            {button("友達を招待する", () => void invite())}
            <Text style={styles.heading}>招待を受け取る</Text>
            <Text style={styles.text}>
              友達からの招待リンクを貼り付けて申請します。
            </Text>
            <TextInput
              accessibilityLabel="招待リンク"
              autoCapitalize="none"
              autoCorrect={false}
              value={invitation}
              onChangeText={setInvitation}
              style={styles.input}
              placeholder="https://.../friends#invite=..."
            />
            {button("友達申請を送る", () => void requestFriend(), true)}
            <Text style={styles.heading}>届いた申請</Text>
            {relations.incoming.length === 0 && (
              <Text style={styles.text}>申請はありません。</Text>
            )}
            {relations.incoming.map((item) => (
              <View key={item.id} style={styles.row}>
                <Text style={styles.text}>{item.name}</Text>
                {button("承認", () => void act("accept", item.id), true)}
                {button("断る", () => void act("decline", item.id), true)}
              </View>
            ))}
            <Text style={styles.heading}>友達</Text>
            {relations.friends.length === 0 && (
              <Text style={styles.text}>まだ友達はいません。</Text>
            )}
            {relations.friends.map((friend) => (
              <View key={friend.id} style={styles.row}>
                <Text style={styles.text}>{friend.name}</Text>
                {button(
                  "削除",
                  () =>
                    Alert.alert(
                      "友達を削除",
                      `${friend.name}さんを削除しますか？`,
                      [
                        { text: "キャンセル" },
                        {
                          text: "削除",
                          style: "destructive",
                          onPress: () => void act("remove", friend.id),
                        },
                      ],
                    ),
                  true,
                )}
                {button(
                  "ブロック",
                  () =>
                    Alert.alert(
                      "ブロック",
                      `${friend.name}さんをブロックしますか？`,
                      [
                        { text: "キャンセル" },
                        {
                          text: "ブロック",
                          style: "destructive",
                          onPress: () => void act("block", friend.id),
                        },
                      ],
                    ),
                  true,
                )}
              </View>
            ))}
            <Text style={styles.heading}>承認待ち</Text>
            {relations.outgoing.length === 0 && (
              <Text style={styles.text}>承認待ちの申請はありません。</Text>
            )}
            {relations.outgoing.map((item) => (
              <Text key={item.id} style={styles.text}>
                {item.name}
              </Text>
            ))}
            <Text style={styles.heading}>ブロック中</Text>
            {relations.blocked.length === 0 && (
              <Text style={styles.text}>ブロック中の人はいません。</Text>
            )}
            {relations.blocked.map((item) => (
              <View key={item.id} style={styles.row}>
                <Text style={styles.text}>{item.name}</Text>
                {button("解除", () => void act("unblock", item.id), true)}
              </View>
            ))}
          </>
        )}
      </ScrollView>
      {session && (
        <View style={styles.nav}>
          {button("地図", () => setTab("map"), tab !== "map")}
          {button("友達", () => setTab("friends"), tab !== "friends")}
          {button("設定", () => setTab("profile"), tab !== "profile")}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fffaf1" },
  header: { paddingHorizontal: 24, paddingTop: 24 },
  brand: { color: "#e76a53", fontSize: 32, fontWeight: "800" },
  content: { padding: 24, gap: 14, paddingBottom: 40 },
  title: { color: "#2f3441", fontSize: 24, fontWeight: "700" },
  heading: { color: "#2f3441", fontSize: 18, fontWeight: "700", marginTop: 12 },
  text: { color: "#606879", fontSize: 16, lineHeight: 24 },
  notice: {
    color: "#8c4035",
    backgroundColor: "#ffe4dc",
    padding: 12,
    borderRadius: 12,
  },
  button: {
    backgroundColor: "#e76a53",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  secondary: { backgroundColor: "#f5e7d8" },
  buttonText: { color: "#fff", fontWeight: "700" },
  secondaryText: { color: "#784938", fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#ddcfc1",
    borderRadius: 12,
    padding: 12,
    color: "#2f3441",
  },
  icons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  icon: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selected: { borderColor: "#e76a53" },
  emoji: { fontSize: 26 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  nav: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 12,
    backgroundColor: "#fff",
  },
});
