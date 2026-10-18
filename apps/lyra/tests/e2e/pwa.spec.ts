import { test, expect } from "@playwright/test";

test("offers native installation with a home-screen guide as fallback", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "crossorigin",
    "use-credentials",
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    "content",
    "yes",
  );
  const manifest = await (await page.request.get("/site.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.id).toBe("/");

  await page.evaluate(() => {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {
        document.documentElement.dataset.installPromptOpened = "true";
      },
      userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" }),
    });
    window.dispatchEvent(event);
  });
  if (isMobile) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Install Lyra", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-install-prompt-opened", "true");
  await expect(page.getByRole("button", { name: "Install Lyra", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Install Lyra", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Install Lyra" })).toBeVisible();
});

test("hides installation controls in an installed window", async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const result = original(query);
      if (query === "(display-mode: standalone)")
        Object.defineProperty(result, "matches", { value: true });
      return result;
    };
  });
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("button", { name: "Install Lyra", exact: true })).toHaveCount(0);
});
