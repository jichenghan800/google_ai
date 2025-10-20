import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Production-ready Markdown renderer with GFM (tables, task lists, strikethrough)
// We map elements to Tailwind classes for a clean, compact UI suitable for the result panel.
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  return (
    <div className={`max-w-none ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => (
            <h1 {...props} className="text-xl font-bold text-[var(--text-primary)] mt-3 mb-2" />
          ),
          h2: ({ node, ...props }) => (
            <h2 {...props} className="text-lg font-semibold text-[var(--text-primary)] mt-3 mb-2" />
          ),
          h3: ({ node, ...props }) => (
            <h3 {...props} className="text-base font-semibold text-[var(--text-primary)] mt-3 mb-2" />
          ),
          h4: ({ node, ...props }) => (
            <h4 {...props} className="text-sm font-semibold text-[var(--text-primary)] mt-2 mb-1" />
          ),
          p: ({ node, ...props }) => (
            <p {...props} className="leading-6 my-1 whitespace-pre-wrap break-words text-[rgba(var(--text-primary-rgb),0.9)]" />
          ),
          a: ({ node, href, children, ...props }) => (
            <a href={href} target="_blank" rel="noreferrer" {...props} className="text-blue-600 hover:underline break-words" >
              {children}
            </a>
          ),
          ul: ({ node, ...props }) => (
            <ul {...props} className="list-disc pl-5 my-2 space-y-1 text-[rgba(var(--text-primary-rgb),0.9)]" />
          ),
          ol: ({ node, ...props }) => (
            <ol {...props} className="list-decimal pl-5 my-2 space-y-1 text-[rgba(var(--text-primary-rgb),0.9)]" />
          ),
          li: ({ node, ...props }) => <li {...props} className="leading-6" />,
          blockquote: ({ node, ...props }) => (
            <blockquote {...props} className="border-l-4 border-[rgba(var(--text-primary-rgb),0.18)] pl-3 py-1 my-2 text-[var(--text-secondary)] bg-[var(--surface-1)] rounded-r" />
          ),
          hr: ({ node, ...props }) => (
            <hr {...props} className="my-4 border-t border-[rgba(var(--text-primary-rgb),0.12)]" />
          ),
          table: ({ node, ...props }) => (
            <div className="my-3 overflow-x-auto">
              <table {...props} className="w-full border-collapse text-sm">
                {props.children}
              </table>
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead {...props} className="bg-[var(--surface-2)]" />
          ),
          th: ({ node, ...props }) => (
            <th {...props} className="border border-[rgba(var(--text-primary-rgb),0.18)] px-3 py-2 text-left font-semibold align-top text-[var(--text-primary)] bg-[var(--surface-1)]" />
          ),
          td: ({ node, ...props }) => (
            <td {...props} className="border border-[rgba(var(--text-primary-rgb),0.12)] px-3 py-2 align-top whitespace-pre-wrap break-words text-[rgba(var(--text-primary-rgb),0.9)] bg-[var(--surface-1)]" />
          ),
          code: ({ inline, className: _cls, children, ...props }) => {
            if (inline) {
              return (
                <code {...props} className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-primary)] font-mono text-[12px]" >
                  {children}
                </code>
              );
            }
            return (
              <pre className="my-3 p-3 rounded border border-[rgba(var(--text-primary-rgb),0.18)] bg-[var(--surface-2)] text-[var(--text-primary)] overflow-auto text-sm">
                <code {...props}>{children}</code>
              </pre>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
