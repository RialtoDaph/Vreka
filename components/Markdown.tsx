"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Element styling matched to this app's HUD theme -- there's no
// @tailwindcss/typography plugin installed, so each tag gets its class
// list spelled out here instead of a blanket `prose` wrapper.
const COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="font-display text-lg font-bold text-fg mt-4 mb-2 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-display text-base font-bold text-fg mt-4 mb-1.5 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-display text-sm font-semibold text-fg-secondary mt-3 mb-1 first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="text-sm text-fg-muted leading-relaxed mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="text-fg font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-cyan-glow/90 hover:text-cyan-glow underline underline-offset-2"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 mb-2 text-sm text-fg-muted">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 mb-2 text-sm text-fg-muted">{children}</ol>,
  li: ({ children }) => <li className="marker:text-slate-500">{children}</li>,
  code: ({ children, className }) => {
    // remark-gfm/react-markdown mark fenced code blocks with a
    // `language-xxx` className on the inner <code>; a bare inline `code`
    // span has none -- that's the only reliable way to tell them apart
    // here since <pre> already wraps the block case.
    if (className) {
      return <code className="font-mono text-[13px] text-cyan-glow/90">{children}</code>;
    }
    return (
      <code className="font-mono text-[0.9em] text-cyan-glow bg-panel2 border border-line rounded-sm px-1 py-0.5">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-panel2 border border-line rounded-sm p-3 overflow-x-auto mb-2">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-cyan-glow/30 pl-3 text-fg-subtle italic mb-2">{children}</blockquote>
  ),
  hr: () => <hr className="border-line my-3" />,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2">
      <table className="text-sm text-fg-muted border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-line px-2 py-1 text-left font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-line px-2 py-1">{children}</td>,
  input: ({ checked, disabled }) => (
    // GFM task-list checkbox (- [ ] / - [x]) -- rendered read-only,
    // disabled so it doesn't look interactive when it can't save state.
    <input
      type="checkbox"
      checked={!!checked}
      disabled={disabled ?? true}
      readOnly
      className="mr-1.5 h-3.5 w-3.5 accent-cyan-glow align-middle"
    />
  ),
};

export default function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
