/** Accept only Near's configured HTTPS invitation URL and a single valid token. */
export function parseInvitation(
  input: string,
  webUrl: string | undefined,
): string | null {
  if (!webUrl) return null;
  try {
    const origin = new URL(webUrl);
    const url = new URL(input.trim());
    if (
      origin.protocol !== "https:" ||
      url.origin !== origin.origin ||
      url.pathname !== "/friends" ||
      url.username ||
      url.password
    )
      return null;
    const params = new URLSearchParams(url.hash.slice(1));
    const tokens = params.getAll("invite");
    if (tokens.length !== 1 || !/^[0-9a-f]{64}$/.test(tokens[0] ?? ""))
      return null;
    return tokens[0] ?? null;
  } catch {
    return null;
  }
}
