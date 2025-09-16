import React, { useEffect, useRef, useState } from 'react';
import apiClient, { templateAPI, recognitionAPI, uiAPI } from '../services/api.ts';
import { DEFAULT_RECOGNITION_PROMPT } from '../constants/recognitionDefaults.ts';
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
  type MainTabId = 'generate' | 'analysis' | 'recognition' | 'templates';
  const DEFAULT_MAIN_TABS: { id: MainTabId; label: string; icon: string }[] = [
    { id: 'generate', label: '图片生成System Prompt', icon: '🎨' },
    { id: 'analysis', label: '图片编辑System Prompt', icon: '🧠' },
    { id: 'recognition', label: '图片识别场景', icon: '🔎' },
    { id: 'templates', label: '图片编辑快捷Prompt', icon: '📝' },
  ];
  const [mainTabs, setMainTabs] = useState(DEFAULT_MAIN_TABS);
  const [activeMode, setActiveMode] = useState<MainTabId>('generate');
  // 主Tab拖拽
  const dragFromMainRef = useRef<number | null>(null);
  const onMainDragStart = (i: number) => () => { dragFromMainRef.current = i; };
  const onMainDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onMainDrop = (toIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const fromIndex = dragFromMainRef.current;
    dragFromMainRef.current = null;
    if (fromIndex == null || fromIndex === toIndex) return;
    setMainTabs(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };
  // 子Tab：识别场景，0 = 默认场景，1..n 对应 recognitionScenarios
  const [activeSceneIdx, setActiveSceneIdx] = useState<number>(0);
  const dragFromIdxRef = useRef<number | null>(null);
  const handleDragStart = (index: number) => () => { dragFromIdxRef.current = index; };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (toIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const fromIndex = dragFromIdxRef.current;
    dragFromIdxRef.current = null;
    if (fromIndex == null || fromIndex === toIndex) return;
    setRecognitionScenarios(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    // 子Tab索引修正：+1 补偿默认场景
    const newSceneTabIndex = toIndex + 1;
    setActiveSceneIdx(newSceneTabIndex);
  };
  const [customGenerationPrompt, setCustomGenerationPrompt] = useState(DEFAULT_GENERATION_PROMPT);
  const [customEditingPrompt, setCustomEditingPrompt] = useState('');
  const [customAnalysisPrompt, setCustomAnalysisPrompt] = useState(DEFAULT_ANALYSIS_PROMPT);
  const [customRecognitionPrompt, setCustomRecognitionPrompt] = useState(DEFAULT_RECOGNITION_PROMPT);
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

  // 打开面板时，从后端加载一次（覆盖本地为空的情况，保证跨设备）
  useEffect(() => {
    const loadFromServer = async () => {
      if (!show) return;
      try {
        const resp = await recognitionAPI.getSettings();
        if (resp?.success && resp.data) {
          const { customRecognitionPrompt: srvPrompt, recognitionScenarios: srvScenarios } = resp.data as any;
          if (srvPrompt && typeof srvPrompt === 'string') {
            setCustomRecognitionPrompt(srvPrompt);
          }
          if (Array.isArray(srvScenarios) && srvScenarios.length > 0) {
            const parsed = srvScenarios.map((s: any) => ({ name: s.name || '场景', content: s.content || '' })).filter((x: any) => x.content);
            setRecognitionScenarios(parsed);
          }
        }
      } catch (e) {
        console.warn('从服务器加载识别设置失败:', e);
      }
    };
    loadFromServer();
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

  // 打开面板时，拉取主Tab顺序
  useEffect(() => {
    const loadUI = async () => {
      if (!show) return;
      try {
        const resp = await uiAPI.getSettings();
        const order: string[] | undefined = resp?.data?.systemPromptTabsOrder;
        if (Array.isArray(order) && order.length) {
          const map = new Map(DEFAULT_MAIN_TABS.map(t => [t.id, t]));
          const re = order.map(id => map.get(id as MainTabId)).filter(Boolean) as typeof DEFAULT_MAIN_TABS;
          // 补全缺失项
          DEFAULT_MAIN_TABS.forEach(t => { if (!re.find(x => x.id === t.id)) re.push(t); });
          setMainTabs(re);
          // 若当前active不在re中，回退到第一个
          if (!re.find(t => t.id === activeMode)) setActiveMode(re[0].id);
        }
      } catch (e) {
        // ignore
      }
    };
    loadUI();
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

  const handleTemplateChange = (index: number, field: 'name' | 'prompt' | 'nameZh' | 'nameEn' | 'contentZh' | 'contentEn', value: string) => {
    setEditingTemplates(prev => {
      const next = [...prev];
      if (field === 'prompt') {
        next[index] = { ...next[index], content: value };
      } else if (field === 'name') {
        next[index] = { ...next[index], name: value };
      } else {
        next[index] = { ...next[index], [field]: value };
      }
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
    const toUpdate = editingTemplates.filter((t: any) => {
      if (!t.id) return false;
      const o = originalMap.get(t.id) || {};
      return (
        t.name !== o.name ||
        (t.content || t.prompt) !== (o.content || o.prompt) ||
        t.nameZh !== o.nameZh || t.nameEn !== o.nameEn ||
        t.contentZh !== o.contentZh || t.contentEn !== o.contentEn
      );
    });

    // 执行删除
    for (const id of toDelete) {
      try { await templateAPI.deleteTemplate(id); } catch (e) { console.error('删除模板失败:', e); }
    }
    // 执行新增，记录新ID以便排序
    const addedIds: string[] = [];
    for (const t of toAdd) {
      try {
        const resp = await templateAPI.addTemplate({
          name: t.name,
          content: t.content || t.prompt || '',
          category: 'edit',
          nameZh: t.nameZh,
          nameEn: t.nameEn,
          contentZh: t.contentZh,
          contentEn: t.contentEn,
        });
        if (resp && resp.data && resp.data.id) {
          addedIds.push(resp.data.id);
        }
      } catch (e) { console.error('添加模板失败:', e); }
    }
    // 执行更新
    for (const t of toUpdate) {
      try {
        await templateAPI.updateTemplate(t.id, {
          name: t.name,
          content: t.content || t.prompt || '',
          nameZh: t.nameZh,
          nameEn: t.nameEn,
          contentZh: t.contentZh,
          contentEn: t.contentEn,
        });
      } catch (e) { console.error('更新模板失败:', e); }
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

  // 从前端静态JSON导入 Nano-Bananary 模板
  const importNanoTemplates = async () => {
    try {
      const resp = await fetch('/nano_bananary_edit_templates.json', { cache: 'no-cache' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const list: Array<{ name: string; content: string }> = await resp.json();
      const existing = new Set(
        (editingTemplates || []).map((t: any) => `${t.name}__${t.content || t.prompt}`)
      );
      const toAdd = (list || [])
        .filter((t) => t && t.name && t.content)
        .filter((t) => !existing.has(`${t.name}__${t.content}`))
        .map((t) => ({ id: undefined, name: t.name, content: t.content, category: 'edit' }));
      if (toAdd.length === 0) {
        alert('没有可导入的新模板（已存在或列表为空）');
        return;
      }
      setEditingTemplates((prev) => [...prev, ...toAdd]);
      try { window.dispatchEvent(new Event('templateUpdated')); } catch {}
      alert(`已导入 ${toAdd.length} 条模板（来源：Nano-Bananary）`);
    } catch (e) {
      console.error('导入 Nano 模板失败:', e);
      alert('导入失败，请稍后重试');
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
            <nav className="-mb-px flex space-x-2 sm:space-x-4">
              {mainTabs.map((t, i) => (
                <button
                  key={t.id}
                  className={`py-2 px-2 border-b-2 font-medium text-sm rounded-t ${
                    activeMode === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setActiveMode(t.id)}
                  draggable
                  onDragStart={onMainDragStart(i)}
                  onDragOver={onMainDragOver}
                  onDrop={onMainDrop(i)}
                  title={t.label}
                >
                  <span className="mr-1">{t.icon}</span> {t.label}
                </button>
              ))}
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
                  <div key={template.id || index} className="p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col space-y-1">
                        <button className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded" onClick={() => moveTemplate(index, -1)} title="上移">↑</button>
                        <button className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded" onClick={() => moveTemplate(index, 1)} title="下移">↓</button>
                      </div>
                      <div className="flex-1 space-y-2">
                        {/* 简洁模式：仅编辑中文展示 */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={template.nameZh || template.name || ''}
                            onChange={(e) => handleTemplateChange(index, 'nameZh', e.target.value)}
                            className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                            placeholder="中文名称"
                          />
                          <input
                            type="text"
                            value={template.contentZh || template.content || template.prompt || ''}
                            onChange={(e) => handleTemplateChange(index, 'contentZh', e.target.value)}
                            className="md:col-span-2 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                            placeholder="中文提示词（用于界面展示）"
                          />
                        </div>
                        {/* 高级模式：编辑中英双语 */}
                        <details className="mt-1">
                          <summary className="text-xs text-gray-500 cursor-pointer">高级字段（英文原文 + 备用名称）</summary>
                          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={template.nameEn || template.name || ''}
                              onChange={(e) => handleTemplateChange(index, 'nameEn', e.target.value)}
                              className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                              placeholder="English Name"
                            />
                            <input
                              type="text"
                              value={template.contentEn || template.content || template.prompt || ''}
                              onChange={(e) => handleTemplateChange(index, 'contentEn', e.target.value)}
                              className="md:col-span-2 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                              placeholder="English Prompt（用于模型调用）"
                            />
                          </div>
                        </details>
                      </div>
                      <button
                        onClick={() => removeTemplate(index)}
                        className="px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                        title="删除模板"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-3 flex items-center gap-2">
                <button onClick={addTemplate} className="px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded">+ 添加模板</button>
                <button onClick={importNanoTemplates} className="px-3 py-1.5 text-sm bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded" title="从内置JSON导入 Nano-Bananary 模板">导入 Nano 模板</button>
              </div>
            </div>
          ) : activeMode === 'recognition' ? (
            <div>
              {/* 子Tab：场景切换 */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center flex-wrap gap-2">
                  <button
                    className={`px-3 py-1.5 text-sm rounded border ${activeSceneIdx === 0 ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    onClick={() => setActiveSceneIdx(0)}
                  >默认场景</button>
                  {recognitionScenarios.map((s, i) => (
                    <button
                      key={i}
                      className={`px-3 py-1.5 text-sm rounded border ${activeSceneIdx === i + 1 ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      onClick={() => setActiveSceneIdx(i + 1)}
                      draggable
                      onDragStart={handleDragStart(i)}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop(i)}
                      title={s.name}
                    >{s.name || `场景${i + 1}`}</button>
                  ))}
                </div>
                <button
                  onClick={() => { setRecognitionScenarios(prev => [...prev, { name: '新场景', content: '' }]); setActiveSceneIdx(recognitionScenarios.length + 1); }}
                  className="px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
                >+ 添加场景</button>
              </div>

              {/* 编辑区 */}
              {activeSceneIdx === 0 ? (
                <>
                  <div className="mb-2 text-sm text-gray-600">默认场景内容将作为“快捷指令”提供，并在分析无输入时自动激活。</div>
                  <MarkdownEditor
                    value={customRecognitionPrompt}
                    onChange={setCustomRecognitionPrompt}
                    placeholder="输入默认场景内容...（支持 Markdown / GFM 表格 / 任务列表）"
                    defaultMode="split"
                    minHeight={260}
                  />
                  <div className="mt-2 text-xs text-gray-500">字符数：{customRecognitionPrompt.length}</div>
                </>
              ) : (
                (() => {
                  const idx = activeSceneIdx - 1;
                  const scene = recognitionScenarios[idx] || { name: '', content: '' };
                  return (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          value={scene.name}
                          onChange={(e) => setRecognitionScenarios(prev => { const next = [...prev]; next[idx] = { ...next[idx], name: e.target.value }; return next; })}
                          className="w-48 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                          placeholder="场景名称"
                        />
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              if (idx <= 0) return;
                              setRecognitionScenarios(prev => {
                                const next = [...prev];
                                [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                return next;
                              });
                              setActiveSceneIdx(idx); // 上移后仍然指向同一场景（新的位置 = idx）
                            }}
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                            title="上移"
                          >↑</button>
                          <button
                            onClick={() => {
                              setRecognitionScenarios(prev => {
                                if (idx >= prev.length - 1) return prev;
                                const next = [...prev];
                                [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                return next;
                              });
                              setActiveSceneIdx(idx + 2); // 下移后位置 +1（子tab索引 +1 再加默认场景偏移）
                            }}
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                            title="下移"
                          >↓</button>
                        </div>
                        <button
                          onClick={() => { setRecognitionScenarios(prev => prev.filter((_, i) => i !== idx)); setActiveSceneIdx(0); }}
                          className="px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                        >删除</button>
                      </div>
                      <MarkdownEditor
                        value={scene.content}
                        onChange={(val) => setRecognitionScenarios(prev => { const next = [...prev]; next[idx] = { ...next[idx], content: val }; return next; })}
                        placeholder="编写该场景的详细描述...（支持 Markdown / GFM 表格 / 任务列表）"
                        defaultMode="split"
                        minHeight={260}
                      />
                      <div className="mt-2 text-xs text-gray-500">字符数：{(scene.content || '').length}</div>
                    </div>
                  );
                })()
              )}
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
                // 统一保存：先保存模板，后保存识别设置，最后回调（以便现有逻辑写入localStorage并广播事件）
                await persistTemplates();
                try {
                  await recognitionAPI.updateSettings({
                    customRecognitionPrompt,
                    recognitionScenarios,
                  });
                } catch (e) {
                  console.warn('保存识别设置到服务器失败:', e);
                }
                try {
                  await uiAPI.updateSettings({ systemPromptTabsOrder: mainTabs.map(t => t.id) });
                } catch (e) {
                  console.warn('保存UI设置失败:', e);
                }
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
