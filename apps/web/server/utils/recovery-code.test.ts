import { describe, expect, it } from "vitest";
import {
  checkRecoveryCode,
  generateRecoveryCode,
  hashRecoveryCode,
  reservedForAnotherSession,
} from "./recovery-code";

describe("recovery codes", () => {
  it("generates a high-entropy code and verifies its keyed hash", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const hash = hashRecoveryCode(code, "test-secret");
    expect(hash).not.toContain(code);
    const initial = { hash, attempts: 0, lockedUntil: 0 };
    expect(checkRecoveryCode(initial, hash, 1000).accepted).toBe(true);
    expect(
      checkRecoveryCode(initial, hashRecoveryCode(code, "other-secret"), 1000)
        .accepted,
    ).toBe(false);
  });

  it("reserves a recovery code for one session until the reservation expires", () => {
    const state = {
      hash: "hash",
      attempts: 0,
      lockedUntil: 0,
      reservedSession: "first",
      reservedUntil: 5000,
    };
    expect(reservedForAnotherSession(state, "first", 1000)).toBe(false);
    expect(reservedForAnotherSession(state, "second", 1000)).toBe(true);
    expect(reservedForAnotherSession(state, "second", 5000)).toBe(false);
  });

  it("locks attempts for 15 minutes after five failures", () => {
    let state = {
      hash: hashRecoveryCode("correct", "secret"),
      attempts: 0,
      lockedUntil: 0,
    };
    const bad = hashRecoveryCode("wrong", "secret");
    for (let i = 0; i < 5; i++)
      state = checkRecoveryCode(state, bad, 1000).state;
    expect(checkRecoveryCode(state, state.hash, 1001).accepted).toBe(false);
    expect(checkRecoveryCode(state, state.hash, 901000).accepted).toBe(true);
  });
});
