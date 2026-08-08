import {
  AuthGatewayError,
  throwAuthGatewayError,
} from "../../src/shared/api/authGateway";
import { readAuthenticatedRole } from "../../src/shared/api/role";

it("reads the authoritative role from the protected database function", async () => {
  const calls: unknown[] = [];
  const client = {
    async rpc(name: string) {
      calls.push(name);
      return { data: "student", error: null };
    },
  };

  await expect(readAuthenticatedRole(client)).resolves.toBe("student");
  expect(calls).toEqual(["current_role"]);
});

it("rejects absent and unrecognized authoritative roles", async () => {
  await expect(readAuthenticatedRole({
    async rpc() {
      return { data: "administrator", error: null };
    },
  })).resolves.toBeNull();
  await expect(readAuthenticatedRole({
    async rpc() {
      return { data: null, error: { message: "not authenticated" } };
    },
  })).resolves.toBeNull();
});

it("preserves a neutral join boundary code from an Edge Function response", async () => {
  const context = {
    response: new Response(JSON.stringify({ error: "INVALID_GROUP" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }),
  };

  await expect(
    throwAuthGatewayError(context, "JOIN_NOT_ACCEPTED"),
  ).rejects.toEqual(new AuthGatewayError("INVALID_GROUP"));
});

it("reads the direct Response context returned by the Supabase functions client", async () => {
  const context = new Response(JSON.stringify({ error: "INVALID_JOIN_CODE" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });

  await expect(
    throwAuthGatewayError(context, "JOIN_NOT_ACCEPTED"),
  ).rejects.toEqual(new AuthGatewayError("INVALID_JOIN_CODE"));
});

it("uses a neutral fallback when the boundary body is unavailable", async () => {
  await expect(
    throwAuthGatewayError({}, "JOIN_NOT_ACCEPTED"),
  ).rejects.toEqual(new AuthGatewayError("JOIN_NOT_ACCEPTED"));
});
