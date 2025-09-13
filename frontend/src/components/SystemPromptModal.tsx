import React, { useEffect, useRef, useState } from 'react';
import apiClient, { templateAPI } from '../services/api.ts';
import { MarkdownEditor } from './MarkdownEditor.tsx';

interface SystemPromptModalProps {
  show: boolean;
  onClose: () => void;
  onSave: (prompts: {
    generation: string;
    editing: string;
    analysis: string;
    recognition?: string;
    recognitionScenarios?: string[];
  }) => void;
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
  const [activeMode, setActiveMode] = useState<'generate' | 'analysis' | 'templates' | 'recognition'>('generate');
  const [customGenerationPrompt, setCustomGenerationPrompt] = useState(DEFAULT_GENERATION_PROMPT);
  const [customEditingPrompt, setCustomEditingPrompt] = useState('');
  const [customAnalysisPrompt, setCustomAnalysisPrompt] = useState(DEFAULT_ANALYSIS_PROMPT);
  const [customRecognitionPrompt, setCustomRecognitionPrompt] = useState(`图片识别默认用户提示词
你是一个专业的图像分析助手。你的任务是根据用户提供的图片，进行深入、细致的识别，并以结构化的 Markdown 格式输出分析结果。以下为建议的输出结构，可按需精简：

text
# 图像分析报告

## 1. 综合概述
[此处填写对图片整体内容的叙事性描述,就像在讲一个故事,而不是罗列关键词。例如:“这是一张在光线柔和的工作室里拍摄的特写肖像,捕捉了一位年迈的陶艺家正在审视自己作品的宁静瞬间。”]

## 2. 核心主体
- **主体描述:** [识别图片中最主要的人、物或焦点。例如:一位亚洲面孔的老年男性,面部有深刻的皱纹,表情专注而温暖。]
- **动作/状态:** [描述主体的行为或状态。例如:他正双手捧着一个刚上完釉的茶碗,仔细端详。]
- **关键特征:** [描述主体的服饰、配饰或其他显著特征。例如:身穿朴素的工匠围裙,头发花白。]

## 3. 环境与背景
- **场景位置:** [识别图片所处的环境。例如:一个充满乡村气息的陶艺工作坊。]
- **背景元素:** [列出背景中的关键物品。例如:背景中可以看到陶轮、摆满陶罐的架子以及一扇透入光线的窗户。]
- **前景元素:** [描述前景中的内容(如果有)。例如:前景中没有明显遮挡物。]

## 4. 构图与艺术风格
- **图像类型:** [判断是照片、插画、3D渲染、还是其他类型。例如:彩色照片。]
- **艺术风格:** [描述图片的整体风格。例如:写实主义(Photorealistic)、极简主义(Minimalist)、动漫风格(Anime)、黑色电影风格(Noir)等。]
- **拍摄视角:** [描述拍摄角度。例如:近景特写(Close-up)、广角(Wide shot)、俯视(Top-down view)、45度视角等。]
- **光线与氛围:**
    - **光照描述:** [描述光线来源、强度和特点。例如:光线来自画面左侧的窗户,是柔和的自然光,属于“黄金时刻”(Golden Hour)的光线。]
    - **营造氛围:** [光线和构图共同营造出的感觉。例如:宁静、专注、温暖、神秘、戏剧性等。]
- **色彩方案:** [描述图片的主要色调和色彩搭配。例如:以大地色系为主,包括陶土的棕色、围裙的灰色和阳光的暖黄色,整体色调和谐。]

## 5. 文本与符号 (如果存在)
- **识别文本:** [准确识别并记录图片中出现的所有文字。例如:背景中的招牌上写着“The Daily Grind”。]
- **字体风格:** [描述文本的字体。例如:无衬线粗体字(Bold, sans-serif)。]
- **符号/Logo:** [识别并描述图片中的任何符号、图标或Logo。例如:一个与文字结合的咖啡豆图标。]

## 6. 潜在推断
[基于以上分析,做出合理的推测。例如:这张图片可能用于一篇关于传统手工艺人的访谈文章,或作为一部纪录片的宣传剧照。其专业的光线和构图表明这是一张精心策划的摄影作品,而非随意抓拍。]`);
  const [recognitionScenarios, setRecognitionScenarios] = useState<{ name: string; content: string }[]>([]);

