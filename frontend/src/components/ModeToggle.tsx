import React from 'react';
import {
  SparklesIcon,
  AdjustmentsHorizontalIcon,
  MagnifyingGlassCircleIcon,
} from '@heroicons/react/24/outline';
import { useLocale } from '../contexts/LocaleContext.tsx';

export type AIMode = 'generate' | 'edit' | 'analyze';

interface ModeToggleProps {
  selectedMode: AIMode;
  onModeChange: (mode: AIMode) => void;
  isProcessing?: boolean;
  layout?: 'vertical' | 'horizontal';
  condensed?: boolean;
}

const modes: Array<{
  id: AIMode;
  label: { zh: string; en: string };
  description: { zh: string; en: string };
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  accent: string;
}> = [
  {
    id: 'generate',
    label: { zh: '图片生成', en: 'Image Generation' },
    description: { zh: '从文本快速生成创意图像', en: 'Create images from text prompts' },
    icon: SparklesIcon,
    accent: 'from-brand-500/70 via-brand-400/40 to-brand-500/15',
  },
  {
    id: 'edit',
    label: { zh: '图片编辑', en: 'Image Editing' },
    description: { zh: '上传素材并智能润色或局部修改', en: 'Enhance or adjust uploaded images' },
    icon: AdjustmentsHorizontalIcon,
    accent: 'from-amber-400/70 via-amber-300/35 to-amber-500/15',
  },
  {
    id: 'analyze',
    label: { zh: '图片分析', en: 'Image Analysis' },
    description: { zh: '识别图片内容并生成结构化描述', en: 'Identify image content with structured insights' },
    icon: MagnifyingGlassCircleIcon,
    accent: 'from-emerald-400/70 via-emerald-300/35 to-emerald-500/15',
  },
];

export const ModeToggle: React.FC<ModeToggleProps> = ({
  selectedMode,
  onModeChange,
  isProcessing = false,
  layout = 'vertical',
  condensed = false,
}) => {
  const isHorizontal = layout === 'horizontal';
  const isLightTheme = typeof document !== 'undefined' && document.documentElement.classList.contains('light');
  const { lang } = useLocale();
  const isZh = lang === 'zh';

  return (
    <div
      className={
        isHorizontal
          ? 'grid grid-cols-3 gap-2 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-card)] p-2 backdrop-blur-md shadow-[0_14px_42px_-28px_rgba(15,23,42,0.45)]'
          : 'flex flex-col gap-3'
      }
    >
      {modes.map((mode) => {
        const Icon = mode.icon;
        const isActive = selectedMode === mode.id;
        const disabled = isProcessing;
        const label = isZh ? mode.label.zh : mode.label.en;
        const desc = isZh ? mode.description.zh : mode.description.en;

        if (isHorizontal) {
          const iconClasses = [
            'flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200',
            isActive
            ? 'bg-blue-500/28 text-blue-50 ring-2 ring-blue-300/85 ring-offset-[3px] ring-offset-[rgba(var(--text-primary-rgb),0.18)] shadow-[0_0_12px_rgba(59,130,246,0.4)]'
              : 'bg-[rgba(var(--text-primary-rgb),0.08)] text-[var(--text-secondary)] shadow-[0_0_0_1px_rgba(var(--text-secondary-rgb),0.28)] hover:text-[var(--text-primary)]',
          ].join(' ');

          return (
            <button
              key={mode.id}
              type="button"
              aria-pressed={isActive}
              disabled={disabled}
              onClick={() => !disabled && onModeChange(mode.id)}
              className={`relative flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium transition-all duration-200 ${
                isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <span className={iconClasses}>
                <Icon className="h-4 w-4" />
              </span>
              <span className={`truncate tracking-wide transition-colors duration-150 ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                {label}
              </span>
            </button>
          );
        }

        const iconClasses = [
          'flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200',
          isActive
            ? isLightTheme
              ? 'bg-transparent text-[var(--text-primary)] ring-[1.5px] ring-[rgba(37,99,235,0.35)] ring-offset-0 shadow-[0_6px_20px_-14px_rgba(37,99,235,0.32)]'
              : 'bg-[rgba(37,99,235,0.18)] text-[var(--text-primary)] ring-[1.5px] ring-[rgba(37,99,235,0.35)] ring-offset-[2px] ring-offset-[rgba(var(--text-primary-rgb),0.12)] shadow-[0_6px_22px_-12px_rgba(37,99,235,0.35)]'
            : 'bg-transparent text-[var(--text-secondary)] border border-[rgba(var(--text-primary-rgb),0.14)] group-hover:text-[var(--text-primary)] group-hover:border-[rgba(37,99,235,0.35)]',
        ].join(' ');

        return (
          <button
            key={mode.id}
            type="button"
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => !disabled && onModeChange(mode.id)}
            className={`group relative flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all duration-200 ${
              isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <span className="relative">
              <span className={iconClasses}>
                <Icon className="h-5 w-5" />
              </span>
            </span>
            <div className="relative flex flex-col gap-0.35">
              <span className={`text-sm font-semibold tracking-wide transition-colors duration-150 ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                {label}
              </span>
              {!condensed && (
                <span className={`text-xs transition-colors duration-150 ${isActive ? 'text-[rgba(var(--text-primary-rgb),0.85)]' : 'text-[rgba(var(--text-secondary-rgb),0.68)]'}`}>
                  {desc}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};
