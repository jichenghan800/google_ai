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
            <h1 {...props} className="text-xl font-bold text-gray-900 mt-3 mb-2" />
          ),
          h2: ({ node, ...props }) => (
            <h2 {...props} className="text-lg font-semibold text-gray-900 mt-3 mb-2" />
          ),
          h3: ({ node, ...props }) => (
            <h3 {...props} className="text-base font-semibold text-gray-900 mt-3 mb-2" />
          ),
          h4: ({ node, ...props }) => (
            <h4 {...props} className="text-sm font-semibold text-gray-900 mt-2 mb-1" />
          ),
          p: ({ node, ...props }) => (
            <p {...props} className="text-gray-800 leading-6 my-1 whitespace-pre-wrap break-words" />
          ),
          a: ({ node, href, children, ...props }) => (
            <a href={href} target="_blank" rel="noreferrer" {...props} className="text-blue-600 hover:underline" >
              {children}
            </a>
          ),
          ul: ({ node, ...props }) => (
            <ul {...props} className="list-disc pl-5 my-2 space-y-1 text-gray-800" />
          ),
          ol: ({ node, ...props }) => (
            <ol {...props} className="list-decimal pl-5 my-2 space-y-1 text-gray-800" />
          ),
          li: ({ node, ...props }) => <li {...props} className="leading-6" />,
          blockquote: ({ node, ...props }) => (
            <blockquote {...props} className="border-l-4 border-gray-300 pl-3 py-1 my-2 text-gray-700 bg-gray-50 rounded-r" />
          ),
          hr: ({ node, ...props }) => (
            <hr {...props} className="my-4 border-t border-gray-300" />
          ),
          table: ({ node, ...props }) => (
            <div className="my-3 overflow-x-auto">
              <table {...props} className="w-full border-collapse text-sm">
                {props.children}
              </table>
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead {...props} className="bg-gray-100" />
          ),
          th: ({ node, ...props }) => (
            <th {...props} className="border border-gray-300 px-3 py-2 text-left font-semibold align-top text-gray-900" />
          ),
          td: ({ node, ...props }) => (
            <td {...props} className="border border-gray-200 px-3 py-2 align-top whitespace-pre-wrap break-words text-gray-800" />
          ),
          code: ({ inline, className: _cls, children, ...props }) => {
            if (inline) {
              return (
                <code {...props} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 font-mono text-[12px]" >
                  {children}
                </code>
              );
            }
            return (
              <pre className="my-3 p-3 rounded bg-gray-900 text-gray-100 overflow-auto text-sm">
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
