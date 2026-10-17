import { z } from "zod";

export const effortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);
export type Effort = z.infer<typeof effortSchema>;
export interface ModelCapability {
  id: string;
  name: string;
  description: string;
  efforts: readonly Effort[];
  webSearch: boolean;
}

// Curated capabilities, not an assumption that /models describes tool support.
// Pricing is intentionally deployment configuration: estimates must be explicit.
export const models: readonly ModelCapability[] = [
  {
    id: "gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    description: "Balanced",
    efforts: ["low", "medium", "high", "xhigh", "max"],
    webSearch: true,
  },
  {
    id: "gpt-6-luna",
    name: "GPT-6 Luna",
    description: "Efficient",
    efforts: ["low", "medium", "high", "xhigh", "max"],
    webSearch: true,
  },
  {
    id: "gpt-6-astra",
    name: "GPT-6 Astra",
    description: "Most capable",
    efforts: ["low", "medium", "high", "xhigh", "max"],
    webSearch: true,
  },
];
export const settingsSchema = z
  .object({ model: z.string(), effort: effortSchema })
  .superRefine((value, ctx) => {
    const model = models.find((entry) => entry.id === value.model);
    if (!model || !model.efforts.includes(value.effort)) {
      ctx.addIssue({ code: "custom", message: "Unsupported model or thinking effort" });
    }
  });
export type ModelSettings = z.infer<typeof settingsSchema>;
export const defaultSettings: ModelSettings = { model: "gpt-6.1-sol", effort: "medium" };

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
}
export interface Price {
  inputPerMillion: number;
  outputPerMillion: number;
  webSearchPerThousand: number;
}
export function estimateCost(usage: Usage, price?: Price): number | null {
  if (!price) return null;
  return (
    (usage.inputTokens * price.inputPerMillion + usage.outputTokens * price.outputPerMillion) /
      1_000_000 +
    (usage.toolCalls * price.webSearchPerThousand) / 1_000
  );
}
