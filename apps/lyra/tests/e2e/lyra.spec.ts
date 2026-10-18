import { test, expect } from "@playwright/test";
import type { Snapshot } from "../../server/contracts";

test("clarifies research intent with options and custom answers before plan approval", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Message Lyra" }).fill("Help me explore business ideas");
  await page.getByRole("button", { name: "Send message" }).click();
  let dialog = page.getByRole("dialog", { name: "Shape your research", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Approve & research" })).toHaveCount(0);
  const conversationId = new URL(page.url()).searchParams.get("c")!;
  await page.reload();
  dialog = page.getByRole("dialog", { name: "Shape your research", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Answer scope questions" }).click();
  await dialog.getByRole("radio", { name: /Productivity/ }).check();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("radio", { name: "Write my own answer", exact: true }).check();
  await dialog.getByRole("textbox", { name: "Your answer" }).fill("Launch a pilot by June 2027");
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(dialog.getByRole("radio", { name: /Productivity/ })).toBeChecked();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Your answer" })).toHaveValue(
    "Launch a pilot by June 2027",
  );
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("radio", { name: /Small teams/ }).check();
  const submitted = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().includes("/clarifications/") &&
      request.url().endsWith("/answer"),
  );
  await dialog.getByRole("button", { name: "Create research plan" }).click();
  const answerRequest = await submitted;
  const payload = answerRequest.postDataJSON();
  await expect(page.getByRole("button", { name: "Approve & research" })).toBeVisible();
  const snapshot = (await (
    await page.request.get(`/api/conversations/${conversationId}`)
  ).json()) as Snapshot;
  expect(snapshot.clarifications.at(-1)?.status).toBe("answered");
  expect(snapshot.runs).toHaveLength(2);
  expect(snapshot.runs.every((run) => run.mode === "plan")).toBe(true);
  expect(snapshot.messages.at(-2)?.content).toContain("Launch a pilot by June 2027");
  expect(snapshot.messages.at(-2)?.content).toContain("Productivity");
  expect(snapshot.messages.at(-2)?.content).toContain("Small teams");
  expect(snapshot.runs[1]?.settings).toEqual(snapshot.runs[0]?.settings);
  const headers = { origin: new URL(page.url()).origin };
  expect((await page.request.post(answerRequest.url(), { data: payload, headers })).status()).toBe(
    200,
  );
  expect(
    (
      await page.request.post(answerRequest.url(), {
        data: { ...payload, id: crypto.randomUUID() },
        headers,
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post(answerRequest.url(), {
        data: { ...payload, id: crypto.randomUUID(), answers: [] },
        headers,
      })
    ).status(),
  ).toBe(400);
});

test("confirms deletion, removes history, and protects the delete endpoint", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Chat options", exact: true }).click();
  await page.getByRole("button", { name: "Chat Ask a question or talk something through" }).click();
  const title = `Disposable chat ${crypto.randomUUID()}`;
  await page.getByRole("textbox", { name: "Message Lyra" }).fill(title);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("This local session uses sample responses.", { exact: false }),
  ).toBeVisible();
  const id = new URL(page.url()).searchParams.get("c")!;
  expect(
    (
      await page.request.delete(`/api/conversations/${id}`, {
        headers: { origin: "https://another.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.delete(`/api/conversations/${crypto.randomUUID()}`, {
        headers: { origin: new URL(page.url()).origin },
      })
    ).status(),
  ).toBe(404);

  if (isMobile) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: `Delete ${title}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete chat?", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await page.request.get(`/api/conversations/${id}`)).status()).toBe(200);

  if (isMobile) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: `Delete ${title}`, exact: true }).click();
  await dialog.getByRole("button", { name: "Delete chat", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What would you like to know?" })).toBeVisible();
  expect((await page.request.get(`/api/conversations/${id}`)).status()).toBe(404);
  await page.reload();
  if (isMobile) await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("button", { name: `Delete ${title}`, exact: true })).toHaveCount(0);
});

test("research requires approval, preserves settings, and restores after refresh", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What would you like to know?" })).toBeVisible();
  await expect(page.getByText("Local demo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Model settings" }).click();
  await page.getByLabel("Model", { exact: true }).selectOption("gpt-6-astra");
  await page.getByLabel("Thinking effort", { exact: true }).selectOption("high");
  await page.getByRole("button", { name: "Close panel" }).click();
  await page
    .getByRole("textbox", { name: "Message Lyra" })
    .fill("Compare edge hosting for personal tools");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("region", { name: "Research plan" })).toBeVisible();
  const url = new URL(page.url());
  const id = url.searchParams.get("c");
  expect(id).toBeTruthy();
  const before = await page.evaluate(
    async (conversationId): Promise<Snapshot> =>
      (await fetch(`/api/conversations/${conversationId}`)).json() as Promise<Snapshot>,
    id,
  );
  expect(before.runs).toHaveLength(1);
  expect(before.runs[0]?.settings).toEqual({ model: "gpt-6-astra", effort: "high" });
  expect(before.runs[0]?.mode).toBe("plan");
  await page.reload();
  await page.getByRole("button", { name: "Approve & research" }).click();
  await expect(page.getByRole("link", { name: "Download report" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Research findings" })).toBeVisible();
  const after = await page.evaluate(
    async (conversationId): Promise<Snapshot> =>
      (await fetch(`/api/conversations/${conversationId}`)).json() as Promise<Snapshot>,
    id,
  );
  expect(after.runs.filter((run) => run.mode === "research")).toHaveLength(1);
  expect(after.runs[1]?.settings).toEqual({ model: "gpt-6-astra", effort: "high" });
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
  await page.getByRole("button", { name: "Chat options", exact: true }).click();
  await page.getByRole("button", { name: "Chat Ask a question or talk something through" }).click();
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
    async (conversationId): Promise<Snapshot> =>
      (await fetch(`/api/conversations/${conversationId}`)).json() as Promise<Snapshot>,
    id,
  );
  expect(result.runs.at(-1)?.status).toBe("cancelled");
  expect(result.messages.at(-1)?.sources.length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Partial research" })).toBeVisible();
});