  // 载入已保存的“图片识别默认用户提示词”与“自定义场景”（localStorage）
  useEffect(() => {
    if (!show) return;
    try {
      const savedPrompt = localStorage.getItem('customRecognitionPrompt');
      if (savedPrompt && typeof savedPrompt === 'string') {
        setCustomRecognitionPrompt(savedPrompt);
      }
      const raw = localStorage.getItem('customRecognitionScenarios');
      if (raw) {
        const arr: string[] = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const parsed = arr.map((s) => {
            const [name, ...rest] = String(s).split(':');
            return { name: name?.trim() || '场景', content: rest.join(':').trim() || name?.trim() || '' };
          });
          setRecognitionScenarios(parsed);
        }
      }
    } catch (e) {
      console.warn('加载图片识别默认用户提示词或自定义场景失败:', e);
    }
  }, [show]);
  const [editingTemplates, setEditingTemplates] = useState<any[]>(DEFAULT_EDITING_TEMPLATES);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const originalTemplatesRef = useRef<any[]>([]); // 保存加载时的原始模板，用于对比变化

  // 加载后端模板（仅编辑类）
  useEffect(() => {
    const load = async () => {
      if (!show) return;
      try {
        setLoadingTemplates(true);
        const resp = await templateAPI.getTemplates('edit');
        if (resp && Array.isArray(resp.data)) {
          setEditingTemplates(resp.data);
          originalTemplatesRef.current = resp.data;
        } else {
          originalTemplatesRef.current = editingTemplates;
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
    } else if (activeMode === 'recognition') {
      const scenarioText = recognitionScenarios.map(s => `- ${s.name}: ${s.content}`).join('\n');
      content = [customRecognitionPrompt, scenarioText ? `\n[自定义场景]\n${scenarioText}` : ''].join('');
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
  const addTemplate = () => {
    // 仅改内存，保存时统一提交
    setEditingTemplates(prev => [...prev, { id: undefined, name: '新模板', content: '输入提示词...', category: 'edit' }]);
  };

  const removeTemplate = (index: number) => {
    // 仅改内存，保存时统一提交
    setEditingTemplates(prev => prev.filter((_, i) => i !== index));
  };

  const handleTemplateChange = (index: number, field: 'name' | 'prompt', value: string) => {
    setEditingTemplates(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field === 'prompt' ? 'content' : 'name']: value };
      return next;
    });
  };

  const persistTemplates = async () => {
    // 计算增删改
    const original = originalTemplatesRef.current || [];
    const originalMap = new Map(original.map((t: any) => [t.id, t]));
    const currentMap = new Map(editingTemplates.filter(t => t.id).map((t: any) => [t.id, t]));

    const toDelete = original.filter((t: any) => !currentMap.has(t.id)).map((t: any) => t.id);
    const toAdd = editingTemplates.filter((t: any) => !t.id);
    const toUpdate = editingTemplates.filter((t: any) => t.id && (
      t.name !== originalMap.get(t.id)?.name || (t.content || t.prompt) !== (originalMap.get(t.id)?.content || originalMap.get(t.id)?.prompt)
    ));

    // 执行删除
    for (const id of toDelete) {
      try { await templateAPI.deleteTemplate(id); } catch (e) { console.error('删除模板失败:', e); }
    }
    // 执行新增，记录新ID以便排序
    const addedIds: string[] = [];
    for (const t of toAdd) {
      try {
        const resp = await templateAPI.addTemplate(t.name, t.content || t.prompt || '', 'edit');
        if (resp && resp.data && resp.data.id) {
          addedIds.push(resp.data.id);
        }
      } catch (e) { console.error('添加模板失败:', e); }
    }
    // 执行更新
    for (const t of toUpdate) {
      try { await templateAPI.updateTemplate(t.id, t.name, t.content || t.prompt || ''); } catch (e) { console.error('更新模板失败:', e); }
    }

    // 重新获取一次，拿到最新ID列表
    let latest: any[] = [];
    try {
      const resp = await templateAPI.getTemplates('edit');
      latest = resp?.data || [];
    } catch {}

    // 根据当前内存顺序生成排序的ID列表（使用名称+内容匹配最近列表获取ID）
    const idList: string[] = editingTemplates.map((t: any) => {
      if (t.id) return t.id;
      // 新增项：尝试在latest中找到同名同内容的项
      const found = latest.find(x => !originalMap.has(x.id) && x.name === t.name && (x.content || x.prompt) === (t.content || t.prompt));
      return found?.id;
    }).filter(Boolean) as string[];

    if (idList.length) {
      try {
        await templateAPI.reorderTemplates(idList, 'edit');
      } catch (e: any) {
        // 某些部署未更新PUT路由时，尝试POST回退
        try { await apiClient.post('/templates/reorder', { ids: idList, category: 'edit' }); }
        catch (err) { console.error('保存排序失败:', err); }
      }
    }

    // 更新原始引用为当前
    originalTemplatesRef.current = latest.length ? latest : editingTemplates;

    // 通知全局快捷模板已更新，让编辑页的快捷按钮刷新
    try {
      window.dispatchEvent(new Event('templateUpdated'));
    } catch {}
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
                activeMode === 'recognition' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveMode('recognition')}
            >
              🔎 图片识别默认用户提示词
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
              
              <button onClick={addTemplate} className="mt-3 px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded">+ 添加模板</button>
            </div>
          ) : activeMode === 'recognition' ? (
            <div>
              <div className="mb-3">
                <h4 className="text-md font-medium text-gray-700 mb-2">图片识别默认用户提示词</h4>
                <p className="text-sm text-gray-600 mb-3">作为默认的用户提示词基底，供图片识别/分析时一键填充。可添加“自定义场景”作为快捷指令按钮。</p>
              </div>

              <MarkdownEditor
                value={customRecognitionPrompt}
                onChange={setCustomRecognitionPrompt}
                placeholder="输入图片识别默认用户提示词...（支持 Markdown）"
                defaultMode="split"
                minHeight={260}
              />

              <div className="mt-4">
                <h5 className="text-sm font-medium text-gray-700 mb-2">自定义场景</h5>
                <p className="text-xs text-gray-500 mb-2">添加若干场景条目，例如“文档OCR强化”、“Logo与品牌元素识别”、“安全帽合规检测”等。</p>

                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {recognitionScenarios.length === 0 && (
                    <div className="text-xs text-gray-400 px-2">暂无场景，点击下方“+ 添加场景”新增</div>
                  )}
                  {recognitionScenarios.map((s, index) => (
                    <div key={index} className="flex items-center space-x-2 p-2 border border-gray-200 rounded-lg">
                      <div className="flex flex-col space-y-1">
                        <button className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded" onClick={() => {
                          const newIndex = index - 1; if (newIndex >= 0) {
                            setRecognitionScenarios(prev => { const next = [...prev]; [next[index], next[newIndex]] = [next[newIndex], next[index]]; return next; });
                          }
                        }} title="上移">↑</button>
                        <button className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded" onClick={() => {
                          const newIndex = index + 1; if (newIndex < recognitionScenarios.length) {
                            setRecognitionScenarios(prev => { const next = [...prev]; [next[index], next[newIndex]] = [next[newIndex], next[index]]; return next; });
                          }
                        }} title="下移">↓</button>
                      </div>
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) => setRecognitionScenarios(prev => { const next = [...prev]; next[index] = { ...next[index], name: e.target.value }; return next; })}
                        className="w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                        placeholder="场景名称"
                      />
                      <textarea
                        value={s.content}
                        onChange={(e) => setRecognitionScenarios(prev => { const next = [...prev]; next[index] = { ...next[index], content: e.target.value }; return next; })}
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 resize-y min-h-[40px]"
                        placeholder="场景描述（支持 Markdown，多行）"
                        rows={2}
                      />
                      <button
                        onClick={() => setRecognitionScenarios(prev => prev.filter((_, i) => i !== index))}
                        className="px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                        title="删除场景"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <button onClick={() => setRecognitionScenarios(prev => [...prev, { name: '新场景', content: '描述该识别场景的特定关注点...' }])} className="mt-3 px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded">+ 添加场景</button>
              </div>

              <div className="mt-2 text-xs text-gray-500">字符数：{customRecognitionPrompt.length}；场景数：{recognitionScenarios.length}</div>
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
        <div className="flex justify-end items-center">
          <div className="flex space-x-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded">
              取消
            </button>
            <button
              onClick={async () => {
                // 统一保存：先保存模板及顺序，再保存系统提示词
                await persistTemplates();
                onSave({
                  generation: customGenerationPrompt,
                  editing: customEditingPrompt,
                  analysis: customAnalysisPrompt,
                  recognition: customRecognitionPrompt,
                  recognitionScenarios: recognitionScenarios.map(s => `${s.name}: ${s.content}`)
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
