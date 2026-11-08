const RECENT_AUTH_MS = 5 * 60_000;

export function isRecentAuth(
  method: unknown,
  createdAt: Date | string | undefined,
  expectedMethod: "passkey" | "recovery",
  now = Date.now(),
): boolean {
  if (method !== expectedMethod || !createdAt) return false;
  const age = now - new Date(createdAt).getTime();
  return Number.isFinite(age) && age >= 0 && age <= RECENT_AUTH_MS;
}

export function mayIssueAuthorization(
  method: unknown,
  hasPasskey: boolean,
): boolean {
  return method === "passkey" && hasPasskey;
}
