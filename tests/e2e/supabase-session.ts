import type { Page } from "@playwright/test";

export async function installSupabaseSession(
  page: Page,
  role: "teacher" | "student",
) {
  const user = {
    id: `${role}-1`,
    app_metadata: { role },
    user_metadata: {},
    aud: "authenticated",
    created_at: "2030-01-01T00:00:00.000Z",
  };
  await page.addInitScript((sessionUser) => {
    localStorage.setItem(
      "sb-e2e-auth-token",
      JSON.stringify({
        access_token: "e2e-access-token",
        refresh_token: "e2e-refresh-token",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user: sessionUser,
      }),
    );
  }, user);
}
