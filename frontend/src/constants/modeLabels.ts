import type { AIMode } from '../components/ModeToggle.tsx';
import type { SupportedLang } from '../locales/translations.ts';

const MODE_LABELS: Record<AIMode, { zh: string; en: string }> = {
  generate: { zh: '图片生成', en: 'Image Generation' },
  edit: { zh: '图片编辑', en: 'Image Editing' },
  analyze: { zh: '图片分析', en: 'Image Analysis' },
};

export const getModeDisplayLabel = (mode: AIMode, lang: SupportedLang = 'zh'): string => {
  const entry = MODE_LABELS[mode];
  const label = entry ? entry[lang] : '';
  return lang === 'zh' ? `当前模式 · ${label}` : `Current Mode · ${label}`;
};
