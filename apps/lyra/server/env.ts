import type { AIEnvironment } from "@citadel/ai";
import type { AuthEnvironment } from "@citadel/auth";
import type { ConversationAgent } from "../workers/conversation-agent";

export interface Env extends AIEnvironment, AuthEnvironment {
  ASSETS: Fetcher;
  DB: D1Database;
  REPORTS: R2Bucket;
  ConversationAgent: DurableObjectNamespace<ConversationAgent>;
  RESEARCH: Workflow<{ runId: string }>;
  MOCK_AI?: string;
  MODEL_PRICING_JSON?: string;
}
declare module "react-router" {
  interface AppLoadContext {
    cloudflare: { env: Env; ctx: ExecutionContext };
  }
}
