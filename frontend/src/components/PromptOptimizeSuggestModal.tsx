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
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-gray-800">建议优化提示词</span>
            {reasons.length > 0 && (
              <span className="text-xs text-gray-500">({reasons.join(' / ')})</span>
            )}
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border rounded p-2">
            <div className="text-sm font-medium text-gray-600 mb-1">原始提示词</div>
            <pre className="text-xs whitespace-pre-wrap text-gray-800">{original}</pre>
          </div>
          <div className="border rounded p-2 bg-green-50">
            <div className="text-sm font-medium text-gray-600 mb-1">优化建议</div>
            <pre className="text-xs whitespace-pre-wrap text-gray-800">{optimized}</pre>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded">保留原文</button>
          <button onClick={onAccept} className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded">使用优化</button>
        </div>
      </div>
    </div>
  );
};

export default PromptOptimizeSuggestModal;

