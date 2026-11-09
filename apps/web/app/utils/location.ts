export const STALE_AFTER_MS = 15 * 60_000;

export function isLocationStale(updatedAt: string, now: number): boolean {
  const timestamp = Date.parse(updatedAt);
  return (
    !Number.isFinite(timestamp) ||
    timestamp > now ||
    now - timestamp >= STALE_AFTER_MS
  );
}

export function formatLocationTime(updatedAt: string, now: number): string {
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp) || timestamp > now)
    return "時刻を確認できません";
  const minutes = Math.floor((now - timestamp) / 60_000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return new Date(timestamp).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
