import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  createRecoveryCode,
  createSignInProof,
  getProofAddress,
} from "./recovery";

describe("recovery code sign-in", () => {
  it("creates a random secret and signs without including it in the proof", async () => {
    const code = createRecoveryCode();
    expect(code).toMatch(/^0x[0-9a-f]{64}$/);
    expect(createRecoveryCode()).not.toBe(code);
    const proof = await createSignInProof(code, "https://near.example");
    expect(proof.message).not.toContain(code);
    expect(proof.signature).not.toContain(code.slice(2));
    expect(await getProofAddress(proof.message, proof.signature)).toBe(
      privateKeyToAccount(code).address,
    );
    expect(proof.message).toContain("near.example wants you to sign in");
  });
  it("rejects malformed secrets and insecure non-local origins", async () => {
    await expect(
      createSignInProof("not-a-secret", "https://near.example"),
    ).rejects.toThrow();
    await expect(
      createSignInProof(createRecoveryCode(), "http://near.example"),
    ).rejects.toThrow("secure_origin_required");
  });
  it("produces a fresh proof for each sign-in attempt", async () => {
    const code = createRecoveryCode();
    const first = await createSignInProof(code, "http://localhost:3000");
    const second = await createSignInProof(code, "http://localhost:3000");
    expect(first.message).not.toBe(second.message);
    expect(await getProofAddress(first.message, first.signature)).toBe(
      await getProofAddress(second.message, second.signature),
    );
  });
});
