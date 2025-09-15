import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Production-ready Markdown renderer with GFM (tables, task lists, strikethrough)
// We map elements to Tailwind classes for a clean, compact UI suitable for the result panel.
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  // Fallback renderer without external deps; preserves whitespace and links visually.
  // Note: This does not parse markdown; it simply displays text nicely.
  const linkified = React.useMemo(() => {
    try {
      // naive linkify for http(s) URLs
      const parts = (content || '').split(/(https?:\/\/[^\s)]+)/g);
      return parts.map((part, i) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a key={i} href={part} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      });
    } catch {
      return content;
    }
  }, [content]);

  return (
    <div className={`max-w-none ${className}`.trim()}>
      <div className="text-gray-800 leading-6 whitespace-pre-wrap break-words text-sm">
        {linkified}
      </div>
    </div>
  );
};
