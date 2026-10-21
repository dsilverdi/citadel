import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeDispatchBatch, enqueueDispatch } from "../server/dispatch-queue";
const runId = "6c2d9abe-665f-4516-b8af-bd5041fdd6b4";
function message(body: unknown, attempts = 1) {
  return { body, attempts, ack: vi.fn(), retry: vi.fn() };
}
function batch(messages: ReturnType<typeof message>[]) {
  return { messages } as unknown as MessageBatch<unknown>;
}
afterEach(() => vi.useRealTimers());
describe("durable dispatch queue", () => {
  it("waits for durable acceptance and sends only the saved run ID", async () => {
    let accept!: () => void;
    const send = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    );
    let done = false;
    const promise = enqueueDispatch({ send } as unknown as Queue<{ runId: string }>, runId).then(
      () => {
        done = true;
      },
    );
    await Promise.resolve();
    expect(done).toBe(false);
    expect(send).toHaveBeenCalledExactlyOnceWith({ runId });
    accept();
    await promise;
    expect(done).toBe(true);
  });
  it("bounds unconfirmed queue acceptance without claiming delivery", async () => {
    vi.useFakeTimers();
    const send = vi.fn(() => new Promise(() => {}));
    const result = expect(
      enqueueDispatch({ send } as unknown as Queue<{ runId: string }>, runId),
    ).rejects.toMatchObject({ name: "WorkflowDispatchTimeout" });
    await vi.runAllTimersAsync();
    await result;
    expect(send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("acknowledges only after dispatch is confirmed", async () => {
    const m = message({ runId });
    let confirm!: () => void;
    const dispatch = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          confirm = resolve;
        }),
    );
    const promise = consumeDispatchBatch(batch([m]), dispatch);
    expect(m.ack).not.toHaveBeenCalled();
    confirm();
    await promise;
    expect(m.ack).toHaveBeenCalledTimes(1);
    expect(m.retry).not.toHaveBeenCalled();
  });
  it("retries unconfirmed startup without losing successful batch messages", async () => {
    const failed = message({ runId });
    const good = message({ runId: crypto.randomUUID() });
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue(undefined);
    await consumeDispatchBatch(batch([failed, good]), dispatch);
    expect(failed.ack).not.toHaveBeenCalled();
    expect(failed.retry).toHaveBeenCalledWith({ delaySeconds: 10 });
    expect(good.ack).toHaveBeenCalledTimes(1);
  });
  it("acknowledges malformed messages without invoking a Workflow or logging payloads", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = message({ runId: "private prompt secret" });
    const dispatch = vi.fn();
    await consumeDispatchBatch(batch([m]), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
    expect(m.ack).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|secret/);
  });
  it("passes duplicate deliveries to idempotent dispatch with the original ID", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const messages = [message({ runId }), message({ runId })];
    await consumeDispatchBatch(batch(messages), dispatch);
    expect(dispatch.mock.calls).toEqual([[runId], [runId]]);
    expect(messages.every((m) => m.ack.mock.calls.length === 1)).toBe(true);
  });
});
