import React from 'react';
import { AspectRatioOption } from '../types/index.ts';

interface CanvasSelectorProps {
  selectedRatio: AspectRatioOption;
  onRatioChange: (ratio: AspectRatioOption) => void;
  aspectRatioOptions: AspectRatioOption[];
  currentResult?: any;
  onDownload?: () => void;
  onEditMode?: () => void;
  onClearResult?: () => void;
  onToggleHistory?: () => void;
  // 可选：在画布选择内容与底部工具之间插入自定义内容（例如“最佳实践 DEMO”）
  belowContentSlot?: React.ReactNode;
  // 在外层统一标题/框架时使用：隐藏本组件自带的标题区域
  hideHeader?: boolean;
  // 在外层统一卡片时使用：移除本组件的边框/内边距，仅输出内部内容
  frameless?: boolean;
}

export const CanvasSelector: React.FC<CanvasSelectorProps> = ({
  selectedRatio,
  onRatioChange,
  aspectRatioOptions,
  currentResult,
  onDownload,
  onEditMode,
  onClearResult,
  onToggleHistory,
  belowContentSlot,
  hideHeader = false,
  frameless = false
}) => {
  const [theme, setTheme] = React.useState<string>(() => localStorage.getItem('theme') || 'light');
  const [lang, setLang] = React.useState<string>(() => localStorage.getItem('lang') || 'zh');

  React.useEffect(() => {
    try {
      localStorage.setItem('theme', theme);
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.setAttribute('data-theme', theme);
    } catch {}
  }, [theme]);

  React.useEffect(() => {
    try { localStorage.setItem('lang', lang); } catch {}
  }, [lang]);

  // 三个矩形卡片（恢复旧样式风格，按传入的 aspectRatioOptions 原样渲染）
  const RatioCards = () => {
    return (
      <div className="grid grid-cols-1 gap-2">
        {aspectRatioOptions.map((opt) => {
          const active = selectedRatio.id === opt.id;
          const buttonClasses = [
            'group w-full text-left rounded-xl px-3 py-2 transition-all duration-200 border flex flex-col gap-1',
            active
              ? 'border-[rgba(37,99,235,0.45)] bg-[rgba(37,99,235,0.12)] text-[var(--text-primary)] shadow-sm'
              : 'border-[rgba(148,163,184,0.35)] bg-[rgba(248,250,255,0.92)] text-[var(--text-primary)] hover:border-[rgba(37,99,235,0.35)] hover:bg-[rgba(226,232,240,0.96)] shadow-[0_6px_18px_-12px_rgba(15,23,42,0.28)]'
          ].join(' ');
          const labelClass = active
            ? 'text-[var(--text-primary)]'
            : 'text-[rgba(var(--text-primary-rgb),0.9)] group-hover:text-[var(--text-primary)]';
          const descriptionClass = active
            ? 'text-[rgba(var(--text-secondary-rgb),0.85)]'
            : 'text-[rgba(var(--text-secondary-rgb),0.74)] group-hover:text-[rgba(var(--text-secondary-rgb),0.82)]';
          const iconClass = active
            ? 'text-[rgba(37,99,235,0.92)]'
            : 'text-[rgba(var(--text-primary-rgb),0.6)] group-hover:text-[rgba(var(--text-primary-rgb),0.75)]';
          return (
            <button
              key={opt.id}
              onClick={() => onRatioChange(opt)}
              aria-pressed={active}
              className={buttonClasses}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`text-xl transition-colors duration-150 ${iconClass}`} aria-hidden="true">{opt.icon}</span>
                  <div className="flex items-baseline gap-2">
                    <span className={`font-medium text-sm transition-colors duration-150 ${labelClass}`}>{opt.label}</span>
                    <span className={`text-xs transition-colors duration-150 ${descriptionClass}`}>{opt.description}</span>
                  </div>
                </div>
                <span className={`inline-block w-2.5 h-2.5 rounded-full transition-opacity duration-150 ${active ? 'bg-[var(--accent)] opacity-100' : 'bg-[rgba(var(--text-primary-rgb),0.25)] opacity-0 group-hover:opacity-40'}`} aria-hidden="true" />
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  if (frameless) {
    return (
      <div className="flex flex-col h-full">
        {!hideHeader && (
          <div className="pb-2">
            <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)] leading-tight">画布选择</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">选择您的图片比例</p>
          </div>
        )}
        <div className="flex-1">
          <RatioCards />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col rounded-xl border border-[rgba(var(--text-primary-rgb),0.12)] bg-[var(--surface-1)] shadow-sm">
      {!hideHeader && (
        <div className="p-3 border-b border-[rgba(var(--text-primary-rgb),0.08)]">
          <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)] leading-tight">画布选择</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">选择您的图片比例</p>
        </div>
      )}
      <div className="flex-1 p-3 flex flex-col justify-center">
        <RatioCards />
      </div>
      {belowContentSlot && (
        <div className="px-3 pb-2">
          {belowContentSlot}
        </div>
      )}
      <div className="px-3 py-2 border-t border-[rgba(var(--text-primary-rgb),0.08)] rounded-b-xl">
        <div className="hidden sm:flex items-center justify-between">
          <button
            type="button"
            onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-[rgba(var(--text-primary-rgb),0.15)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors flex items-center justify-center shadow-sm"
            title="切换主题"
          >
            {theme === 'dark' ? (
              <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364l-1.414-1.414M7.05 7.05L5.636 5.636m12.728 0l-1.414 1.414M7.05 16.95l-1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 118.646 3.646 7 7 0 0020.354 15.354z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => onToggleHistory?.()}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-[rgba(var(--text-primary-rgb),0.15)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors flex items-center justify-center shadow-sm"
            title="历史记录"
          >
            <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setLang(l => (l === 'zh' ? 'en' : 'zh'))}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-[rgba(var(--text-primary-rgb),0.15)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors flex items-center justify-center shadow-sm"
            title="切换语言"
          >
            <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 0c2.5 2 4 5.5 4 9s-1.5 7-4 9m0-18c-2.5 2-4 5.5-4 9s1.5 7 4 9m-7-9h14" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
