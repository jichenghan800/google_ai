import type { AIMode } from '../components/ModeToggle.tsx';

export const MODE_LABELS: Record<AIMode, string> = {
  generate: '图片生成',
  edit: '图片编辑',
  analyze: '图片分析',
};

export const getModeDisplayLabel = (mode: AIMode): string => {
  const label = MODE_LABELS[mode] || '';
  return `当前模式 · ${label}`;
};
