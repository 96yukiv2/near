/** Accept only the expected redirect; PKCE protects the authorization code. */
export function getAuthorizationCode(url: string): string | null {
  try {
    const callback = new URL(url);
    if (
      callback.protocol !== "near:" ||
      callback.host !== "auth" ||
      callback.pathname !== "/callback"
    )
      return null;
    return callback.searchParams.get("code") || null;
  } catch {
    return null;
  }
}
