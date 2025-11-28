import React, { useEffect, useMemo, useState } from 'react';
import { templateAPI } from '../services/api.ts';
import { resolveTemplateEmoji } from '../utils/templateEmoji.ts';
import { useLocale } from '../contexts/LocaleContext.tsx';

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  category: string;
  // optional bilingual fields
  nameZh?: string;
  nameEn?: string;
  contentZh?: string;
  contentEn?: string;
  emoji?: string;
  type?: string;
  ratio?: string;
  resolution?: string;
  defaultImages?: Record<string, { url?: string; signedUrl?: string } | string>;
}

interface QuickTemplatesProps {
  selectedMode: string;
  onSelectTemplate: (pick: {
    display: string;
    english?: string;
    id?: string;
    name?: string;
    nameZh?: string;
    nameEn?: string;
    content?: string;
    contentZh?: string;
    contentEn?: string;
    emoji?: string;
    category?: string;
    type?: string;
    ratio?: string;
    resolution?: string;
  }) => void;
  onManageTemplates: () => void;
  compact?: boolean; // 紧凑模式：用于与标题同一行展示
  stacked?: boolean; // 纵向列表：每条单行显示、撑满容器宽度
  variant?: 'chips' | 'list'; // 展示风格：默认胶囊按钮，可选列表样式
  dense?: boolean; // 紧凑密度：减少间距与字号
  framed?: boolean; // 列表项使用矩形框风格（与画布选择卡片风格一致）
  maxItems?: number; // 限制展示数量；传入Infinity或省略表示展示全部
  modelKey?: 'banana1' | 'banana2';
  currentRatioId?: string;
  currentResolutionId?: string;
}

