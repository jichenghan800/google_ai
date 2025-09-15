import React, { useState } from 'react';
import { ImageEditResult } from '../types/index.ts';

interface HistoryDetailModalProps {
  results: ImageEditResult[];
  index: number;
  onClose: () => void;
  onNavigate: (newIndex: number) => void;
}

export const HistoryDetailModal: React.FC<HistoryDetailModalProps> = ({ results, index, onClose, onNavigate }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  const result = results[index];
  if (!result) return null;

  const hasInputs = Array.isArray(result.inputImages) && result.inputImages.length > 0;
  const isImage = result.resultType === 'image';

  const getSource = () => {
    if (hasInputs && result.prompt.trim()) return { label: '编辑', dot: 'bg-purple-500' };
    if (hasInputs) return { label: '分析', dot: 'bg-blue-500' };
    return { label: '生成', dot: 'bg-emerald-500' };
  };
  const source = getSource();

  const handleDownloadImage = async (url: string) => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = `history-image-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(obj);
    } catch (e) {
      console.warn('下载失败', e);
    }
  };

  const handleCopy = async (text: string, type: 'prompt' | 'result') => {
    try {
      await navigator.clipboard.writeText(text || '');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text || '';
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }
    if (type === 'prompt') {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 1500);
    } else {
      setCopiedResult(true);
      setTimeout(() => setCopiedResult(false), 1500);
    }
  };

  // 键盘左右切换
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        onNavigate(Math.max(0, index - 1));
      } else if (e.key === 'ArrowRight') {
        onNavigate(Math.min(results.length - 1, index + 1));
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, results.length, onClose, onNavigate]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-full ${source.dot}`} />
            <span className="text-sm text-gray-600">{source.label}</span>
            <span className="text-sm text-gray-400">• {new Date(result.createdAt).toLocaleString('zh-CN')}</span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-4 p-4 overflow-auto">
          {/* Left: prompt and meta */}
          <div className="space-y-3">
            <div>
              <div className="p-3 border rounded bg-gray-50 text-sm text-gray-800 whitespace-pre-wrap break-words max-h-56 overflow-auto">
                {result.prompt || '（无）'}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  className={`px-2 py-1 text-xs rounded ${copiedPrompt ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                  onClick={() => handleCopy(result.prompt || '', 'prompt')}
                >{copiedPrompt ? '已复制' : '复制'}</button>
              </div>
            </div>

            {result.metadata && (
              <div className="text-xs text-gray-500">
                <div>模型：<span className="text-gray-700">{result.metadata.model || '未知'}</span></div>
                <div>时间：<span className="text-gray-700">{new Date(result.createdAt).toLocaleTimeString('zh-CN')}</span></div>
              </div>
            )}
          </div>

          {/* Right: result preview */}
          <div className="space-y-3">
            <div className="relative border rounded bg-gray-50 min-h-[200px] flex items-center justify-center overflow-hidden">
              {isImage ? (
                <>
                  <img
                    src={result.result}
                    alt="结果预览"
                    className="max-w-full max-h-80 object-contain cursor-pointer"
                    onClick={() => setPreviewUrl(result.result)}
                  />
                  {/* 悬浮下载按钮（右下角） */}
                  <button
                    className="absolute bottom-2 right-2 w-10 h-10 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors shadow"
                    title="下载图片"
                    onClick={(e) => { e.stopPropagation(); handleDownloadImage(result.result!); }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </button>
                </>
              ) : (
                <div className="p-3 text-sm text-gray-800 whitespace-pre-wrap break-words max-h-80 overflow-auto w-full">
                  {result.result}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isImage ? (
                <></>
              ) : (
                <button
                  className={`px-2 py-1 text-xs rounded ${copiedResult ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                  onClick={() => handleCopy(result.result || '', 'result')}
                >{copiedResult ? '已复制' : '复制文本'}</button>
              )}
            </div>
          </div>
        </div>

        {/* Image lightbox for result preview */}
        {previewUrl && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
            <img src={previewUrl} alt="图片预览" className="max-w-full max-h-full object-contain" />
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryDetailModal;
