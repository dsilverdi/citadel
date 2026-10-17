import type { Usage } from "@citadel/ai/models";
import type { Source } from "./contracts";
import { applyAnnotations, mergeSources } from "./citations";

export interface Completion {
  text: string;
  sources: Source[];
  usage: Usage;
  incomplete: boolean;
}
export interface ProviderResponse {
  id: string;
  status: string;
  output?: Array<{
    type: string;
    action?: { sources?: Array<{ url: string; title?: string }> };
    content?: Array<{
      type: string;
      text?: string;
      annotations?: Array<{
        type: string;
        url: string;
        title: string;
        start_index: number;
        end_index: number;
      }>;
    }>;
  }>;
  usage?: { input_tokens: number; output_tokens: number };
}
export function parseProviderResponse(response: ProviderResponse): Completion {
  const sources: Source[] = [];
  const parts: string[] = [];
  let toolCalls = 0;
  for (const item of response.output || []) {
    if (item.type === "web_search_call") {
      toolCalls++;
      for (const source of item.action?.sources || [])
        sources.push({ id: "", url: source.url, title: source.title || source.url });
    }
    for (const part of item.content || []) {
      if (part.type !== "output_text" || !part.text) continue;
      const annotations = (part.annotations || []).filter(
        (annotation) => annotation.type === "url_citation",
      );
      for (const annotation of annotations)
        sources.push({ id: "", url: annotation.url, title: annotation.title });
      parts.push(applyAnnotations(part.text, annotations));
    }
  }
  return {
    text: parts.join("\n\n"),
    sources: mergeSources(sources),
    usage: {
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      toolCalls,
    },
    incomplete: response.status === "incomplete",
  };
}
