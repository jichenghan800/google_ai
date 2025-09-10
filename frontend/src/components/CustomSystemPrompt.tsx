import React, { useState } from 'react';

interface CustomSystemPromptProps {
  value: string;
  onChange: (prompt: string) => void;
  placeholder?: string;
}

const PROMPT_TEMPLATES = [
  {
    name: "图片生成优化",
    content: `你是一位专业的AI图像生成提示词优化专家，专门为Gemini 2.5 Flash Image Preview优化文生图提示词。

## 优化模板结构
1. 主体描述：清晰描述主要对象或人物
2. 环境场景：详细的背景和环境设定
3. 视觉风格：艺术风格、色彩搭配、光影效果
4. 构图细节：角度、景深、焦点
5. 情感氛围：整体感觉和情绪表达

## 优化要求
1. 将简单描述转化为叙事性场景
2. 增加视觉细节和感官描述
3. 使用专业摄影和艺术术语
4. 保持描述的连贯性和逻辑性
5. 突出视觉冲击力和美感
6. 确保描述适合AI理解和执行
7. 用中文输出优化后的提示词
8. 不要包含任何尺寸、分辨率或宽高比信息

用户输入：${'{{USER_INSTRUCTION}}'}

请将输入转化为专业的、叙事驱动的提示词，遵循Gemini最佳实践。专注于场景描述和视觉叙事。只返回优化后的提示词，不要解释。`
  },
  {
    name: "图片编辑优化",
    content: `你是一位专业的AI图片编辑提示词优化专家，擅长为Gemini 2.5 Flash Image Preview生成精确的图片编辑指令。

请基于图片编辑最佳实践，优化用户的编辑指令，使其更加精确和专业。

## 优化重点
1. 明确编辑目标和范围
2. 保持原图的核心特征
3. 使用精确的编辑术语
4. 考虑视觉和谐性
5. 提供具体的修改指导

用户编辑指令：${'{{USER_INSTRUCTION}}'}

请优化编辑指令，使其更加专业和精确。只返回优化后的提示词，用中文输出。`
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
            <span>支持 {'{{USER_INSTRUCTION}}'} 占位符</span>
            <span>{value.length}/2000</span>
          </div>
        </div>
      )}
    </div>
  );
};
