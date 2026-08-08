export type AuthenticatedRole = "teacher" | "student";

export interface RoleRpcClient {
  rpc(name: "current_role"): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
}

export async function readAuthenticatedRole(
  client: RoleRpcClient,
): Promise<AuthenticatedRole | null> {
  const result = await client.rpc("current_role");
  if (result.error) return null;
  return result.data === "teacher" || result.data === "student"
    ? result.data
    : null;
}
