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

/** Recovery sessions may register a key only after both factors and only while fresh. */
export function mayRegisterPasskey(
  method: unknown,
  createdAt: Date | string | undefined,
  hasPasskey: boolean,
  now = Date.now(),
): boolean {
  if (
    method === "recovery" ||
    method === "recovery_verified" ||
    method === "recovery_complete" ||
    hasPasskey
  )
    return isRecentAuth(method, createdAt, "recovery_verified", now);
  return true;
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
  sessionId: string,
  revoke:
    | ((
        userId: string,
        keepPasskeyId: string,
        sessionId: string,
      ) => Promise<void>)
    | undefined,
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
  await revoke(userId, result.id, sessionId);
}
