export type DeletionDependencies = {
  findPending: (betterId: string) => Promise<string | null>;
  startPending: (
    betterId: string,
    supabaseId: string,
  ) => Promise<string | null>;
  verifyIdentity: (token: string, betterId: string) => Promise<string | null>;
  deleteSupabaseUser: (id: string) => Promise<boolean>;
  deleteBetterUser: (id: string) => Promise<boolean>;
};

/** A persisted deletion job permits safe retry after either service fails. */
export async function deleteNearAccount(
  betterId: string,
  accessToken: string,
  deps: DeletionDependencies,
): Promise<"deleted" | "unauthorized" | "retry"> {
  try {
    let supabaseId = await deps.findPending(betterId);
    if (!supabaseId) {
      if (!accessToken) return "unauthorized";
      const verifiedId = await deps.verifyIdentity(accessToken, betterId);
      if (!verifiedId) return "unauthorized";
      supabaseId = await deps.startPending(betterId, verifiedId);
      if (supabaseId !== verifiedId) return "unauthorized";
    }
    if (!(await deps.deleteSupabaseUser(supabaseId))) return "retry";
    if (!(await deps.deleteBetterUser(betterId))) return "retry";
    return "deleted";
  } catch {
    return "retry";
  }
}
