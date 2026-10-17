import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "../server/env";
import { executeRun } from "../server/research";

export class ResearchWorkflow extends WorkflowEntrypoint<Env, { runId: string }> {
  async run(event: WorkflowEvent<{ runId: string }>, step: WorkflowStep) {
    await executeRun(this.env, event.payload.runId, step);
  }
}
