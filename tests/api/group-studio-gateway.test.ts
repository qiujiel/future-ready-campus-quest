const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({
    data: { imageUrl: "https://signed.invalid/group.webp" },
    error: null,
  })),
}));

vi.mock("../../src/shared/api/supabase", () => ({
  getSupabaseClient: () => ({
    functions: { invoke },
  }),
}));

import { supabaseGroupStudioGateway } from "../../src/features/group/groupStudioGateway";

it("includes an auditable UUID when requesting a signed group image URL", async () => {
  await expect(
    supabaseGroupStudioGateway.getImageUrl(
      "60000000-0000-4000-8000-000000000001",
    ),
  ).resolves.toBe("https://signed.invalid/group.webp");

  expect(invoke).toHaveBeenCalledWith("manage-group-identity", {
    body: {
      action: "get-image-url",
      groupId: "60000000-0000-4000-8000-000000000001",
      requestKey: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    },
  });
});
