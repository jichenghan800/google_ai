import React from 'react';

interface Props {
  open: boolean;
  original: string;
  optimized: string;
  reasons?: string[];
  onAccept: () => void;
  onCancel: () => void;
}

export const PromptOptimizeSuggestModal: React.FC<Props> = ({ open, original, optimized, reasons = [], onAccept, onCancel }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.45)] backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl rounded-xl border border-[var(--border-soft)] bg-[var(--surface-card)] shadow-[0_30px_70px_rgba(15,23,42,0.25)] p-5 text-[var(--text-primary)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">建议优化提示词</span>
            {reasons.length > 0 && (
              <span className="text-xs text-[var(--text-secondary)]">({reasons.join(' / ')})</span>
            )}
          </div>
          <button onClick={onCancel} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">✕</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-[rgba(var(--text-primary-rgb),0.12)] bg-[var(--surface-1)] p-3">
            <div className="text-sm font-medium text-[var(--text-secondary)] mb-1">原始提示词</div>
            <pre className="text-xs whitespace-pre-wrap text-[var(--text-primary)]">{original}</pre>
          </div>
          <div className="rounded-lg border border-[rgba(34,197,94,0.25)] bg-emerald-50/80 p-3">
            <div className="text-sm font-medium text-emerald-700 mb-1">优化建议</div>
            <pre className="text-xs whitespace-pre-wrap text-emerald-900">{optimized}</pre>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded border border-[rgba(var(--text-primary-rgb),0.12)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors">保留原文</button>
          <button onClick={onAccept} className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] hover:bg-[rgba(37,99,235,0.92)] text-white transition-colors">使用优化</button>
        </div>
      </div>
    </div>
  );
};

export default PromptOptimizeSuggestModal;
