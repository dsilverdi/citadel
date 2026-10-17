import OpenAI from "openai";
export * from "./models";

export interface AIEnvironment {
  OPENAI_API_KEY?: string;
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  AI_GATEWAY_TOKEN?: string;
  APP_ENV: string;
}
export function createOpenAI(env: AIEnvironment): OpenAI {
  if (!env.OPENAI_API_KEY)
    throw new Error("OpenAI is not configured. Add OPENAI_API_KEY to Worker secrets.");
  const gateway = env.AI_GATEWAY_ACCOUNT_ID && env.AI_GATEWAY_ID;
  if (env.APP_ENV !== "local" && !gateway) throw new Error("AI Gateway is not configured.");
  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    ...(gateway
      ? {
          baseURL: `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/openai`,
        }
      : {}),
    defaultHeaders: {
      "cf-aig-skip-cache": "true",
      "cf-aig-collect-log": "false",
      ...(env.AI_GATEWAY_TOKEN ? { "cf-aig-authorization": `Bearer ${env.AI_GATEWAY_TOKEN}` } : {}),
    },
    // Never silently retry a paid creation request after an ambiguous network failure.
    maxRetries: 0,
    timeout: 60_000,
  });
}
