import { expect, test, type Locator } from "@playwright/test";

test("completes the synthetic student review journey", async ({
  context,
  page,
}, testInfo) => {
  const keyboardOnly = testInfo.project.name === "desktop-chromium";
  async function activate(locator: Locator) {
    if (keyboardOnly) {
      await locator.focus();
      await page.keyboard.press("Enter");
    } else {
      await locator.click();
    }
  }

  await page.goto("/#/preview/student");
  await expect(
    page.getByRole("heading", { name: "Join your campus quest" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot(`join-${testInfo.project.name}.png`, {
    fullPage: true,
  });

  await page.getByLabel(/assigned group number/i).fill("2");
  await page.getByLabel(/^real name/i).fill("Synthetic Learner");
  await page.getByLabel(/^nickname/i).fill("Bright Comet");
  if (keyboardOnly) {
    await page.getByLabel(/class privacy notice/i).focus();
    await page.keyboard.press("Space");
  } else {
    await page.getByLabel(/class privacy notice/i).check();
  }
  await activate(page.getByRole("button", { name: "Join the campus" }));

  await expect(
    page.getByRole("heading", { name: "Future Makers" }),
  ).toBeVisible();
  await page.getByLabel("Group image").setInputFiles({
    name: "not-an-image.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("synthetic"),
  });
  await expect(page.getByRole("alert")).toContainText("PNG, JPEG, or WebP");
  await activate(page.getByRole("button", { name: "Continue to campus map" }));

  await expect(
    page.getByRole("heading", { name: "Adaptive Learning Labs" }),
  ).toBeVisible();
  await activate(page.getByRole("button", { name: "Reduce animation" }));
  await expect(page.getByText("Animation reduced")).toBeVisible();
  await expect(page).toHaveScreenshot(`map-${testInfo.project.name}.png`, {
    fullPage: true,
    mask: [page.getByText(/\d+:\d+ remaining/)],
  });

  await activate(page.getByRole("button", { name: "Open mission" }));
  await expect(
    page.getByRole("heading", {
      name: /which action makes a future-ready learning plan stronger/i,
    }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot(`mission-${testInfo.project.name}.png`, {
    fullPage: true,
    mask: [page.getByText(/\d+:\d+ remaining/)],
  });

  const response = page.getByRole("radio", {
    name: "Review purpose, people, and possible impact",
  });
  if (keyboardOnly) {
    await response.focus();
    await page.keyboard.press("Space");
  } else {
    await response.check();
  }
  await context.setOffline(true);
  await activate(page.getByRole("button", { name: "Confirm response" }));
  await expect(
    page.getByRole("status").filter({ hasText: "Connection lost" }),
  ).toContainText("Connection lost");
  await context.setOffline(false);
  await activate(page.getByRole("button", { name: "Try saving again" }));
  await expect(page.getByText("Correct")).toBeVisible();
  await expect(page).toHaveScreenshot(`feedback-${testInfo.project.name}.png`, {
    fullPage: true,
    mask: [page.getByText(/\d+:\d+ remaining/)],
  });

  await activate(page.getByRole("button", { name: "View results" }));
  await expect(
    page.getByRole("heading", { name: "Campus team board" }),
  ).toBeVisible();
  await expect(page.getByText("60% mastery")).toBeVisible();
  if (!keyboardOnly) {
    const expectHorizontallyVisible = async (locator: Locator) => {
      await expect
        .poll(() =>
          locator.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= window.innerWidth + 1;
          }),
        )
        .toBe(true);
    };
    const conceptEight = page.getByRole("row", { name: /C8/ });
    await expectHorizontallyVisible(conceptEight.getByText("Developing").last());
    await expectHorizontallyVisible(
      conceptEight.getByText("Ready for a supported retry"),
    );
    const futureMakers = page.getByRole("row", { name: /Future Makers/ });
    await expectHorizontallyVisible(futureMakers.getByText("88"));
    await expectHorizontallyVisible(futureMakers.getByText("Complete"));
  }
  await expect(page).toHaveScreenshot(`leaderboard-${testInfo.project.name}.png`, {
    fullPage: true,
  });

  if (keyboardOnly) {
    await page.setViewportSize({ width: 640, height: 400 });
  }
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
});
