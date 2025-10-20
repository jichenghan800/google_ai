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
  variant?: 'light' | 'glass';
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
  variant = 'light',
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
  const isGlass = variant === 'glass';
  const containerClass = [
    isGlass
      ? 'rounded-2xl border border-white/12 bg-white/[0.08] backdrop-blur-xl text-slate-100 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.65)]'
      : 'border border-gray-300 rounded-lg',
    className
  ].filter(Boolean).join(' ');
  const toolbarClassName = isGlass
    ? 'absolute top-1 right-3 z-30 inline-flex rounded-full border border-white/15 bg-white/10 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.65)]'
    : 'absolute top-1 right-2 z-30 inline-flex rounded-md border border-gray-300 bg-white shadow-sm';
  const modeSwitcherClass = isGlass
    ? 'inline-flex overflow-hidden rounded-full'
    : 'inline-flex overflow-hidden rounded-md';
  const modeButtonClass = (target: 'edit' | 'preview' | 'split', index: number) => {
    if (isGlass) {
      const base = `px-3 py-1 text-xs transition-colors${index > 0 ? ' border-l border-white/10' : ''}`;
      const state = effectiveMode === target ? 'bg-white/20 text-slate-100 shadow-inner' : 'text-slate-300 hover:bg-white/10';
      return `${base} ${state}`.trim();
    }
    const base = `px-2 py-1 text-xs${index > 0 ? ' border-l border-gray-300' : ''}`;
    const state = effectiveMode === target ? 'bg-white text-gray-900' : 'bg-gray-100 text-gray-600';
    return `${base} ${state} hover:bg-white`.trim();
  };
  const textareaBaseClass = isGlass
    ? 'w-full p-3 bg-transparent text-slate-100 placeholder:text-slate-400 resize-none focus:ring-2 focus:ring-emerald-300/60 focus:border-transparent text-sm xl:text-base font-mono'
    : 'w-full p-3 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm xl:text-base font-mono';
  const previewBaseClass = isGlass
    ? 'p-3 bg-white/5 text-sm xl:text-base text-slate-100'
    : 'p-3 bg-white text-sm xl:text-base';
  const emptyHintClass = isGlass ? 'text-sm text-slate-400' : 'text-sm text-gray-400';

  const setMode = (m: 'edit' | 'preview' | 'split') => {
    if (onModeChange) onModeChange(m);
    else setInnerMode(m);
  };

  return (
    <div className={`${containerClass} relative`}>
      {/* Toolbar */}
      <div className={toolbarClassName}>
        <div className={modeSwitcherClass}>
          <button
            className={modeButtonClass('edit', 0)}
            onClick={() => setMode('edit')}
            type="button"
          >
            编辑
          </button>
          <button
            className={modeButtonClass('preview', 1)}
            onClick={() => setMode('preview')}
            type="button"
          >
            预览
          </button>
          <button
            className={modeButtonClass('split', 2)}
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
          className={`${textareaBaseClass} ${isGlass ? 'rounded-b-2xl' : 'rounded-b-lg'}`}
          style={contentAreaStyle}
        />
      )}
      {effectiveMode === 'preview' && (
        <div
          className={`${previewBaseClass} ${isGlass ? 'rounded-b-2xl' : 'rounded-b-lg'}`}
          style={contentAreaStyle}
        >
          {value.trim() ? (
            <div ref={previewRef}>
              <MarkdownRenderer content={value} />
            </div>
          ) : (
            <div className={emptyHintClass}>暂无内容</div>
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
            className={`${textareaBaseClass} ${isGlass ? 'rounded-bl-2xl border-r border-white/10' : 'rounded-bl-lg border-r border-gray-200'}`}
            style={contentAreaStyle}
          />
          <div
            className={`${previewBaseClass} ${isGlass ? 'rounded-br-2xl border-l border-white/10' : 'rounded-br-lg'}`}
            ref={previewRef}
            style={contentAreaStyle}
          >
            {value.trim() ? (
              <MarkdownRenderer content={value} />
            ) : (
              <div className={emptyHintClass}>暂无内容</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
