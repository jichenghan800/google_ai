import React, { useState, useEffect } from 'react';
import { templateAPI } from '../services/api.ts';

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
    emoji?: string;
    category?: 'generate' | 'edit';
  }) => void;
  onManageTemplates: () => void;
  compact?: boolean; // 紧凑模式：用于与标题同一行展示
  stacked?: boolean; // 纵向列表：每条单行显示、撑满容器宽度
  variant?: 'chips' | 'list'; // 展示风格：默认胶囊按钮，可选列表样式
  dense?: boolean; // 紧凑密度：减少间距与字号
  framed?: boolean; // 列表项使用矩形框风格（与画布选择卡片风格一致）
}

export const QuickTemplates: React.FC<QuickTemplatesProps> = ({ 
  selectedMode, 
  onSelectTemplate, 
  onManageTemplates,
  compact = false,
  stacked = false,
  variant = 'chips',
  dense = false,
  framed = false
}) => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

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
      <div className="flex flex-col gap-1.25">
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

  const listItems = templates.slice(0, 6);
  const placeholders = Math.max(0, 6 - listItems.length);

  const renderListCard = (template: PromptTemplate) => {
    const title = template.nameZh || template.name || '常用场景';
    const rawDesc = (template.contentZh || template.content || '').replace(/\s+/g, ' ').trim();
    const isActive = activeId === template.id;
    const baseClasses = [
      'group relative w-full overflow-hidden rounded-md px-2.5 py-2 text-left transition-all duration-150',
      'grid grid-cols-[auto,1fr] gap-2 items-center',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/45 focus-visible:ring-offset-1',
      isActive
        ? 'bg-white/70 text-slate-900 shadow-sm'
        : 'bg-transparent hover:bg-white/35 hover:text-slate-900 text-slate-100',
    ].join(' ');

    return (
      <button
        key={template.id}
        type="button"
        className={baseClasses}
        onClick={() => {
          const display = (template.contentZh || template.content) || '';
          const english = (template.contentEn || template.content) || '';
          setActiveId(template.id);
          onSelectTemplate({
            display,
            english,
            id: template.id,
            name: template.name,
            nameZh: template.nameZh,
            nameEn: template.nameEn,
            emoji: template.emoji,
            category: template.category
          });
        }}
        aria-label={`应用最佳实践：${title}`}
        title={rawDesc || title}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/12 text-base leading-none text-blue-500/80">
          {template.emoji || '✨'}
        </span>
        <span className="flex min-w-0 flex-col text-left">
          <span className="truncate text-sm font-semibold">
            {title}
          </span>
        </span>
      </button>
    );
  };

  const renderPlaceholderCard = (idx: number) => (
    <div
      key={`placeholder-${idx}`}
      className="w-full rounded-lg border border-dashed border-white/16 bg-white/40 px-2.75 py-2 text-left"
    >
      <div className="flex items-center gap-2 opacity-60">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-sm text-slate-400">
          …
        </span>
        <div className="flex-1">
          <div className="h-2 w-1/2 rounded bg-slate-200/70" />
        </div>
      </div>
    </div>
  );

  if (variant !== 'list') {
    const containerClass = stacked ? 'flex flex-col gap-1.5' : 'flex flex-wrap items-center gap-1.5';
    return (
      <div className={compact ? '' : 'mt-1.5 space-y-1.5'}>
        <div className={containerClass}>
          {listItems.map((template) => (
            <button
              key={template.id}
              onClick={() => {
                const display = (template.contentZh || template.content) || '';
                const english = (template.contentEn || template.content) || '';
                setActiveId(template.id);
                onSelectTemplate({
                  display,
                  english,
                  id: template.id,
                  name: template.name,
                  nameZh: template.nameZh,
                  nameEn: template.nameEn,
                  emoji: template.emoji,
                  category: template.category
                });
              }}
              className={[
                'px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors',
                stacked ? 'w-full text-left' : ''
              ].join(' ').trim()}
              title={(template.contentZh || template.content) || ''}
            >
              {template.nameZh || template.name}
            </button>
          ))}
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
