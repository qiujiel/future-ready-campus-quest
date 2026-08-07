import {
  AuthGatewayError,
  throwAuthGatewayError,
} from "../../src/shared/api/authGateway";

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
