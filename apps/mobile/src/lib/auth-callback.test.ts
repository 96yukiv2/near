import { describe, expect, it } from "vitest";
import { getAuthorizationCode } from "./auth-callback";

describe("mobile authentication callback", () => {
  it("accepts a code only from the expected app callback", () => {
    expect(getAuthorizationCode("near://auth/callback?code=abc")).toBe("abc");
    expect(getAuthorizationCode("near://other/callback?code=abc")).toBeNull();
    expect(getAuthorizationCode("https://auth/callback?code=abc")).toBeNull();
    expect(
      getAuthorizationCode("near://auth/callback?error=denied"),
    ).toBeNull();
  });
});
