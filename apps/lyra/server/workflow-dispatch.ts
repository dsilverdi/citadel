/** Workflow creation is safe to retry only with the same saved instance ID. */
export async function dispatchWorkflow(
  workflow: Pick<Workflow<{ runId: string }>, "create" | "get">,
  runId: string,
  report: (details: {
    attempt: number;
    stage: string;
    errorName: string;
    status?: number;
  }) => void = () => {},
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await bounded(workflow.create({ id: runId, params: { runId } }));
      return;
    } catch (error) {
      report({ attempt: attempt + 1, stage: "create", ...safeFailure(error) });
      try {
        // Creation may have succeeded even if its acknowledgement was lost.
        const instance = await bounded(workflow.get(runId));
        await bounded(instance.status());
        return;
      } catch (error) {
        report({ attempt: attempt + 1, stage: "lookup", ...safeFailure(error) });
        if (attempt === 1) throw new Error("WorkflowDispatchUnavailable");
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }
}

export async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error("Workflow dispatch timed out");
          error.name = "WorkflowDispatchTimeout";
          reject(error);
        }, 4000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function safeFailure(error: unknown): { errorName: string; status?: number } {
  const name = error instanceof Error ? error.name : "UnknownError";
  const status =
    typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  return {
    errorName: /^[a-zA-Z0-9_]{1,80}$/.test(name) ? name : "UnknownError",
    ...(typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599
      ? { status }
      : {}),
  };
}
