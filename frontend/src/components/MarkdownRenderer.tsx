import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// A lightweight, safe Markdown renderer (headings, lists, blockquote, code, links, bold)
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const renderInline = (text: string, keyPrefix: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];

    // Protect inline code first
    const codeRegex = /`([^`]+)`/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let partIndex = 0;
    while ((match = codeRegex.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      if (before) nodes.push(...renderLinksBold(before, `${keyPrefix}-t${partIndex++}`));
      nodes.push(
        <code key={`${keyPrefix}-code-${partIndex++}`} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 font-mono text-[12px]">
          {match[1]}
        </code>
      );
      lastIndex = match.index + match[0].length;
    }
    const tail = text.slice(lastIndex);
    if (tail) nodes.push(...renderLinksBold(tail, `${keyPrefix}-t${partIndex++}`));

    return nodes;
  };

  const renderLinksBold = (text: string, keyPrefix: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let partIndex = 0;
    while ((match = linkRegex.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      if (before) nodes.push(...renderBold(before, `${keyPrefix}-lb${partIndex++}`));
      nodes.push(
        <a
          key={`${keyPrefix}-a-${partIndex++}`}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          {match[1]}
        </a>
      );
      lastIndex = match.index + match[0].length;
    }
    const tail = text.slice(lastIndex);
    if (tail) nodes.push(...renderBold(tail, `${keyPrefix}-lb${partIndex++}`));
    return nodes;
  };

  const renderBold = (text: string, keyPrefix: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    const boldRegex = /\*\*([^*]+)\*\*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let partIndex = 0;
    while ((match = boldRegex.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      if (before) nodes.push(<span key={`${keyPrefix}-b${partIndex++}`}>{before}</span>);
      nodes.push(
        <strong key={`${keyPrefix}-strong-${partIndex++}`} className="font-semibold text-gray-900">{match[1]}</strong>
      );
      lastIndex = match.index + match[0].length;
    }
    const tail = text.slice(lastIndex);
    if (tail) nodes.push(<span key={`${keyPrefix}-b${partIndex++}`}>{tail}</span>);
    return nodes;
  };

  const renderBlocks = (src: string): React.ReactNode[] => {
    const lines = src.replace(/\r\n?/g, '\n').split('\n');
    const out: React.ReactNode[] = [];
    let i = 0;
    let key = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Fenced code block ```
      if (/^```/.test(line)) {
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }
        // Skip closing ```
        if (i < lines.length && /^```/.test(lines[i])) i++;
        out.push(
          <pre key={`pre-${key++}`} className="my-3 p-3 rounded bg-gray-900 text-gray-100 overflow-auto text-sm">
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        continue;
      }

      // Heading #..######
      const h = line.match(/^(#{1,6})\s+(.+)/);
      if (h) {
        const level = h[1].length as 1 | 2 | 3 | 4 | 5 | 6;
        const text = h[2];
        const Tag = (`h${level}` as unknown) as keyof JSX.IntrinsicElements;
        const sizes = {
          1: 'text-xl font-bold',
          2: 'text-lg font-semibold',
          3: 'text-base font-semibold',
          4: 'text-sm font-semibold',
          5: 'text-sm',
          6: 'text-xs',
        } as const;
        out.push(
          <Tag key={`h-${key++}`} className={`${sizes[level]} text-gray-900 mt-3 mb-2`}>
            {renderInline(text, `h-${key}`)}
          </Tag>
        );
        i++;
        continue;
      }

      // Blockquote
      if (/^>\s?/.test(line)) {
        const quote: string[] = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        out.push(
          <blockquote key={`q-${key++}`} className="border-l-4 border-gray-300 pl-3 py-1 my-2 text-gray-700 bg-gray-50 rounded-r">
            {renderInline(quote.join(' '), `q-${key}`)}
          </blockquote>
        );
        continue;
      }

      // Unordered list
      if (/^\s*[-*]\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
          i++;
        }
        out.push(
          <ul key={`ul-${key++}`} className="list-disc pl-5 my-2 space-y-1 text-gray-800">
            {items.map((it, idx) => (
              <li key={`uli-${idx}`}>{renderInline(it, `uli-${key}-${idx}`)}</li>
            ))}
          </ul>
        );
        continue;
      }

      // Ordered list
      if (/^\s*\d+\.\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
          i++;
        }
        out.push(
          <ol key={`ol-${key++}`} className="list-decimal pl-5 my-2 space-y-1 text-gray-800">
            {items.map((it, idx) => (
              <li key={`oli-${idx}`}>{renderInline(it, `oli-${key}-${idx}`)}</li>
            ))}
          </ol>
        );
        continue;
      }

      // Blank line => spacing
      if (/^\s*$/.test(line)) {
        out.push(<div key={`sp-${key++}`} className="h-2" />);
        i++;
        continue;
      }

      // Paragraph
      out.push(
        <p key={`p-${key++}`} className="text-gray-800 leading-6 my-1">
          {renderInline(line, `p-${key}`)}
        </p>
      );
      i++;
    }
    return out;
  };

  return (
    <div className={`prose prose-sm max-w-none ${className}`.trim()}>
      {renderBlocks(content)}
    </div>
  );
};

