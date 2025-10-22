import React, { useEffect, useMemo, useState } from 'react';
import { templateAPI } from '../services/api.ts';
import { resolveTemplateEmoji } from '../utils/templateEmoji.ts';
import { useLocale } from '../contexts/LocaleContext.tsx';

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  category: 'generate' | 'edit';
  // optional bilingual fields
  nameZh?: string;
  nameEn?: string;
  contentZh?: string;
  contentEn?: string;
  emoji?: string;
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
    category?: 'generate' | 'edit';
  }) => void;
  onManageTemplates: () => void;
  compact?: boolean; // 紧凑模式：用于与标题同一行展示
  stacked?: boolean; // 纵向列表：每条单行显示、撑满容器宽度
  variant?: 'chips' | 'list'; // 展示风格：默认胶囊按钮，可选列表样式
  dense?: boolean; // 紧凑密度：减少间距与字号
  framed?: boolean; // 列表项使用矩形框风格（与画布选择卡片风格一致）
  maxItems?: number; // 限制展示数量；传入Infinity或省略表示展示全部
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
  maxItems = 6
}) => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { lang } = useLocale();
  const isZh = lang === 'zh';
  const ariaApplyPrefix = useMemo(() => (isZh ? '应用模板：' : 'Apply template: '), [isZh]);
  const placeholderLabel = useMemo(() => (isZh ? '常用场景' : 'Quick Scenario'), [isZh]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const category = selectedMode === 'edit' ? 'edit' : 'generate';
      const response = await templateAPI.getTemplates(category);
      setTemplates(response.data || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [selectedMode]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const renderLoading = () => (
    <div className={compact ? '' : 'mt-1.5 space-y-1.5'}>
      <div className="flex flex-col gap-[0.35rem]">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            className="h-10 w-full animate-pulse rounded-lg border border-white/16 bg-white/55"
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
      'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
    ].join(' ');

    const resolvedEmoji = resolveTemplateEmoji(template);
    const iconClasses = [
      'flex h-7 w-7 items-center justify-center rounded-full text-base leading-none transition-all duration-200',
      isActive
        ? 'bg-transparent text-[var(--text-primary)] border border-[rgba(37,99,235,0.45)] shadow-[0_0_12px_-6px_rgba(37,99,235,0.45)]'
        : 'border border-[rgba(var(--text-primary-rgb),0.16)] bg-transparent text-[rgba(var(--text-primary-rgb),0.7)] group-hover:text-[var(--text-primary)] group-hover:border-[rgba(37,99,235,0.35)]',
    ].join(' ');

    return (
      <button
        key={template.id}
        type="button"
        className={baseClasses}
        onClick={() => {
          setActiveId(template.id);
          onSelectTemplate({
            display: displayValue,
            english: englishValue,
            id: template.id,
            name: template.name,
            nameZh: template.nameZh,
            nameEn: template.nameEn,
            content: template.content,
            contentZh: template.contentZh,
            contentEn: template.contentEn,
            emoji: resolvedEmoji,
            category: template.category,
          });
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
      className="w-full rounded-lg border border-dashed border-[var(--border-soft)] bg-[rgba(var(--text-primary-rgb),0.08)] px-2.75 py-2 text-left"
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
                  onSelectTemplate({
                    display: displayValue,
                    english: englishValue,
                    id: template.id,
                    name: template.name,
                    nameZh: template.nameZh,
                    nameEn: template.nameEn,
                    content: template.content,
                    contentZh: template.contentZh,
                    contentEn: template.contentEn,
                    emoji: resolvedEmoji,
                    category: template.category,
                  });
                }}
                className={[
                  'px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors',
                  stacked ? 'w-full text-left' : '',
                  isActiveChip ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : '',
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
