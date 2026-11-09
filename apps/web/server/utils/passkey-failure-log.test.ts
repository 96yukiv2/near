import { describe, expect, it } from "vitest";
import { passkeyFailure } from "./passkey-failure-log";

describe("passkey failure logging", () => {
  it("records only allowlisted stages and codes", () => {
    expect(
      passkeyFailure(
        "/api/auth/passkey/generate-register-options",
        403,
        "SESSION_NOT_FRESH",
      ),
    ).toEqual({
      operation: "registration_options",
      status: 403,
      code: "SESSION_NOT_FRESH",
    });
    expect(
      passkeyFailure(
        "/api/auth/passkey/verify-authentication",
        400,
        "sensitive-data",
      ),
    ).toEqual({ operation: "login_verify", status: 400, code: "OTHER" });
    expect(
      passkeyFailure(
        "/api/auth/passkey/verify-authentication",
        200,
        "UNAUTHORIZED",
      ),
    ).toBeNull();
    expect(passkeyFailure("/api/auth/other", 403, "FORBIDDEN")).toBeNull();
  });
});
