import {
  AuthGatewayError,
  supabaseAuthGateway,
  throwAuthGatewayError,
} from "../../src/shared/api/authGateway";
import { readAuthenticatedRole } from "../../src/shared/api/role";
import { getSupabaseClient } from "../../src/shared/api/supabase";

vi.mock("../../src/shared/api/supabase", () => ({
  getSupabaseClient: vi.fn(),
}));

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

it("invokes the returning-login boundary and saves only the returned session", async () => {
  const invoke = vi.fn(async () => ({
    data: {
      identity: {
        studentId: "student-1",
        cohortId: "cohort-1",
        groupId: "group-1",
        groupNumber: 2,
        nickname: "Explorer 2",
        isGroupIdentityEditor: false,
      },
      accessToken: "replacement-access",
      refreshToken: "replacement-refresh",
    },
    error: null,
  }));
  const setSession = vi.fn(async () => ({ error: null }));
  vi.mocked(getSupabaseClient).mockReturnValue({
    functions: { invoke },
    auth: { setSession },
  } as never);

  const input = {
    classAccessId: "40000000-0000-4000-8000-000000000099",
    displayName: "Alex Tan",
    passcode: "4826",
    requestKey: "50000000-0000-4000-8000-000000000001",
  };
  await expect(supabaseAuthGateway.loginStudent(input)).resolves.toMatchObject({
    identity: { studentId: "student-1" },
  });
  expect(invoke).toHaveBeenCalledWith("student-login", { body: input });
  expect(setSession).toHaveBeenCalledWith({
    access_token: "replacement-access",
    refresh_token: "replacement-refresh",
  });
});

it.each(["STUDENT_LOGIN_NOT_ACCEPTED", "LOGIN_NOT_AVAILABLE"])(
  "preserves the neutral %s code from the returning-login boundary",
  async (code) => {
    const setSession = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({
      functions: {
        invoke: vi.fn(async () => ({
          data: null,
          error: {
            context: new Response(JSON.stringify({ error: code }), {
              status: 400,
              headers: { "content-type": "application/json" },
            }),
          },
        })),
      },
      auth: { setSession },
    } as never);

    await expect(supabaseAuthGateway.loginStudent({
      classAccessId: "40000000-0000-4000-8000-000000000099",
      displayName: "Alex Tan",
      passcode: "4826",
      requestKey: "50000000-0000-4000-8000-000000000001",
    })).rejects.toEqual(new AuthGatewayError(code));
    expect(setSession).not.toHaveBeenCalled();
  },
);
