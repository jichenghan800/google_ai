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
          return (
            <button
              key={mode.id}
              type="button"
              aria-pressed={isActive}
              disabled={disabled}
              onClick={() => !disabled && onModeChange(mode.id)}
              className={`relative flex flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-medium text-neutral-200 transition-all duration-200 ${
                isActive
                  ? 'border-brand-400/60 bg-white/12 text-white shadow-brand'
                  : 'hover:border-brand-400/50 hover:bg-white/10'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate tracking-wide">{mode.label}</span>
            </button>
          );
        }

        return (
          <button
            key={mode.id}
            type="button"
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => !disabled && onModeChange(mode.id)}
            className={`group relative flex items-center gap-3 rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-left transition-all duration-200 ${
              isActive
                ? 'border-brand-400/60 bg-white/12 text-white shadow-brand'
                : 'hover:border-brand-400/40 hover:bg-white/10 text-neutral-100'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <span
              className={`pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 ease-out ${
                isActive ? 'opacity-80' : 'group-hover:opacity-70'
              } bg-gradient-to-br ${mode.accent}`}
            />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-black/25 text-white shadow-inner">
              <Icon className="h-5 w-5" />
            </div>
            <div className="relative flex flex-col gap-0.35">
              <span className="text-sm font-semibold tracking-wide">
                {mode.label}
              </span>
              {!condensed && (
                <span className="text-xs text-neutral-300/90">
                  {mode.description}
                </span>
              )}
            </div>
            {isActive && (
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/90">
                当前
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
