import { describe, expect, it } from "vitest";
import { parseInvitation } from "./invitation";

describe("friend invitation", () => {
  const origin = "https://near.example";
  const token = "ab".repeat(32);
  it("accepts a Near invitation and rejects different origins and invalid tokens", () => {
    expect(parseInvitation(`${origin}/friends#invite=${token}`, origin)).toBe(
      token,
    );
    expect(
      parseInvitation(`https://other.example/friends#invite=${token}`, origin),
    ).toBeNull();
    expect(parseInvitation(`${origin}/friends#invite=bad`, origin)).toBeNull();
    expect(
      parseInvitation(
        `${origin}/friends#invite=${token}&invite=${token}`,
        origin,
      ),
    ).toBeNull();
  });
});
