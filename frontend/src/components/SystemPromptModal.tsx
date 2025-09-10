import React, { useState } from 'react';

interface SystemPromptModalProps {
  show: boolean;
  onClose: () => void;
  onSave: (prompts: { generation: string; editing: string; analysis: string }) => void;
}

const DEFAULT_ANALYSIS_PROMPT = `Role and Goal:
You are an expert prompt engineer. Your task is to analyze user-provided image(s) and a corresponding editing instruction. Based on this analysis, you will generate a new, detailed, and optimized prompt for the 'gemini-2.5-flash-image-preview' model. Your output MUST be ONLY the generated prompt text, with no additional explanations.

Core Instructions:
- Start your prompt by referencing the provided image, like "Using the provided image of [subject]...".
- If the user wants to ADD or REMOVE an element, generate a prompt like: "Using the provided image of [subject], please [add/remove] [detailed description of element]. Ensure the change seamlessly integrates with the original image by matching the [lighting, perspective, style]."
- Always respond in Chinese (中文) to match the user interface language.`;

const DEFAULT_GENERATION_PROMPT = `你是一位专业的AI图像生成提示词优化专家，专门为Gemini 2.5 Flash Image Preview优化文生图提示词。

## 核心原则
**描述场景，而不是罗列关键词**。模型的核心优势是深度语言理解，叙述性的描述段落几乎总能产生比零散关键词更好、更连贯的图像。

## 优化要求
1. 将任何关键词列表转换为连贯的叙事描述
2. 保持用户原始意图的同时增加上下文丰富性
3. 使用专业摄影和艺术术语
4. 用中文输出优化后的提示词

请将输入转化为专业的、叙事驱动的提示词。只返回优化后的提示词，不要解释。`;

export const SystemPromptModal: React.FC<SystemPromptModalProps> = ({ show, onClose, onSave }) => {
  const [activeMode, setActiveMode] = useState<'generate' | 'analysis' | 'templates'>('generate');
  const [customGenerationPrompt, setCustomGenerationPrompt] = useState(DEFAULT_GENERATION_PROMPT);
  const [customEditingPrompt, setCustomEditingPrompt] = useState('');
  const [customAnalysisPrompt, setCustomAnalysisPrompt] = useState(DEFAULT_ANALYSIS_PROMPT);

  if (!show) return null;

  const handleCopy = () => {
    const content = activeMode === 'analysis' ? customAnalysisPrompt : customGenerationPrompt;
    navigator.clipboard.writeText(content).then(() => {
      alert('系统提示词已复制到剪贴板');
    });
  };

  const handleReset = () => {
    if (activeMode === 'analysis') {
      setCustomAnalysisPrompt(DEFAULT_ANALYSIS_PROMPT);
    } else {
      setCustomGenerationPrompt(DEFAULT_GENERATION_PROMPT);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-8">
      <div className="bg-white rounded-lg p-6 max-w-6xl w-full mx-4 max-h-[85vh] overflow-y-auto">
        {/* 标题栏 */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">自定义 System Prompt</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* 标签页切换 */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeMode === 'generate' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveMode('generate')}
              >
                🎨 图片生成System Prompt
              </button>
              <button
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeMode === 'analysis' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveMode('analysis')}
              >
                🧠 图片编辑System Prompt
              </button>
              <button
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeMode === 'templates' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveMode('templates')}
              >
                📝 图片编辑快捷Prompt
              </button>
            </nav>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="mb-4">
          <div className="mb-3">
            <h4 className="text-md font-medium text-gray-700 mb-2">
              {activeMode === 'analysis' ? '图片编辑系统提示词' : '图片生成系统提示词'}
            </h4>
            <p className="text-sm text-gray-600 mb-3">
              {activeMode === 'analysis'
                ? '用于指导AI直接分析图片内容并生成针对gemini-2.5-flash-image-preview的优化编辑指令'
                : '用于指导AI如何优化文生图提示词，将简单描述转化为专业的视觉叙事描述'
              }
            </p>
          </div>
          
          <textarea
            value={activeMode === 'analysis' ? customAnalysisPrompt : customGenerationPrompt}
            onChange={(e) => {
              if (activeMode === 'analysis') {
                setCustomAnalysisPrompt(e.target.value);
              } else {
                setCustomGenerationPrompt(e.target.value);
              }
            }}
            placeholder={`输入${activeMode === 'analysis' ? '图片编辑' : '图片生成'}系统提示词...`}
            className="w-full h-96 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
          />
          
          <div className="mt-2 text-xs text-gray-500">
            字符数：{activeMode === 'analysis' ? customAnalysisPrompt.length : customGenerationPrompt.length}
          </div>
        </div>
        
        {/* 操作按钮 */}
        <div className="flex justify-between items-center">
          <div className="flex space-x-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded"
            >
              重置为默认
            </button>
            
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded"
            >
              复制内容
            </button>
          </div>
          
          <div className="flex space-x-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded">
              取消
            </button>
            <button
              onClick={() => {
                onSave({
                  generation: customGenerationPrompt,
                  editing: customEditingPrompt,
                  analysis: customAnalysisPrompt
                });
              }}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
            >
              保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
