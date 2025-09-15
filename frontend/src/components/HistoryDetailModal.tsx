import React, { useState, useEffect } from 'react';
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
  const result: ImageEditResult | undefined = results[index];
  // 高度随外层 overlay 填满视口减去 padding，通过 h-full/max-h-full 实现
  // 在高分辨率 + 高缩放（如 4K@150%）下，增加对话框最大宽度以保持更接近其他分辨率的宽高比
  const [modalMaxWidth, setModalMaxWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    const compute = () => {
      try {
        const dpr = (window as any).devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;
        // 依据 Tailwind 断点估算 overlay 的 padding（与容器 p-2/sm:p-4/md:p-6 对齐）
        const pad = w >= 768 ? 24 : (w >= 640 ? 16 : 8);
        const contentW = w - 2 * pad;
        const contentH = h - 2 * pad;
        const isHighDPILarge = dpr >= 1.5 && w >= 2000 && h >= 1100;
        if (isHighDPILarge) {
          const targetAR = 1.65; // 目标接近 16:9 的横向观感
          const desiredW = Math.min(contentW, Math.floor(contentH * targetAR));
          // 仅当大于默认 7xl (~1280px) 时才生效，避免影响其它分辨率
          setModalMaxWidth(Math.max(1280, desiredW));
        } else {
          setModalMaxWidth(undefined);
        }
      } catch {
        setModalMaxWidth(undefined);
      }
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  const hasInputs = !!(result && Array.isArray(result.inputImages) && result.inputImages.length > 0);
  const isImage = result?.resultType === 'image';

  const getSource = () => {
    if (result) {
      if (hasInputs && (result.prompt || '').trim()) return { label: '编辑', dot: 'bg-purple-500' };
      if (hasInputs) return { label: '分析', dot: 'bg-blue-500' };
    }
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

  // 鼠标滚轮切换（上一个/下一个），添加简单节流避免过度触发
  React.useEffect(() => {
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      const now = Date.now();
      if (now - last < 250) return; // 250ms 节流
      // 如果有预览大图打开，优先关闭预览而不是切换
      if (previewUrl) return;
      const dir = e.deltaY > 0 ? 1 : (e.deltaY < 0 ? -1 : 0);
      if (dir === 0) return;
      const targetIndex = dir > 0 ? Math.min(results.length - 1, index + 1) : Math.max(0, index - 1);
      if (targetIndex !== index) {
        onNavigate(targetIndex);
        last = now;
        try { e.preventDefault(); } catch {}
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel as any);
  }, [index, results.length, onNavigate, previewUrl]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-4 md:p-6" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl 2xl:max-w-7xl h-full max-h-full overflow-hidden flex flex-col" style={modalMaxWidth ? { maxWidth: `${modalMaxWidth}px` } : undefined}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 md:px-4 py-2.5 md:py-3 border-b">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-full ${source.dot}`} />
            <span className="text-sm text-gray-600">{source.label}</span>
            <span className="text-sm text-gray-400">• {result ? new Date(result.createdAt).toLocaleString('zh-CN') : ''}</span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 p-3 md:p-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-0 md:gap-5 items-stretch h-full">
          {/* Left: prompt and meta */}
          <div className="md:col-span-4 space-y-3 flex flex-col h-full min-h-0 overflow-hidden">
            <div className="relative flex-1 min-h-0">
              <div className="h-full p-3 border rounded bg-gray-50 text-sm text-gray-800 whitespace-pre-wrap break-words overflow-auto pr-12">
                {result?.prompt || '（无）'}
              </div>
              <button
                className={`absolute bottom-2 right-2 px-2 py-1 text-xs rounded ${copiedPrompt ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} shadow-sm`}
                onClick={() => handleCopy(result?.prompt || '', 'prompt')}
                title="复制提示词"
              >
                {copiedPrompt ? '已复制' : '复制'}
              </button>
            </div>
          </div>

          {/* Right: result preview */}
          <div className="space-y-3 md:col-span-8 h-full min-h-0">
            <div className="relative border rounded bg-gray-50 h-full min-h-[220px] md:min-h-[280px] flex items-start justify-center overflow-hidden">
              {result ? (
                isImage ? (
                  <>
                    <img
                      src={result.result}
                      alt="结果预览"
                      className="max-w-full max-h-full object-contain object-top cursor-pointer"
                      onClick={() => setPreviewUrl(result.result)}
                    />
                    {/* 悬浮下载按钮（右上角） */}
                    <button
                      className="absolute top-2 right-2 w-10 h-10 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors shadow"
                      title="下载图片"
                      onClick={(e) => { e.stopPropagation(); if (result?.result) handleDownloadImage(result.result); }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <div className="p-3 text-sm text-gray-800 whitespace-pre-wrap break-words max-h-80 overflow-auto w-full">
                    {result?.result}
                  </div>
                )
              ) : (
                <div className="p-3 text-sm text-gray-400">暂无数据</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {result && !isImage ? (
                <button
                  className={`px-2 py-1 text-xs rounded ${copiedResult ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                  onClick={() => handleCopy(result?.result || '', 'result')}
                >{copiedResult ? '已复制' : '复制文本'}</button>
              ) : (
                <></>
              )}
            </div>
          </div>
          </div>
        </div>

        {/* Image lightbox for result preview */}
        {previewUrl && (
          <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-3 sm:p-4" onClick={() => setPreviewUrl(null)}>
            <img src={previewUrl} alt="图片预览" className="object-contain" style={{ maxWidth: '95vw', maxHeight: '95vh' }} />
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryDetailModal;
