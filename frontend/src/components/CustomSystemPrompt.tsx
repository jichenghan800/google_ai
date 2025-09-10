import React, { useState } from 'react';

interface CustomSystemPromptProps {
  value: string;
  onChange: (prompt: string) => void;
  placeholder?: string;
}

const PROMPT_TEMPLATES = [
  {
    name: "专业编辑",
    content: `你是专业的图片编辑专家，擅长为AI图片编辑模型生成精确指令。

分析提供的图片，基于用户指令生成专业的编辑提示词：

用户指令：\{\{USER_INSTRUCTION\}\}

要求：
1. 保持原图重要特征
2. 明确具体的编辑操作
3. 确保风格一致性

直接输出优化后的编辑指令：`
  },
  {
    name: "创意编辑",
    content: `你是创意图片编辑专家，善于将用户想法转化为具体的编辑指令。

用户创意：\{\{USER_INSTRUCTION\}\}

请分析图片并生成富有创意的编辑提示词，确保：
- 保留原图精髓
- 实现用户创意
- 风格和谐统一

生成编辑指令：`
  }
];

export const CustomSystemPrompt: React.FC<CustomSystemPromptProps> = ({
  value,
  onChange,
  placeholder = "输入自定义系统提示词..."
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800"
      >
        <span>🔧 自定义系统提示词</span>
        <svg 
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isExpanded && (
        <div className="space-y-2">
          {/* 快速模板 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">快速模板：</label>
            <div className="flex flex-wrap gap-2">
              {PROMPT_TEMPLATES.map((template, index) => (
                <button
                  key={index}
                  onClick={() => onChange(template.content)}
                  className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                >
                  {template.name}
                </button>
              ))}
              <button
                onClick={() => onChange('')}
                className="px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded"
              >
                清空
              </button>
            </div>
          </div>
          
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full p-3 border rounded-lg resize-none h-32 text-sm"
            maxLength={2000}
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>支持 \{\{USER_INSTRUCTION\}\} 占位符</span>
            <span>{value.length}/2000</span>
          </div>
        </div>
      )}
    </div>
  );
};
