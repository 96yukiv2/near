export type VerifiedUser = {
  id: string;
  last_sign_in_at?: string | null;
  is_anonymous?: boolean;
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
export function createDeleteAccountHandler(deps: DeleteAccountDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS")
      return new Response("ok", { headers: cors });
    if (request.method !== "POST") return response(405, "method_not_allowed");
    const authorization = request.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!match) return response(401, "unauthorized");
    try {
      const user = await deps.getUser(match[1]!);
      if (!user || user.is_anonymous) return response(401, "unauthorized");
      const signedInAt = Date.parse(user.last_sign_in_at ?? "");
      const elapsed = deps.now() - signedInAt;
      if (!Number.isFinite(signedInAt) || elapsed < 0 || elapsed > 10 * 60_000)
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
