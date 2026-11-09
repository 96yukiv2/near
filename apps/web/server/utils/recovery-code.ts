import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const RECOVERY_PREFIX = "near-recovery-code:";
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;

export type RecoveryState = {
  hash: string;
  attempts: number;
  lockedUntil: number;
};

export function generateRecoveryCode() {
  return randomBytes(24).toString("base64url");
}

export function hashRecoveryCode(code: string, secret: string) {
  return createHmac("sha256", secret).update(code).digest("hex");
}

export function checkRecoveryCode(
  state: RecoveryState,
  candidateHash: string,
  now: number,
): { state: RecoveryState; accepted: boolean } {
  if (state.lockedUntil > now) return { state, accepted: false };
  const attempts = state.lockedUntil > 0 ? 0 : state.attempts;
  const expected = Buffer.from(state.hash, "hex");
  const candidate = Buffer.from(candidateHash, "hex");
  if (
    expected.length === 32 &&
    candidate.length === 32 &&
    timingSafeEqual(expected, candidate)
  )
    return { state, accepted: true };
  const nextAttempts = attempts + 1;
  return {
    state: {
      ...state,
      attempts: nextAttempts,
      lockedUntil: nextAttempts >= MAX_ATTEMPTS ? now + LOCK_MS : 0,
    },
    accepted: false,
  };
}
