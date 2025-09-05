import React, { useState, useEffect } from 'react';
import { templateAPI } from '../services/api.ts';

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  category: 'generate' | 'edit';
}

interface PromptTemplatesProps {
  onSelectTemplate: (content: string) => void;
  filterCategory?: 'generate' | 'edit' | 'all';
}

export const PromptTemplates: React.FC<PromptTemplatesProps> = ({ 
  onSelectTemplate, 
  filterCategory = 'all' 
}) => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await templateAPI.getTemplates();
      setTemplates(response.data || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateTemplate = async (id: string, name: string, content: string) => {
    try {
      await templateAPI.updateTemplate(id, name, content);
      await loadTemplates();
      // 通知其他组件更新
      window.dispatchEvent(new Event('templateUpdated'));
    } catch (error) {
      console.error('Failed to update template:', error);
    }
  };

  // 根据过滤条件显示模板
  const filteredTemplates = filterCategory === 'all' 
    ? templates 
    : templates.filter(t => t.category === filterCategory);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-medium text-gray-800">提示词模板</h4>
      </div>

      {/* 模板列表 */}
      {loading ? (
        <div className="text-center py-4 text-gray-500">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
          {filteredTemplates.map(template => (
            <TemplateCard 
              key={template.id} 
              template={template} 
              onUpdate={updateTemplate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const TemplateCard: React.FC<{
  template: PromptTemplate;
  onUpdate: (id: string, name: string, content: string) => void;
}> = ({ template, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const [content, setContent] = useState(template.content);

  const handleSave = () => {
    onUpdate(template.id, name, content);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(template.name);
    setContent(template.content);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="border rounded-lg p-3 bg-gray-50">
        <div className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm h-20 resize-none"
          />
          <div className="flex space-x-2">
            <button
              onClick={handleSave}
              className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
            >
              保存
            </button>
            <button
              onClick={handleCancel}
              className="bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-400"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-3 hover:bg-gray-50">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center space-x-2">
          <span className="font-medium text-sm">{template.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${
            template.category === 'generate' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {template.category === 'generate' ? '生成' : '编辑'}
          </span>
        </div>
        <button
          onClick={() => setIsEditing(true)}
          className="text-gray-400 hover:text-gray-600 text-xs"
        >
          编辑
        </button>
      </div>
      <p className="text-xs text-gray-600 mb-2 line-clamp-2">{template.content}</p>
    </div>
  );
};
