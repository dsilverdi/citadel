import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Stable component identities keep React from replacing scroll containers when
// chat snapshots refresh, the draft changes, or streaming text updates.
const components: Components = {
  a: ({ children: label, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  ),
  table: ({ children: rows }) => (
    <div className="markdown-table-scroll" role="region" aria-label="Table" tabIndex={0}>
      <table>{rows}</table>
    </div>
  ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
