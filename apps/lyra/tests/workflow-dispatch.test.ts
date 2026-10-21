import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchWorkflow } from "../server/workflow-dispatch";

function binding() {
  const status = vi.fn().mockResolvedValue({ status: "queued" });
  const create = vi.fn().mockResolvedValue({ id: "saved-run" });
  const get = vi.fn().mockResolvedValue({ status });
  return {
    create,
    get,
    status,
    workflow: { create, get } as unknown as Workflow<{ runId: string }>,
  };
}
afterEach(() => vi.useRealTimers());

describe("confirmed Workflow dispatch", () => {
  it("creates the saved instance once without querying it again", async () => {
    const b = binding();
    await dispatchWorkflow(b.workflow, "saved-run");
    expect(b.create).toHaveBeenCalledExactlyOnceWith({
      id: "saved-run",
      params: { runId: "saved-run" },
    });
    expect(b.get).not.toHaveBeenCalled();
  });
  it("confirms an existing instance after a lost creation acknowledgement", async () => {
    const b = binding();
    b.create.mockRejectedValue(new Error("lost acknowledgement"));
    await dispatchWorkflow(b.workflow, "saved-run");
    expect(b.create).toHaveBeenCalledTimes(1);
    expect(b.get).toHaveBeenCalledWith("saved-run");
    expect(b.status).toHaveBeenCalledTimes(1);
  });
  it("retries a transient creation failure with exactly the same saved ID", async () => {
    vi.useFakeTimers();
    const b = binding();
    b.create.mockRejectedValueOnce(new Error("unavailable"));
    b.get.mockRejectedValueOnce(new Error("not found"));
    const result = dispatchWorkflow(b.workflow, "saved-run");
    await vi.runAllTimersAsync();
    await result;
    expect(b.create).toHaveBeenCalledTimes(2);
    expect(b.create.mock.calls[0]).toEqual(b.create.mock.calls[1]);
  });
  it("bounds hung dispatch and lookup calls without treating them as confirmed", async () => {
    vi.useFakeTimers();
    const b = binding();
    b.create.mockImplementation(() => new Promise(() => {}));
    b.get.mockImplementation(() => new Promise(() => {}));
    const result = expect(dispatchWorkflow(b.workflow, "saved-run")).rejects.toThrow(
      "WorkflowDispatchUnavailable",
    );
    await vi.runAllTimersAsync();
    await result;
    expect(b.create).toHaveBeenCalledTimes(2);
    expect(b.get).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("reports safe failure metadata without raw request or exception text", async () => {
    const b = binding();
    const error = Object.assign(new Error("private prompt secret-token"), { status: 503 });
    b.create.mockRejectedValue(error);
    const report = vi.fn();
    await dispatchWorkflow(b.workflow, "saved-run", report);
    expect(report).toHaveBeenCalledWith({
      attempt: 1,
      stage: "create",
      errorName: "Error",
      status: 503,
    });
    expect(JSON.stringify(report.mock.calls)).not.toMatch(/private|secret-token/);
  });
  it("does not accept an instance whose status cannot be confirmed", async () => {
    vi.useFakeTimers();
    const b = binding();
    b.create.mockRejectedValue(new Error("unavailable"));
    b.status.mockRejectedValue(new Error("lookup unavailable"));
    const result = expect(dispatchWorkflow(b.workflow, "saved-run")).rejects.toThrow(
      "WorkflowDispatchUnavailable",
    );
    await vi.runAllTimersAsync();
    await result;
    expect(b.status).toHaveBeenCalledTimes(2);
  });
});