export const QuickTemplates: React.FC<QuickTemplatesProps> = ({ 
  selectedMode, 
  onSelectTemplate, 
  onManageTemplates,
  compact = false,
  stacked = false,
  variant = 'chips',
  dense = false,
  framed = false,
  maxItems,
  modelKey = 'banana1',
  currentRatioId,
  currentResolutionId
}) => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { lang } = useLocale();
  const isZh = lang === 'zh';
  const ariaApplyPrefix = useMemo(() => (isZh ? '应用模板：' : 'Apply template: '), [isZh]);
  const placeholderLabel = useMemo(() => (isZh ? '常用场景' : 'Quick Scenario'), [isZh]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const usePro = modelKey === 'banana2';
      const category = usePro ? 'edit-pro' : selectedMode === 'edit' ? 'edit' : 'generate';
      const response = await templateAPI.getTemplates(category);
      const list = response.data || [];
      const filtered = (() => {
        if (!usePro) return list;
        const allowed =
          selectedMode === 'edit'
            ? ['图片编辑', '生成和编辑', '图片生成和图片编辑', '图片生成和编辑', '生成和图片编辑']
            : ['图片生成', '生成和编辑', '图片生成和图片编辑', '图片生成和编辑', '生成和图片编辑'];
        const normalize = (val: string) => (val || '').replace(/\s+/g, '');
        const allowedNorm = new Set(allowed.map(normalize));
        return list.filter((t: any) => {
          if (!allowedNorm.size) return true;
          const typeVal = normalize(String(t?.type || ''));
          if (!typeVal) return false;
          return allowedNorm.has(typeVal);
        });
      })();
      setTemplates(filtered);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [selectedMode, modelKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 监听模板更新事件
  useEffect(() => {
    const handleTemplateUpdate = () => {
      loadTemplates();
    };
    
    window.addEventListener('templateUpdated', handleTemplateUpdate);
    
    return () => {
      window.removeEventListener('templateUpdated', handleTemplateUpdate);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeId) return;
    if (!templates.find((tpl) => tpl.id === activeId)) {
      setActiveId(null);
    }
  }, [templates, activeId]);

  // 仅按宽高比区分预置图（需求确认不区分分辨率）
  const keyFor = (tpl: PromptTemplate) => {
    const ratioKey = currentRatioId || tpl.ratio || '';
    return `${ratioKey}|`;
  };

  const resolveDefaultImage = (tpl: PromptTemplate): string | null => {
    const k = keyFor(tpl);
    const raw = tpl.defaultImages?.[k];
    if (!raw) return null;
    if (typeof raw === 'string') return raw;
    return raw.url || raw.signedUrl || null;
  };

  const handleSelect = async (tpl: PromptTemplate, display: string, english: string) => {
    const usePro = modelKey === 'banana2';
    let defaultUrl: string | null = null;
    const key = keyFor(tpl);

    if (usePro) {
      defaultUrl = resolveDefaultImage(tpl);
      if (!defaultUrl) {
        try {
          const resp = await templateAPI.getDefaultImage(tpl.id, { ratio: currentRatioId, resolution: undefined });
          defaultUrl = resp.data?.url || null;
        } catch (e) {
          // ignore
        }
      }
    }

    onSelectTemplate({
      display,
      english,
      id: tpl.id,
      name: tpl.name,
      nameZh: tpl.nameZh,
      nameEn: tpl.nameEn,
      content: tpl.content,
      contentZh: tpl.contentZh,
      contentEn: tpl.contentEn,
      emoji: tpl.emoji,
      category: tpl.category,
      type: tpl.type,
      ratio: tpl.ratio,
      resolution: tpl.resolution,
      defaultImageUrl: defaultUrl || undefined,
      defaultImageKey: defaultUrl ? key : undefined,
    });
  };

  const renderLoading = () => (
    <div className={compact ? '' : 'mt-1.5 space-y-1.5'}>
      <div className="flex flex-col gap-[0.35rem]">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            className="h-10 w-full animate-pulse rounded-lg border border-[rgba(var(--text-primary-rgb),0.05)] bg-transparent dark:border-[rgba(148,163,184,0.12)]"
          />
        ))}
      </div>
    </div>
  );

  if (loading) {
    return renderLoading();
  }

  const limit = Number.isFinite(maxItems) ? maxItems : undefined;
  const listItems = limit === undefined ? templates : templates.slice(0, limit);
  const placeholders = limit === undefined ? 0 : Math.max(0, limit - listItems.length);

  const renderListCard = (template: PromptTemplate) => {
    const title =
      (isZh ? template.nameZh : template.nameEn) ||
      template.name ||
      placeholderLabel;
    const rawDescSource = (isZh ? template.contentZh : template.contentEn) || template.content || template.contentZh || '';
    const rawDesc = rawDescSource.replace(/\s+/g, ' ').trim();
    const displayValue = isZh
      ? template.contentZh || template.content || template.contentEn || ''
      : template.contentEn || template.content || template.contentZh || '';
    const englishValue = template.contentEn || template.content || template.contentZh || '';
    const isActive = activeId === template.id;
    const baseClasses = [
      'group relative w-full overflow-hidden rounded-md px-2.5 py-2 text-left transition-all duration-150',
      'grid grid-cols-[auto,1fr] gap-2 items-center',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/45 focus-visible:ring-offset-1',
      'bg-transparent text-[rgba(var(--text-primary-rgb),0.78)] hover:text-[var(--text-primary)]',
    ].join(' ');

    const resolvedEmoji = resolveTemplateEmoji(template);
    const iconClasses = [
      'flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none transition-all duration-200 border border-transparent',
      isActive
        ? 'border-[rgba(59,130,246,0.45)] text-[rgba(191,219,254,0.95)] bg-[rgba(59,130,246,0.18)]'
        : 'border-[rgba(var(--text-primary-rgb),0.16)] text-[rgba(var(--text-primary-rgb),0.65)] group-hover:text-[var(--text-primary)] group-hover:border-[rgba(37,99,235,0.35)]',
    ].join(' ');

    return (
      <button
        key={template.id}
        type="button"
        className={baseClasses}
        onClick={() => {
          setActiveId(template.id);
          handleSelect(template, displayValue, englishValue);
        }}
        aria-label={`${ariaApplyPrefix}${title}`}
        title={rawDesc || title}
      >
        <span className={iconClasses}>
          {resolvedEmoji || '·'}
        </span>
        <span className="flex min-w-0 flex-col text-left">
          <span className={`truncate text-sm font-semibold transition-colors duration-150 ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}>
            {title}
          </span>
        </span>
      </button>
    );
  };

  const renderPlaceholderCard = (idx: number) => (
    <div
      key={`placeholder-${idx}`}
      className="w-full rounded-lg border border-dashed border-[var(--border-soft)] bg-[rgba(var(--text-primary-rgb),0.05)] dark:bg-transparent px-2.75 py-2 text-left"
    >
      <div className="flex items-center gap-2 opacity-60">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-white/20 text-[13px] text-[rgba(var(--text-primary-rgb),0.45)]">
          …
        </span>
        <div className="flex-1">
          <div className="h-2 w-1/2 rounded bg-[rgba(var(--text-primary-rgb),0.12)]" />
        </div>
      </div>
    </div>
  );

  if (variant !== 'list') {
    const containerClass = stacked ? 'flex flex-col gap-1.5' : 'flex flex-wrap items-center gap-1.5';
    return (
      <div className={compact ? '' : 'mt-1.5 space-y-1.5'}>
        <div className={containerClass}>
          {listItems.map((template) => {
            const resolvedTitle =
              (isZh ? template.nameZh : template.nameEn) ||
              template.name ||
              placeholderLabel;
            const displayValue = isZh
              ? template.contentZh || template.content || template.contentEn || ''
              : template.contentEn || template.content || template.contentZh || '';
            const englishValue = template.contentEn || template.content || template.contentZh || '';
            const tooltip = ((isZh ? template.contentZh : template.contentEn) || template.content || template.contentZh || '').replace(/\s+/g, ' ').trim() || resolvedTitle;
            const resolvedEmoji = resolveTemplateEmoji(template);
            const isActiveChip = activeId === template.id;

            return (
              <button
                key={template.id}
                onClick={() => {
                  setActiveId(template.id);
                  handleSelect(template, displayValue, englishValue);
                }}
                className={[
                  'px-2 py-1 text-xs rounded-md transition-colors border border-transparent shadow-sm',
                  stacked ? 'w-full text-left' : '',
                  isActiveChip ? 'border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.16)] text-[rgba(37,99,235,0.95)] hover:bg-[rgba(59,130,246,0.24)] dark:bg-[rgba(59,130,246,0.28)] dark:text-[rgba(191,219,254,0.95)] dark:border-[rgba(147,197,253,0.55)] dark:hover:bg-[rgba(59,130,246,0.38)]' : 'bg-[rgba(241,245,249,0.9)] text-[rgba(30,41,59,0.78)] hover:bg-[rgba(226,232,240,0.95)] hover:text-[rgba(30,41,59,0.95)] dark:bg-[rgba(15,23,42,0.32)] dark:text-[rgba(226,232,240,0.82)] dark:hover:bg-[rgba(30,41,59,0.45)]',
                ].join(' ').trim()}
                title={tooltip}
                aria-label={`${ariaApplyPrefix}${resolvedTitle}`}
              >
                {resolvedEmoji ? <span className="mr-1 align-middle">{resolvedEmoji}</span> : null}
                <span className="align-middle">{resolvedTitle}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? '' : 'mt-2 space-y-2'}>
      <div className="flex flex-col gap-1.5">
        {listItems.map(renderListCard)}
        {Array.from({ length: placeholders }).map((_, idx) => renderPlaceholderCard(idx))}
      </div>
    </div>
  );
};
