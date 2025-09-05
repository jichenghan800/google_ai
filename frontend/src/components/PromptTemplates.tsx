import React, { useState, useEffect } from 'react';

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
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

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
      name: '添加元素',
      content: '在图片中添加[描述元素]，保持原有的光照和风格一致',
      category: 'edit'
    },
    {
      id: '4',
      name: '移除对象',
      content: '移除图片中的[对象名称]，自然填补背景',
      category: 'edit'
    }
  ];

  useEffect(() => {
    const saved = localStorage.getItem('promptTemplates');
    if (saved) {
      setTemplates(JSON.parse(saved));
    } else {
      setTemplates(defaultTemplates);
    }
  }, []);

  const saveTemplates = (newTemplates: PromptTemplate[]) => {
    setTemplates(newTemplates);
    localStorage.setItem('promptTemplates', JSON.stringify(newTemplates));
    // 触发自定义事件通知其他组件更新
    window.dispatchEvent(new Event('templateUpdated'));
  };

  const addTemplate = (name: string, content: string, category: 'generate' | 'edit') => {
    const newTemplate: PromptTemplate = {
      id: Date.now().toString(),
      name,
      content,
      category
    };
    saveTemplates([...templates, newTemplate]);
    setShowAddForm(false);
  };

  const updateTemplate = (id: string, name: string, content: string) => {
    const updated = templates.map(t => 
      t.id === id ? { ...t, name, content } : t
    );
    saveTemplates(updated);
    setEditingTemplate(null);
  };

  const deleteTemplate = (id: string) => {
    saveTemplates(templates.filter(t => t.id !== id));
  };

  // 根据过滤条件显示模板
  const filteredTemplates = filterCategory === 'all' 
    ? templates 
    : templates.filter(t => t.category === filterCategory);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-medium text-gray-800">提示词模板</h4>
        <button
          onClick={() => setShowAddForm(true)}
          className="text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
        >
          + 添加模板
        </button>
      </div>

      {/* 模板列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
        {filteredTemplates.map(template => (
          <div key={template.id} className="border rounded-lg p-3 hover:bg-gray-50">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-sm">{template.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  template.category === 'generate' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {template.category === 'generate' ? '生成' : '编辑'}
                </span>
              </div>
              <div className="flex space-x-1">
                <button
                  onClick={() => setEditingTemplate(template)}
                  className="text-gray-400 hover:text-gray-600 text-xs"
                >
                  编辑
                </button>
                <button
                  onClick={() => deleteTemplate(template.id)}
                  className="text-red-400 hover:text-red-600 text-xs"
                >
                  删除
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-600 mb-2 line-clamp-2">{template.content}</p>
            <button
              onClick={() => onSelectTemplate(template.content)}
              className="w-full text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 py-1 rounded"
            >
              使用模板
            </button>
          </div>
        ))}
      </div>

      {/* 添加模板表单 */}
      {showAddForm && (
        <AddTemplateForm
          onAdd={addTemplate}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* 编辑模板表单 */}
      {editingTemplate && (
        <EditTemplateForm
          template={editingTemplate}
          onUpdate={updateTemplate}
          onCancel={() => setEditingTemplate(null)}
        />
      )}
    </div>
  );
};

const AddTemplateForm: React.FC<{
  onAdd: (name: string, content: string, category: 'generate' | 'edit') => void;
  onCancel: () => void;
}> = ({ onAdd, onCancel }) => {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<'generate' | 'edit'>('generate');

  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      <h5 className="font-medium mb-3">添加新模板</h5>
      <div className="space-y-3">
        <input
          type="text"
          placeholder="模板名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border rounded text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as 'generate' | 'edit')}
          className="w-full px-3 py-2 border rounded text-sm"
        >
          <option value="generate">生成模板</option>
          <option value="edit">编辑模板</option>
        </select>
        <textarea
          placeholder="模板内容"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full px-3 py-2 border rounded text-sm h-20"
        />
        <div className="flex space-x-2">
          <button
            onClick={() => onAdd(name, content, category)}
            disabled={!name.trim() || !content.trim()}
            className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 disabled:opacity-50"
          >
            保存
          </button>
          <button
            onClick={onCancel}
            className="bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-400"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};

const EditTemplateForm: React.FC<{
  template: PromptTemplate;
  onUpdate: (id: string, name: string, content: string) => void;
  onCancel: () => void;
}> = ({ template, onUpdate, onCancel }) => {
  const [name, setName] = useState(template.name);
  const [content, setContent] = useState(template.content);

  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      <h5 className="font-medium mb-3">编辑模板</h5>
      <div className="space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border rounded text-sm"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full px-3 py-2 border rounded text-sm h-20"
        />
        <div className="flex space-x-2">
          <button
            onClick={() => onUpdate(template.id, name, content)}
            className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
          >
            更新
          </button>
          <button
            onClick={onCancel}
            className="bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-400"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};
