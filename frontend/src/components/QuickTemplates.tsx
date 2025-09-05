import React, { useState, useEffect } from 'react';

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
}

export const QuickTemplates: React.FC<QuickTemplatesProps> = ({ 
  selectedMode, 
  onSelectTemplate, 
  onManageTemplates 
}) => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);

  // 默认模板
  const defaultTemplates: PromptTemplate[] = [
    {
      id: '1',
      name: '人物肖像',
      content: '一张专业的人物肖像照片，柔和的自然光照明，背景虚化',
      category: 'generate'
    },
    {
      id: '2', 
      name: '风景摄影',
      content: '壮丽的自然风景，黄金时刻的温暖光线，广角镜头拍摄',
      category: 'generate'
    },
    {
      id: '3',
      name: '产品摄影',
      content: '专业的产品摄影，干净的白色背景，均匀的柔光照明',
      category: 'generate'
    },
    {
      id: '4',
      name: '添加元素',
      content: '在图片中添加[描述元素]，保持原有的光照和风格一致',
      category: 'edit'
    },
    {
      id: '5',
      name: '移除对象',
      content: '移除图片中的[对象名称]，自然填补背景',
      category: 'edit'
    },
    {
      id: '6',
      name: '风格转换',
      content: '将图片转换为[风格名称]风格，保持主体内容不变',
      category: 'edit'
    }
  ];

  const loadTemplates = () => {
    const saved = localStorage.getItem('promptTemplates');
    if (saved) {
      setTemplates(JSON.parse(saved));
    } else {
      setTemplates(defaultTemplates);
      localStorage.setItem('promptTemplates', JSON.stringify(defaultTemplates));
    }
  };

  useEffect(() => {
    loadTemplates();
    
    // 监听localStorage变化
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'promptTemplates') {
        loadTemplates();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // 监听自定义事件（同页面内的更新）
    const handleTemplateUpdate = () => {
      loadTemplates();
    };
    
    window.addEventListener('templateUpdated', handleTemplateUpdate);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('templateUpdated', handleTemplateUpdate);
    };
  }, []);

  // 根据当前模式过滤模板
  const filteredTemplates = templates.filter(template => 
    selectedMode === 'edit' ? template.category === 'edit' : template.category === 'generate'
  );

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center">
        <span className="text-sm text-gray-600">快捷模板：</span>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {filteredTemplates.slice(0, 6).map(template => (
          <button
            key={template.id}
            onClick={() => onSelectTemplate(template.content)}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            title={template.content}
          >
            {template.name}
          </button>
        ))}
      </div>
    </div>
  );
};
