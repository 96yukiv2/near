const RECENT_AUTH_MS = 5 * 60_000;

export function isRecentAuth(
  method: unknown,
  createdAt: Date | string | undefined,
  expectedMethod: "passkey" | "recovery" | "recovery_verified",
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

/** Revoke old credentials only after a new credential is persisted for this user. */
export async function completePasskeyRecovery(
  method: unknown,
  userId: string,
  result: unknown,
  revoke:
    ((userId: string, keepPasskeyId: string) => Promise<void>) | undefined,
): Promise<void> {
  if (method !== "recovery_verified") return;
  if (
    !result ||
    typeof result !== "object" ||
    !("id" in result) ||
    typeof result.id !== "string" ||
    !result.id ||
    !("userId" in result) ||
    result.userId !== userId
  )
    return;
  if (!revoke) throw new Error("Recovery unavailable");
  await revoke(userId, result.id);
}
