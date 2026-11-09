import { getNearAuth } from "../../utils/get-near-auth";
import { passkeyFailure } from "../../utils/passkey-failure-log";

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event);
  const pathname = new URL(request.url).pathname;
  try {
    const response = await getNearAuth(event).auth.handler(request);
    if (response.status >= 400 && pathname.startsWith("/api/auth/passkey/")) {
      let code: unknown;
      try {
        const body: unknown = await response.clone().json();
        if (body && typeof body === "object" && "code" in body)
          code = body.code;
      } catch {
        // Error responses are not guaranteed to be JSON.
      }
      const failure = passkeyFailure(pathname, response.status, code);
      if (failure) console.warn("[near-auth] passkey request failed", failure);
    }
    return response;
  } catch (error) {
    const failure = passkeyFailure(pathname, 500, undefined);
    if (failure) console.warn("[near-auth] passkey request failed", failure);
    throw error;
  }
});
