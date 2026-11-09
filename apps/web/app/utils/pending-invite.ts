const KEY = "near.pending-invite";
const VALID_FOR_MS = 24 * 60 * 60_000;
const TOKEN = /^[0-9a-f]{64}$/;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Keep the invitation in the same tab while the user signs in. */
export function savePendingInvite(
  storage: StorageLike,
  token: string,
  now = Date.now(),
): boolean {
  if (!TOKEN.test(token)) return false;
  try {
    storage.setItem(
      KEY,
      JSON.stringify({ token, expiresAt: now + VALID_FOR_MS }),
    );
    return true;
  } catch {
    return false;
  }
}

export function getPendingInvite(
  storage: StorageLike,
  now = Date.now(),
): string {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return "";
    const entry: unknown = JSON.parse(raw);
    if (
      entry &&
      typeof entry === "object" &&
      "token" in entry &&
      typeof entry.token === "string" &&
      TOKEN.test(entry.token) &&
      "expiresAt" in entry &&
      typeof entry.expiresAt === "number" &&
      entry.expiresAt > now &&
      entry.expiresAt <= now + VALID_FOR_MS
    )
      return entry.token;
    storage.removeItem(KEY);
  } catch {
    try {
      storage.removeItem(KEY);
    } catch {
      /* Storage is unavailable. */
    }
  }
  return "";
}

export function clearPendingInvite(storage: StorageLike) {
  try {
    storage.removeItem(KEY);
  } catch {
    /* Storage is unavailable. */
  }
}
