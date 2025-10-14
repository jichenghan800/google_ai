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

  if (loading) {
    return (
      <div className={compact ? '' : 'mt-3 space-y-2'}>
        <div className="text-xs text-gray-400">加载中...</div>
      </div>
    );
  }

  // 容器：list 风格使用纵向列表；否则使用横向换行
  const containerClass = variant === 'list'
    ? 'flex flex-col gap-1'
    : (stacked ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-2');

  return (
    <div className={compact ? '' : 'mt-3 space-y-2'}>
      <div className={containerClass}>
        {templates.slice(0, 6).map(template => (
          <button
            key={template.id}
            onClick={() => {
              const display = (template.contentZh || template.content) || '';
              const english = (template.contentEn || template.content) || '';
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
            className={(variant === 'list')
              ? [
                  'w-full text-left flex items-center justify-between rounded transition-colors',
                  'px-3 py-2 text-sm',
                  framed
                    ? 'border-2 bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                    : 'hover:bg-gray-50 text-gray-700'
                ].join(' ')
              : [
                  'px-2.5 py-1 text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors',
                  stacked ? 'w-full text-left' : ''
                ].join(' ').trim()
            }
            title={(template.contentZh || template.content) || ''}
          >
            {variant === 'list' ? (
              <span className="inline-flex items-center gap-2">
                <span className="opacity-80 text-xl leading-none">
                  {template.emoji || '•'}
                </span>
                <span className="truncate">{template.nameZh || template.name}</span>
              </span>
            ) : (
              (template.nameZh || template.name)
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
