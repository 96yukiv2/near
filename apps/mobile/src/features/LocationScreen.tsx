import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Camera,
  Map as MapView,
  ViewAnnotation,
  TransformRequestManager,
  type CameraRef,
  type MapRef,
  type StyleSpecification,
} from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";
import {
  beginBackgroundLocation,
  stopBackgroundLocation,
} from "./location-task";

interface Place {
  id: string;
  name: string;
  icon?: string;
  latitude: number;
  longitude: number;
  accuracy_m: number;
  updated_at: string;
}
interface LocationState {
  sharing: boolean;
  locations: Place[];
}
const symbols: Record<string, string> = {
  sun: "☀️",
  moon: "🌙",
  flower: "🌼",
  cat: "🐱",
  dog: "🐶",
  frog: "🐸",
  bear: "🐻",
  star: "⭐",
};
// Raster tiles include labels in the image and avoid incomplete glyph ranges in
// the vector style. Keep attribution visible through MapLibre's control.
TransformRequestManager.addHeader({
  id: "near-osm-user-agent",
  match: "^https://tile\\.openstreetmap\\.org/",
  name: "User-Agent",
  value: "Near/0.1 (+https://github.com/96yukiv2/near)",
});
const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
      paint: { "raster-saturation": -0.15, "raster-contrast": -0.08 },
    },
  ],
};

