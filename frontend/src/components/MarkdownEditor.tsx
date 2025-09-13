import React, { useMemo, useRef, useState, useEffect } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer.tsx';

interface MarkdownEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  defaultMode?: 'edit' | 'preview' | 'split';
  mode?: 'edit' | 'preview' | 'split';
  onModeChange?: (m: 'edit' | 'preview' | 'split') => void;
  minHeight?: number; // px, only controls the content area min-height
}

// Lightweight Markdown editor with built-in preview/split view using our MarkdownRenderer.
export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  placeholder,
  disabled,
  className = '',
  defaultMode = 'split',
  mode,
  onModeChange,
  minHeight = 160,
}) => {
  const [innerMode, setInnerMode] = useState<'edit' | 'preview' | 'split'>(defaultMode);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Sync preview scroll with editor scroll (best-effort)
  const syncScroll = () => {
    const t = textRef.current;
    const p = previewRef.current;
    if (!t || !p) return;
    const tScrollable = t.scrollHeight - t.clientHeight;
    const pScrollable = p.scrollHeight - p.clientHeight;
    const ratio = tScrollable > 0 ? t.scrollTop / tScrollable : 0;
    p.scrollTop = ratio * pScrollable;
  };

  useEffect(() => {
    const t = textRef.current;
    if (!t) return;
    const handler = () => syncScroll();
    t.addEventListener('scroll', handler);
    return () => t.removeEventListener('scroll', handler);
  }, []);

  const contentAreaStyle = useMemo(() => ({ minHeight: `${minHeight}px` }), [minHeight]);
  const effectiveMode = mode ?? innerMode;

  const setMode = (m: 'edit' | 'preview' | 'split') => {
    if (onModeChange) onModeChange(m);
    else setInnerMode(m);
  };

  return (
    <div className={`border border-gray-300 rounded-lg ${className}`.trim()}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <div className="text-xs text-gray-500">Markdown 支持 GFM 表格/任务列表</div>
        <div className="inline-flex rounded-md overflow-hidden border border-gray-300">
          <button
            className={`px-2 py-1 text-xs ${effectiveMode === 'edit' ? 'bg-white text-gray-900' : 'bg-gray-100 text-gray-600'} hover:bg-white`}
            onClick={() => setMode('edit')}
            type="button"
          >
            编辑
          </button>
          <button
            className={`px-2 py-1 text-xs border-l border-gray-300 ${effectiveMode === 'preview' ? 'bg-white text-gray-900' : 'bg-gray-100 text-gray-600'} hover:bg-white`}
            onClick={() => setMode('preview')}
            type="button"
          >
            预览
          </button>
          <button
            className={`px-2 py-1 text-xs border-l border-gray-300 ${effectiveMode === 'split' ? 'bg-white text-gray-900' : 'bg-gray-100 text-gray-600'} hover:bg-white`}
            onClick={() => setMode('split')}
            type="button"
          >
            并排
          </button>
        </div>
      </div>

      {/* Content */}
      {effectiveMode === 'edit' && (
        <textarea
          ref={textRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={!!disabled}
          className="w-full p-3 rounded-b-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
          style={contentAreaStyle}
        />
      )}
      {effectiveMode === 'preview' && (
        <div className="p-3 rounded-b-lg bg-white" style={contentAreaStyle}>
          {value.trim() ? (
            <div ref={previewRef} className="max-h-[60vh] overflow-auto">
              <MarkdownRenderer content={value} />
            </div>
          ) : (
            <div className="text-sm text-gray-400">暂无内容</div>
          )}
        </div>
      )}
      {effectiveMode === 'split' && (
        <div className="grid grid-cols-2 gap-0">
          <textarea
            ref={textRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={!!disabled}
            className="w-full p-3 rounded-bl-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono border-r border-gray-200"
            style={contentAreaStyle}
          />
          <div className="p-3 bg-white rounded-br-lg max-h-[60vh] overflow-auto" ref={previewRef} style={contentAreaStyle}>
            {value.trim() ? (
              <MarkdownRenderer content={value} />
            ) : (
              <div className="text-sm text-gray-400">暂无内容</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
