import React from 'react';
import {
  SparklesIcon,
  AdjustmentsHorizontalIcon,
  MagnifyingGlassCircleIcon,
} from '@heroicons/react/24/outline';

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
  label: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  accent: string;
}> = [
  {
    id: 'generate',
    label: '图片生成',
    description: '从文本快速生成创意图像',
    icon: SparklesIcon,
    accent: 'from-brand-500/70 via-brand-400/40 to-brand-500/15',
  },
  {
    id: 'edit',
    label: '图片编辑',
    description: '上传素材并智能润色或局部修改',
    icon: AdjustmentsHorizontalIcon,
    accent: 'from-amber-400/70 via-amber-300/35 to-amber-500/15',
  },
  {
    id: 'analyze',
    label: '图像分析',
    description: '识别图片内容并生成结构化描述',
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

  return (
    <div
      className={
        isHorizontal
          ? 'grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur-md'
          : 'flex flex-col gap-3'
      }
    >
      {modes.map((mode) => {
        const Icon = mode.icon;
        const isActive = selectedMode === mode.id;
        const disabled = isProcessing;

        if (isHorizontal) {
          const iconClasses = [
            'flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200',
            isActive
              ? 'bg-blue-500/28 text-blue-50 ring-2 ring-blue-300/85 ring-offset-[3px] ring-offset-[rgba(15,23,42,0.75)] shadow-[0_0_12px_rgba(59,130,246,0.55)]'
              : 'bg-white/10 text-neutral-200 shadow-[0_0_0_1px_rgba(148,163,184,0.3)] hover:text-slate-100',
          ].join(' ');

          return (
            <button
              key={mode.id}
              type="button"
              aria-pressed={isActive}
              disabled={disabled}
              onClick={() => !disabled && onModeChange(mode.id)}
              className={`relative flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium transition-all duration-200 ${
                isActive ? 'text-slate-50' : 'text-neutral-300 hover:text-slate-100'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <span className={iconClasses}>
                <Icon className="h-4 w-4" />
              </span>
              <span className={`truncate tracking-wide transition-colors duration-150 ${isActive ? 'text-blue-100' : 'text-neutral-300'}`}>
                {mode.label}
              </span>
            </button>
          );
        }

        const iconClasses = [
          'flex h-12 w-12 items-center justify-center rounded-full text-white transition-all duration-200',
          isActive
            ? 'bg-blue-500/28 text-blue-50 ring-2 ring-blue-300/85 ring-offset-[4px] ring-offset-[rgba(15,23,42,0.75)] shadow-[0_0_18px_rgba(59,130,246,0.55)]'
            : 'bg-black/25 text-neutral-200 shadow-[0_0_0_1px_rgba(148,163,184,0.22)] group-hover:text-slate-50',
        ].join(' ');

        return (
          <button
            key={mode.id}
            type="button"
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => !disabled && onModeChange(mode.id)}
            className={`group relative flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all duration-200 ${
              isActive ? 'text-slate-50' : 'text-neutral-200 hover:text-slate-50'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <span className="relative">
              <span className={iconClasses}>
                <Icon className="h-5 w-5" />
              </span>
            </span>
            <div className="relative flex flex-col gap-0.35">
              <span className={`text-sm font-semibold tracking-wide transition-colors duration-150 ${isActive ? 'text-blue-100' : 'text-neutral-200'}`}>
                {mode.label}
              </span>
              {!condensed && (
                <span className={`text-xs transition-colors duration-150 ${isActive ? 'text-blue-100/80' : 'text-neutral-400/80'}`}>
                  {mode.description}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};
