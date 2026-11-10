import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";
import { supabase } from "../lib/supabase";
import { canSendBackgroundLocation } from "./location-policy";

export const LOCATION_TASK = "near-background-location";
const ownerKey = "near-location-owner";

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    if (error || !data?.locations?.length || !supabase) return;
    const owner = await SecureStore.getItemAsync(ownerKey);
    if (!owner) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    const point = data.locations[data.locations.length - 1];
    if (
      !point ||
      !canSendBackgroundLocation(
        owner,
        session.user.id,
        point.timestamp,
        point.coords.accuracy,
        Date.now(),
      )
    )
      return;
    // Pin the request to the checked session even if the active account changes.
    // The server rejects updates after sharing is stopped.
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key || !url.startsWith("https://")) return;
    try {
      await fetch(
        `${url.replace(/\/$/, "")}/rest/v1/rpc/near_location_action`,
        {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "update",
            latitude: point.coords.latitude,
            longitude: point.coords.longitude,
            accuracy_m: point.coords.accuracy,
          }),
        },
      );
    } catch {
      // A later location update retries; coordinates and tokens are never logged.
    }
  },
);

export async function beginBackgroundLocation(owner: string) {
  await SecureStore.setItemAsync(ownerKey, owner);
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5 * 60_000,
      distanceInterval: 100,
      foregroundService: {
        notificationTitle: "Near で位置を共有中",
        notificationBody:
          "友達への位置共有を停止するには Near を開いてください。",
      },
    });
  } catch (error) {
    await SecureStore.deleteItemAsync(ownerKey);
    throw error;
  }
}

export async function stopBackgroundLocation() {
  await SecureStore.deleteItemAsync(ownerKey);
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}
