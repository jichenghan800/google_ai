import React, { useEffect, useState } from 'react';
import { templateAPI } from '../services/api.ts';

interface SystemPromptModalProps {
  show: boolean;
  onClose: () => void;
  onSave: (prompts: { generation: string; editing: string; analysis: string }) => void;
}

const DEFAULT_ANALYSIS_PROMPT = `Role and Goal:
You are an expert prompt engineer. Your task is to analyze user-provided image(s) and a corresponding editing instruction. Based on this analysis, you will generate a new, detailed, and optimized prompt for the 'gemini-2.5-flash-image-preview' model. Your output MUST be ONLY the generated prompt text, with no additional explanations.

Core Instructions:

**1. For Single Image Editing:**
- Frame the task as a direct edit on the provided image.
- Start with phrases like "Using the provided image..." or "On the provided image...".
- Example for changing a part: "Using the provided image of the living room, change ONLY the blue sofa to be a vintage, brown leather chesterfield sofa. Keep the rest of the room, including the pillows and lighting, unchanged."

**2. For Multi-Image Editing (IMPORTANT):**
- First, identify the **main/target image** (the one being edited) and the **source/reference image** (the one providing the element/style).
- **NEVER** start the prompt with "Create a new composite image" unless the goal is to merge two scenes into a completely new one (e.g., putting a cat on a beach).
- **For Replacement/Swapping (like the user's case):** Frame the task as an **in-place edit** on the target image.
  - **Correct Example Structure:** "Using the second image (the woman), replace the existing clothes with the [detailed description of clothes] from the first image. The new clothing must be realistically adapted to her body, perfectly matching her posture and body contours. It is crucial to preserve the entire background, the woman's face, hair, and body from the second image. The lighting and shadows on the new clothes must seamlessly integrate with the lighting conditions of the second image."

General Requirements:
- Be specific and descriptive. Analyze the image(s) to add details about lighting, texture, and perspective to make the edit blend naturally.
- When modifying parts, explicitly state what should be kept unchanged to ensure high-fidelity edits. This is critical.
- Always respond in Chinese (中文) to match the user interface language.`;

const DEFAULT_GENERATION_PROMPT = `你是一位专业的AI图像生成提示词优化专家，专门为Gemini 2.5 Flash Image Preview优化文生图提示词。

## 核心原则
**描述场景，而不是罗列关键词**。模型的核心优势是深度语言理解，叙述性的描述段落几乎总能产生比零散关键词更好、更连贯的图像。

## 优化模板结构
"一个[风格] [拍摄类型] 展现[主体]，[动作/表情]，置身于[环境]中。场景由[光照描述]照明，营造出[情绪]氛围。使用[相机/镜头细节]拍摄，强调[关键纹理和细节]。图像应为[宽高比]格式。"

## 优化要求
1. 将任何关键词列表转换为连贯的叙事描述
2. 保持用户原始意图的同时增加上下文丰富性
3. 使用专业摄影和艺术术语
4. 应用宽高比特定的构图指导
5. 通过光照和情绪描述创造大气深度  
6. 包含技术相机规格以获得逼真效果
7. 强调纹理、细节和视觉叙事元素
8. 用中文输出优化后的提示词

**宽高比信息：** {{ASPECT_RATIO}}
**用户输入：** {{USER_INPUT}}

重要：直接输出纯净的优化提示词内容，不要添加"优化后的提示词："、"调整说明："等任何标题、前缀、后缀或解释说明。`;

const DEFAULT_EDITING_TEMPLATES = [
  { name: '添加元素', prompt: '在图片中添加[具体元素]，保持原有风格和光线一致' },
  { name: '移除元素', prompt: '从图片中移除[具体元素]，自然填补背景' },
  { name: '改变颜色', prompt: '将图片中的[元素]颜色改为[新颜色]' },
  { name: '调整光线', prompt: '调整图片光线为[光线类型]，如温暖/冷色调/自然光' },
  { name: '改变风格', prompt: '将图片转换为[艺术风格]，如油画/水彩/素描风格' },
  { name: '背景替换', prompt: '将背景替换为[新背景描述]，保持主体不变' },
  { name: '季节变换', prompt: '将场景改为[季节]，相应调整环境和氛围' },
  { name: '时间变化', prompt: '将场景时间改为[时间]，如黄昏/夜晚/清晨' }
];

