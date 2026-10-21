import { bounded } from "./workflow-dispatch";
import { idSchema } from "./contracts";

export interface DispatchMessage {
  runId: string;
}

export async function enqueueDispatch(queue: Pick<Queue<DispatchMessage>, "send">, runId: string) {
  await bounded(queue.send({ runId }));
}

/** Acknowledge only confirmed startup (or a run which no longer needs starting). */
export async function consumeDispatchBatch(
  batch: MessageBatch<unknown>,
  dispatch: (runId: string) => Promise<void>,
) {
  for (const message of batch.messages) {
    const body = message.body;
    const id = idSchema.safeParse(
      typeof body === "object" && body !== null && "runId" in body ? body.runId : undefined,
    );
    if (!id.success) {
      console.error("Lyra invalid dispatch queue message");
      message.ack();
      continue;
    }
    try {
      await dispatch(id.data);
      message.ack();
    } catch {
      message.retry({ delaySeconds: Math.min(60, 5 * 2 ** Math.min(message.attempts, 4)) });
    }
  }
}
