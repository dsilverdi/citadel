import { test, expect } from "@playwright/test";

test("research requires approval, preserves settings, and restores after refresh", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little curiosity. A clearer picture." }),
  ).toBeVisible();
  await expect(page.getByText("Local demo", { exact: true })).toBeVisible();
  await page.getByLabel("Model", { exact: true }).selectOption("gpt-6-astra");
  await page.getByLabel("Thinking effort", { exact: true }).selectOption("high");
  await page
    .getByRole("textbox", { name: "Message Lyra" })
    .fill("Compare edge hosting for personal tools");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("region", { name: "Research plan" })).toBeVisible();
  const url = new URL(page.url());
  const id = url.searchParams.get("c");
  expect(id).toBeTruthy();
  const before = await page.evaluate(
    async (conversationId) => (await fetch(`/api/conversations/${conversationId}`)).json(),
    id,
  );
  expect(before.runs).toHaveLength(1);
  expect(before.runs[0].settings).toEqual({ model: "gpt-6-astra", effort: "high" });
  expect(before.runs[0].mode).toBe("plan");
  await page.reload();
  await page.getByRole("button", { name: "Approve & research" }).click();
  await expect(page.getByRole("link", { name: "Download report" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Research findings" })).toBeVisible();
  const after = await page.evaluate(
    async (conversationId) => (await fetch(`/api/conversations/${conversationId}`)).json(),
    id,
  );
  expect(after.runs.filter((run: { mode: string }) => run.mode === "research")).toHaveLength(1);
  expect(after.runs[1].settings).toEqual({ model: "gpt-6-astra", effort: "high" });
  await page.getByRole("button", { name: "View sources" }).click();
  await expect(page.getByRole("link", { name: /Cloudflare Workers documentation/ })).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("supports chat, revision, duplicate submission, and stale approval rejection", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Conversation mode").selectOption("chat");
  await page.getByRole("textbox", { name: "Message Lyra" }).fill("Hello Lyra");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("This local session uses sample responses.", { exact: false }),
  ).toBeVisible();
  const conversationId = new URL(page.url()).searchParams.get("c");
  const submissionId = crypto.randomUUID();
  const first = await page.evaluate(
    async ({ conversationId, submissionId }) => {
      const body = {
        id: submissionId,
        content: "Research Cloudflare Workers",
        mode: "research",
        settings: { model: "gpt-6.1-sol", effort: "medium" },
      };
      const submit = () =>
        fetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      const initial = await submit();
      const repeated = await submit();
      return [initial.status, repeated.status];
    },
    { conversationId, submissionId },
  );
  expect(first).toEqual([202, 200]);
  await expect(page.getByRole("button", { name: "Revise plan" })).toBeVisible();
  await page.getByRole("button", { name: "Revise plan" }).click();
  await page
    .getByRole("textbox", { name: "Message Lyra" })
    .fill("Please revise the research plan: focus on cost");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Approve & research" })).toBeEnabled();
  const staleStatus = await page.evaluate(
    async ({ conversationId, submissionId }) =>
      (
        await fetch(`/api/conversations/${conversationId}/plans/${submissionId}/approve`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: crypto.randomUUID() }),
        })
      ).status,
    { conversationId, submissionId },
  );
  expect(staleStatus).toBe(409);
});

test("stops research and retains completed evidence", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Message Lyra" })
    .fill("Research Cloudflare deployment options");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByRole("button", { name: "Approve & research" }).click();
  await expect(page.getByText(/Researching 2\/2:/)).toBeVisible();
  await page.getByRole("button", { name: "Stop generation" }).click();
  await expect(page.getByRole("heading", { name: "Partial research" })).toBeVisible();
  const id = new URL(page.url()).searchParams.get("c");
  const result = await page.evaluate(
    async (conversationId) => (await fetch(`/api/conversations/${conversationId}`)).json(),
    id,
  );
  expect(result.runs.at(-1).status).toBe("cancelled");
  expect(result.messages.at(-1).sources.length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Partial research" })).toBeVisible();
});