export const SystemPromptModal: React.FC<SystemPromptModalProps> = ({ show, onClose, onSave }) => {
  const [activeMode, setActiveMode] = useState<'generate' | 'analysis' | 'templates'>('generate');
  const [customGenerationPrompt, setCustomGenerationPrompt] = useState(DEFAULT_GENERATION_PROMPT);
  const [customEditingPrompt, setCustomEditingPrompt] = useState('');
  const [customAnalysisPrompt, setCustomAnalysisPrompt] = useState(DEFAULT_ANALYSIS_PROMPT);
  const [editingTemplates, setEditingTemplates] = useState<any[]>(DEFAULT_EDITING_TEMPLATES);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // 加载后端模板（仅编辑类）
  useEffect(() => {
    const load = async () => {
      if (!show) return;
      try {
        setLoadingTemplates(true);
        const resp = await templateAPI.getTemplates('edit');
        if (resp && Array.isArray(resp.data)) {
          setEditingTemplates(resp.data);
        }
      } catch (e) {
        console.error('加载模板失败:', e);
      } finally {
        setLoadingTemplates(false);
      }
    };
    load();
  }, [show]);

  if (!show) return null;

  const handleCopy = () => {
    let content = '';
    if (activeMode === 'analysis') {
      content = customAnalysisPrompt;
    } else if (activeMode === 'templates') {
      content = editingTemplates.map((t: any) => `${t.name}: ${t.content || t.prompt}`).join('\n');
    } else {
      content = customGenerationPrompt;
    }
    navigator.clipboard.writeText(content).then(() => {
      alert('内容已复制到剪贴板');
    });
  };

  // 模板操作
  const addTemplate = async () => {
    try {
      const resp = await templateAPI.addTemplate('新模板', '输入提示词...', 'edit');
      if (resp && resp.data) {
        setEditingTemplates(prev => [...prev, resp.data]);
      }
    } catch (e) {
      console.error('添加模板失败:', e);
    }
  };

  const removeTemplate = async (index: number) => {
    const tpl = editingTemplates[index];
    if (!tpl?.id) {
      setEditingTemplates(prev => prev.filter((_, i) => i !== index));
      return;
    }
    try {
      await templateAPI.deleteTemplate(tpl.id);
      setEditingTemplates(prev => prev.filter((_, i) => i !== index));
    } catch (e) {
      console.error('删除模板失败:', e);
    }
  };

  const handleTemplateChange = (index: number, field: 'name' | 'prompt', value: string) => {
    setEditingTemplates(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field === 'prompt' ? 'content' : 'name']: value };
      return next;
    });
  };

  const saveAllTemplates = async () => {
    try {
      await Promise.all(editingTemplates.map(t => (
        t.id ? templateAPI.updateTemplate(t.id, t.name, t.content) : Promise.resolve(null)
      )));
    } catch (e) {
      console.error('保存模板失败:', e);
    }
  };

  // 顺序调整（上移/下移）
  const moveTemplate = (index: number, direction: -1 | 1) => {
    setEditingTemplates(prev => {
      const next = [...prev];
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= next.length) return prev;
      [next[index], next[newIndex]] = [next[newIndex], next[index]];
      return next;
    });
  };

  const saveOrder = async () => {
    try {
      const ids = editingTemplates.map(t => t.id).filter(Boolean);
      if (ids.length) {
        await templateAPI.reorderTemplates(ids, 'edit');
      }
    } catch (e) {
      console.error('保存排序失败:', e);
    }
  };

  const handleReset = () => {
    if (activeMode === 'analysis') {
      setCustomAnalysisPrompt(DEFAULT_ANALYSIS_PROMPT);
    } else if (activeMode === 'templates') {
      setEditingTemplates(DEFAULT_EDITING_TEMPLATES);
    } else {
      setCustomGenerationPrompt(DEFAULT_GENERATION_PROMPT);
    }
  };

  // 删除重复的旧版本地操作函数（已由上方带持久化的版本取代）

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
          {activeMode === 'templates' ? (
            <div>
              <div className="mb-3">
                <h4 className="text-md font-medium text-gray-700 mb-2">图片编辑快捷模板</h4>
                <p className="text-sm text-gray-600 mb-3">
                  预设的常用编辑指令模板，可以快速应用到图片编辑任务中
                </p>
              </div>
              
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {loadingTemplates ? (
                  <div className="text-sm text-gray-400 px-2">加载中...</div>
                ) : editingTemplates.map((template, index) => (
                  <div key={template.id || index} className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg">
                    <div className="flex flex-col space-y-1">
                      <button className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded" onClick={() => moveTemplate(index, -1)} title="上移">↑</button>
                      <button className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded" onClick={() => moveTemplate(index, 1)} title="下移">↓</button>
                    </div>
                    <input
                      type="text"
                      value={template.name}
                      onChange={(e) => handleTemplateChange(index, 'name', e.target.value)}
                      className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                      placeholder="模板名称"
                    />
                    <input
                      type="text"
                      value={template.content || template.prompt}
                      onChange={(e) => handleTemplateChange(index, 'prompt', e.target.value)}
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                      placeholder="提示词模板"
                    />
                    <button
                      onClick={() => removeTemplate(index)}
                      className="px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                      title="删除模板"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              
              <button
                onClick={addTemplate}
                className="mt-3 px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
              >
                + 添加模板
              </button>
              <div className="mt-3 flex items-center space-x-2">
                <button onClick={saveAllTemplates} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded">保存模板</button>
                <button onClick={saveOrder} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded">保存顺序</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-3">
                <h4 className="text-md font-medium text-gray-700 mb-2">
                  {activeMode === 'analysis' ? '图片编辑系统提示词' : '图片生成系统提示词'}
                </h4>
                <p className="text-sm text-gray-600 mb-3">
                  {activeMode === 'analysis'
                    ? '用于指导AI分析图片并生成针对gemini-2.5-flash-image-preview的优化编辑指令'
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
          )}
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
