import React, { useEffect, useRef, useState } from 'react';
import { AIMode } from './ModeToggle.tsx';

interface WelcomeOverlayProps {
  show: boolean;
  onClose: () => void;
  onSelectMode?: (mode: AIMode) => void;
  autoCloseMs?: number; // 可选：>0 时自动关闭；默认不自动
  selectedMode?: AIMode;
}

// 轻量版浮动大标题：页面载入时展示，自动/手动消失
export const WelcomeOverlay: React.FC<WelcomeOverlayProps> = ({
  show,
  onClose,
  onSelectMode,
  autoCloseMs = 0,
  selectedMode = 'generate',
}) => {
  const timerRef = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!show) return;
    // 自动关闭（如有配置）
    if (autoCloseMs && autoCloseMs > 0) {
      timerRef.current = window.setTimeout(() => {
        onClose();
      }, autoCloseMs);
    }
    // 取消键盘自动关闭（仅保留按钮关闭）
    const onKey = (_e: KeyboardEvent) => {};
    window.addEventListener('keydown', onKey);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      window.removeEventListener('keydown', onKey);
    };
  }, [show, autoCloseMs, onClose]);

  if (!show) return null;

  const handleClose = () => {
    setClosing(true);
    window.setTimeout(() => {
      onClose();
      setClosing(false);
    }, 180);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      {/* 背景轻遮罩，不打断视觉 */}
      <div className="absolute inset-0 bg-black/10" aria-hidden="true" />

      {/* 浮动卡片 */}
      <div className="relative mx-auto w-[80vw] max-w-screen-2xl">
        <div className={`backdrop-blur-xl bg-white/30 border border-white/50 shadow-2xl rounded-2xl px-6 sm:px-10 py-6 sm:py-10 text-center transition-all duration-200 ${closing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
          {/* 标题与副标题（彩色标题） */}
          <div className="mb-3 sm:mb-4 flex items-center justify-center gap-3">
            <span className="text-3xl sm:text-4xl select-none" aria-hidden="true">🖼️</span>
            <h1 className="text-2xl sm:text-3xl xl:text-5xl font-extrabold bg-gradient-to-r from-indigo-500 via-blue-500 to-emerald-500 bg-clip-text text-transparent tracking-tight">
              AI 图像工作台
            </h1>
          </div>
          <p className="text-sm sm:text-base text-gray-700/90 mb-6">
            一站式图片生成、编辑与分析
          </p>

          {/* 操作区：仅保留“开始使用” */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 sm:px-8 py-2.5 rounded-xl bg-blue-600/90 hover:bg-blue-600 text-white shadow-lg"
            >
              开始使用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeOverlay;
