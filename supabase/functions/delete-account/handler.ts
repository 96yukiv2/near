export type VerifiedUser = {
  id: string;
  is_anonymous?: boolean;
  identities?: { provider: string }[];
};
export type DeleteAccountDependencies = {
  getUser: (token: string) => Promise<VerifiedUser | null>;
  deleteUser: (id: string) => Promise<boolean>;
  now: () => number;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function response(status: number, message: string) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
function recentlyAuthenticated(
  token: string,
  userId: string,
  now: number,
): boolean {
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (
      decoded.sub !== userId ||
      typeof decoded.session_id !== "string" ||
      !Array.isArray(decoded.amr)
    )
      return false;
    return decoded.amr.some((entry: unknown) => {
      if (
        !entry ||
        typeof entry !== "object" ||
        !("method" in entry) ||
        !("timestamp" in entry)
      )
        return false;
      if (
        typeof entry.method !== "string" ||
        ["anonymous", "token_refresh"].includes(entry.method) ||
        typeof entry.timestamp !== "number"
      )
        return false;
      const age = now - entry.timestamp * 1000;
      return age >= 0 && age <= 10 * 60_000;
    });
  } catch {
    return false;
  }
}
export function createDeleteAccountHandler(deps: DeleteAccountDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS")
      return new Response("ok", { headers: cors });
    if (request.method !== "POST") return response(405, "method_not_allowed");
    const authorization = request.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!match) return response(401, "unauthorized");
    try {
      // Verify with Supabase Auth before trusting any JWT claims.
      const user = await deps.getUser(match[1]!);
      if (!user || user.is_anonymous) return response(401, "unauthorized");
      // Passkey accounts must use the coordinated deletion endpoint so that
      // both Supabase and Better Auth data are removed, even after retries.
      if (
        !user.identities?.length ||
        user.identities.some((identity) => identity.provider === "custom:near")
      )
        return response(403, "use_coordinated_deletion");
      if (!recentlyAuthenticated(match[1]!, user.id, deps.now()))
        return response(403, "recent_login_required");
      // The target is derived only from the verified JWT, never from request data.
      if (!(await deps.deleteUser(user.id)))
        return response(500, "delete_failed");
      return response(200, "deleted");
    } catch {
      return response(500, "delete_failed");
    }
  };
}
