const operations: Record<string, string> = {
  "/api/auth/passkey/generate-register-options": "registration_options",
  "/api/auth/passkey/verify-registration": "registration_verify",
  "/api/auth/passkey/generate-authenticate-options": "login_options",
  "/api/auth/passkey/verify-authentication": "login_verify",
};
const safeCodes = new Set([
  "SESSION_NOT_FRESH",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "INVALID_ORIGIN",
  "CHALLENGE_NOT_FOUND",
  "FAILED_TO_VERIFY_REGISTRATION",
  "AUTHENTICATION_FAILED",
  "PASSKEY_NOT_FOUND",
]);

/** Never include request URLs, response messages, credentials, or user data. */
export function passkeyFailure(
  pathname: string,
  status: number,
  code: unknown,
) {
  const operation = operations[pathname];
  if (!operation || status < 400) return null;
  return {
    operation,
    status,
    code: typeof code === "string" && safeCodes.has(code) ? code : "OTHER",
  };
}