export function LocationScreen({
  userId,
  onBusyChange,
}: {
  userId: string;
  onBusyChange: (value: boolean) => void;
}) {
  const [state, setState] = useState<LocationState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const camera = useRef<CameraRef>(null);
  const map = useRef<MapRef>(null);
  const centered = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const sequence = useRef(0);
  const mounted = useRef(false);
  const currentId = useRef(userId);
  currentId.current = userId;
  const refresh = useCallback(async () => {
    if (!supabase) return;
    const order = ++sequence.current;
    const { data, error: err } = await supabase.rpc("near_location_action", {
      action: "list",
    });
    if (order !== sequence.current || currentId.current !== userId) return;
    if (err) {
      setError("位置を取得できませんでした。通信を確認してください。");
      return;
    }
    setState(data as LocationState);
  }, [userId]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const interval = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 30_000);
    return () => {
      mounted.current = false;
      sequence.current++;
      clearInterval(interval);
    };
  }, [refresh]);
  useEffect(() => {
    if (!mapReady || centered.current) return;
    let cancelled = false;
    const own = state?.locations.find((place) => place.id === userId);
    async function centerInitial() {
      if (own) {
        centered.current = true;
        camera.current?.jumpTo({
          center: [own.longitude, own.latitude],
          zoom: 13,
        });
        return;
      }
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted || cancelled || centered.current) return;
      const position = await Location.getLastKnownPositionAsync({
        maxAge: 24 * 60 * 60_000,
      });
      if (position && !cancelled && !centered.current) {
        centered.current = true;
        camera.current?.jumpTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 13,
        });
      }
    }
    void centerInitial().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mapReady, state, userId]);

  async function focusCurrentLocation() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("現在地を表示するには位置情報の許可が必要です。");
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      centered.current = true;
      camera.current?.flyTo({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: 14,
        duration: 600,
      });
      setError("");
    } catch {
      setError(
        "現在地を取得できませんでした。位置情報の設定を確認してください。",
      );
    }
  }
  async function zoomBy(delta: number) {
    const zoom = await map.current?.getZoom();
    if (zoom !== undefined)
      camera.current?.zoomTo(Math.min(19, Math.max(2, zoom + delta)), {
        duration: 250,
      });
  }
  async function start() {
    if (!supabase || busy) return;
    setBusy(true);
    onBusyChange(true);
    setError("");
    let startAttempted = false;
    try {
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (!foreground.granted) throw new Error("位置情報の許可が必要です。");
      const background = await Location.requestBackgroundPermissionsAsync();
      if (!background.granted)
        throw new Error("バックグラウンド位置情報の許可が必要です。");
      const point = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (point.coords.accuracy == null)
        throw new Error("位置の精度を取得できませんでした。");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted.current || !session || session.user.id !== userId)
        throw new Error("ログイン状態が変わりました。");
      startAttempted = true;
      const { error: err } = await supabase.rpc("near_location_action", {
        action: "start",
        latitude: point.coords.latitude,
        longitude: point.coords.longitude,
        accuracy_m: point.coords.accuracy,
      });
      if (err)
        throw new Error(
          "共有を開始できませんでした。表示名と通信を確認してください。",
        );
      const {
        data: { session: afterStart },
      } = await supabase.auth.getSession();
      if (!mounted.current || !afterStart || afterStart.user.id !== userId)
        throw new Error("ログイン状態が変わりました。");
      await beginBackgroundLocation(userId);
      await refresh();
    } catch (err) {
      if (startAttempted) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session || session.user.id !== userId) {
          setState(null);
          setError(
            "共有状態を確認できません。元のアカウントで確認してください。",
          );
          return;
        }
        const { error: rollbackError } = await supabase.rpc(
          "near_location_action",
          { action: "stop" },
        );
        if (rollbackError) {
          setState(null);
          setError(
            "共有停止を確認できません。通信を確認し、もう一度停止してください。",
          );
          setBusy(false);
          return;
        }
      }
      setError(
        err instanceof Error ? err.message : "位置共有を開始できませんでした。",
      );
      await refresh();
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  async function stop() {
    if (!supabase || busy) return;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      await stopBackgroundLocation();
      const { error: err } = await supabase.rpc("near_location_action", {
        action: "stop",
      });
      if (err) throw err;
      await refresh();
    } catch {
      setState(null);
      setError(
        "共有停止を確認できません。通信を確認し、もう一度停止してください。",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <View style={styles.container}>
      <View style={styles.mapFrame}>
        <MapView
          ref={map}
          style={styles.map}
          mapStyle={mapStyle}
          onDidFinishLoadingMap={() => setMapReady(true)}
        >
          <Camera
            ref={camera}
            initialViewState={{ center: [139.7, 35.66], zoom: 4 }}
          />
          {state?.locations.map((p) => (
            <ViewAnnotation
              key={p.id}
              id={p.id}
              lngLat={[p.longitude, p.latitude]}
            >
              <View style={styles.pin}>
                <Text>{symbols[p.icon ?? "sun"] ?? "☀️"}</Text>
              </View>
            </ViewAnnotation>
          ))}
        </MapView>
        <View style={styles.mapControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="地図を拡大"
            onPress={() => void zoomBy(1)}
            style={styles.mapControl}
          >
            <Text style={styles.mapControlText}>＋</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="地図を縮小"
            onPress={() => void zoomBy(-1)}
            style={styles.mapControl}
          >
            <Text style={styles.mapControlText}>−</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="現在地に移動"
            onPress={() => void focusCurrentLocation()}
            style={styles.mapControl}
          >
            <Text style={styles.mapControlText}>◎</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView style={styles.panel} contentContainerStyle={styles.content}>
        <Text style={styles.title}>みんなの現在地</Text>
        <Text style={styles.label}>
          {state
            ? state.sharing
              ? "位置を共有中"
              : "位置共有はオフ"
            : "共有状態を確認できていません"}
        </Text>
        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        <Text style={styles.label}>
          共有中は通知が表示されます。OSの設定により更新が止まる場合があります。
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() =>
            state?.sharing || !state
              ? void stop()
              : Alert.alert(
                  "位置共有を開始",
                  "アプリを開いていない間も、承認済みの友達に現在地を共有します。",
                  [
                    { text: "キャンセル" },
                    { text: "開始", onPress: () => void start() },
                  ],
                )
          }
          style={styles.button}
        >
          <Text style={styles.buttonText}>
            {state?.sharing || !state ? "位置共有を停止" : "位置共有を開始"}
          </Text>
        </Pressable>
        {!state?.locations.length && (
          <Text style={styles.label}>表示できる位置はありません。</Text>
        )}
        {state?.locations.map((p) => {
          const age = now - Date.parse(p.updated_at);
          const stale = !Number.isFinite(age) || age < 0 || age >= 15 * 60_000;
          return (
            <Pressable
              key={p.id}
              onPress={() =>
                camera.current?.flyTo({
                  center: [p.longitude, p.latitude],
                  zoom: 13,
                  duration: 1200,
                })
              }
              style={styles.person}
            >
              <Text style={styles.label}>
                {symbols[p.icon ?? "sun"] ?? "☀️"} {p.name}
                {p.id === userId ? "（自分）" : ""}
              </Text>
              <Text style={styles.label}>
                {stale ? "古い位置 · " : ""}
                {Number.isFinite(age) && age >= 0
                  ? `${Math.floor(age / 60_000)}分前`
                  : "時刻不明"}{" "}
                · 精度 約{Math.round(p.accuracy_m)}m
              </Text>
            </Pressable>
          );
        })}
        <Text style={styles.label}>
          地図表示時、OpenStreetMap に IP アドレスと表示範囲が送られます。
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
  mapFrame: {
    flex: 1,
    minHeight: 220,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#e7f1eb",
  },
  map: { flex: 1 },
  mapControls: { position: "absolute", top: 12, right: 12, gap: 6 },
  mapControl: {
    backgroundColor: "#fffdf9",
    borderRadius: 14,
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },
  mapControlText: { color: "#5a5964", fontSize: 22, fontWeight: "700" },
  panel: { flexGrow: 0, maxHeight: "37%" },
  content: { gap: 10, paddingVertical: 16 },
  title: { color: "#2f3441", fontSize: 22, fontWeight: "700" },
  label: { color: "#606879", fontSize: 14, lineHeight: 22 },
  error: { color: "#a83d30" },
  button: {
    backgroundColor: "#e76a53",
    borderRadius: 18,
    padding: 12,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "700" },
  person: { padding: 12, backgroundColor: "#fff", borderRadius: 12 },
  pin: { backgroundColor: "#fff", borderRadius: 20, padding: 8 },
});
