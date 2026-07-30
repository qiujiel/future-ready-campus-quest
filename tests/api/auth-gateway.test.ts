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

it("uses a neutral fallback when the boundary body is unavailable", async () => {
  await expect(
    throwAuthGatewayError({}, "JOIN_NOT_ACCEPTED"),
  ).rejects.toEqual(new AuthGatewayError("JOIN_NOT_ACCEPTED"));
});
