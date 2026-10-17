import type { Source } from "./contracts";

export function safeURL(url: string): string | null {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}
export function mergeSources(sources: Source[]): Source[] {
  const urls = new Map<string, Source>();
  for (const source of sources) {
    const url = safeURL(source.url);
    if (url && !urls.has(url)) urls.set(url, { ...source, url });
  }
  return [...urls.values()].map((source, index) => ({ ...source, id: `S${index + 1}` }));
}
// Synthesis uses stable source tokens instead of inventing Markdown URLs.
export function linkCitations(text: string, sources: Source[]): string {
  const byId = new Map(sources.map((source) => [source.id, source]));
  return text.replace(/\[(S\d+)\]/g, (_match, id: string) => {
    const source = byId.get(id);
    if (!source || !safeURL(source.url)) throw new Error(`Unknown citation reference: ${id}`);
    return `[${id}](<${source.url}>)`;
  });
}

export interface CitationAnnotation {
  start_index: number;
  end_index: number;
  url: string;
  title: string;
}
export function applyAnnotations(text: string, annotations: CitationAnnotation[]): string {
  let result = text;
  for (const annotation of [...annotations].sort((a, b) => b.start_index - a.start_index)) {
    const url = safeURL(annotation.url);
    if (
      !url ||
      annotation.start_index < 0 ||
      annotation.end_index > text.length ||
      annotation.end_index < annotation.start_index
    )
      continue;
    const label = annotation.title.replaceAll("[", "").replaceAll("]", "").replaceAll("\\", "");
    result =
      result.slice(0, annotation.start_index) +
      `[${label}](<${url}>)` +
      result.slice(annotation.end_index);
  }
  return result;
}
