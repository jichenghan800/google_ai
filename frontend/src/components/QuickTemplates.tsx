import React, { useState, useEffect } from 'react';
import { templateAPI } from '../services/api.ts';

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  category: 'generate' | 'edit';
}

interface QuickTemplatesProps {
  selectedMode: string;
  onSelectTemplate: (content: string) => void;
  onManageTemplates: () => void;
  compact?: boolean; // 紧凑模式：用于与标题同一行展示
}

export const QuickTemplates: React.FC<QuickTemplatesProps> = ({ 
  selectedMode, 
  onSelectTemplate, 
  onManageTemplates,
  compact = false
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

  return (
    <div className={compact ? '' : 'mt-3 space-y-2'}>
      <div className="flex flex-wrap items-center gap-2">
        {templates.slice(0, 6).map(template => (
          <button
            key={template.id}
            onClick={() => onSelectTemplate(template.content)}
            className="px-2.5 py-1 text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            title={template.content}
          >
            {template.name}
          </button>
        ))}
      </div>
    </div>
  );
};
