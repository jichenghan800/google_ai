import React, { useEffect, useRef, useState, useCallback } from 'react';
import apiClient, { templateAPI, recognitionAPI, uiAPI } from '../services/api.ts';
import { DEFAULT_RECOGNITION_PROMPT, STORE_RECOGNITION_PROMPT } from '../constants/recognitionDefaults.ts';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { resolveTemplateEmoji } from '../utils/templateEmoji.ts';

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
  const pickEmoji = (t: any): string => resolveTemplateEmoji(t);
  // 可选图标库（扩充）
  const EMOJI_OPTIONS: string[] = [
    // 通用/编辑
    '🧩','✨','🎨','🪄','🖌️','🖍️','✂️','🧵','🧶','🪡','🎭','✍️','📝','🧰','🔧','🔨','⚙️','🪚','📐','📏','📎','🗂️',
    // 摄影/相机/光影
    '📸','📷','🎥','🎬','🔦','💡','🪔','🌅','🌆','🌃','🌌','🌉','🌁','🌤️','🌥️','🌦️','🌧️','🌫️',
    // 设计/UI/布局
    '🖼️','🧭','🧱','📐','📏','📊','📈','📉','🧮','🔲','🔳','◻️','◼️','⬛','⬜','🔺','🔻','🔸','🔹','🔶','🔷',
    // 物体/场景
    '🏞️','🏙️','🏗️','🏛️','🏠','🛋️','🪑','🛏️','🚪','🪟','🚗','🚕','🚙','🚲','✈️','🚀','🛸','🚁','🛶','⚓',
    // 人物/风格
    '🧑\u200d🎨','🧑\u200d💻','🧑\u200d🔧','🧑\u200d🍳','🧑\u200d🚀','🤖','🦾','🦿','🧠','👁️','👤','🗿','🧸','🪆',
    // 颜色/材质
    '🎯','🎲','🧪','🧫','🧬','🧊','🔥','💧','🌪️','🌈','💎','🔗','🪵','🪨','🧱','🔩','🔗','🧯',
    // 其他常用
    '📦','🗃️','🗄️','🔒','🔓','🔑','🗝️','🧳','📁','🗳️','🧼','🧽','🪣','🧹','🧺','🧴','🪞','🪟','🪄',
    // 补充风格/装饰
    '💄','👗','👘','👗','👠','🎩','🎓','👑','🕶️','🎀','🪩','💍','⌚','🧥','🧣','🧤'
  ];

  // 分组显示（网格选择）
  const EMOJI_GROUPS: Array<{ label: string; items: string[] }> = [
    { label: '通用/编辑', items: ['🧩','✨','🎨','🪄','🖌️','🖍️','✂️','🧵','🧶','🪡','🎭','✍️','📝','🧰','🔧','🔨','⚙️','🪚','📐','📏','📎','🗂️'] },
    { label: '摄影/光影', items: ['📸','📷','🎥','🎬','🔦','💡','🪔','🌅','🌆','🌃','🌌','🌉','🌁','🌤️','🌥️','🌦️','🌧️','🌫️'] },
    { label: '设计/布局', items: ['🖼️','🧭','🧱','📐','📏','📊','📈','📉','🧮','🔲','🔳','◻️','◼️','⬛','⬜','🔺','🔻','🔸','🔹','🔶','🔷'] },
    { label: '场景/家具', items: ['🏞️','🏙️','🏗️','🏛️','🏠','🛋️','🪑','🛏️','🚪','🪟'] },
    { label: '交通/航天', items: ['🚗','🚕','🚙','🚲','✈️','🚀','🛸','🚁','🛶','⚓'] },
    { label: '人物/风格', items: ['🧑\u200d🎨','🧑\u200d💻','🧑\u200d🔧','🧑\u200d🍳','🧑\u200d🚀','🤖','🦾','🦿','🧠','👁️','👤','🗿','🧸','🪆'] },
    { label: '材质/自然', items: ['🎯','🎲','🧪','🧫','🧬','🧊','🔥','💧','🌪️','🌈','💎','🔗','🪵','🪨','🧱','🔩','🧯'] },
    { label: '时尚/装饰', items: ['💄','👗','👘','👠','🎩','🎓','👑','🕶️','🎀','🪩','💍','⌚','🧥','🧣','🧤'] },
  ];

  const [openEmojiPickerIdx, setOpenEmojiPickerIdx] = useState<number | null>(null);
  const [genDriverOpen, setGenDriverOpen] = useState<boolean>(false);
  const [genShowEn, setGenShowEn] = useState<Record<string, boolean>>({});
  // 自适应高度：生成模板驱动 System Prompt 文本框
  const fillerRef = useRef<HTMLTextAreaElement | null>(null);
  const autosizeFiller = useCallback(() => {
    const el = fillerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.min(Math.max(el.scrollHeight, 80), 800); // clamp 80..800px
    el.style.height = `${h}px`;
  }, []);

  const [genTemplateFiller, setGenTemplateFiller] = useState<string>('');
  type MainTabId = 'generate' | 'analysis' | 'recognition' | 'templates' | 'genTemplates';
  const DEFAULT_MAIN_TABS: { id: MainTabId; label: string; icon: string }[] = [
    { id: 'generate', label: '图片生成System Prompt', icon: '🎨' },
    { id: 'analysis', label: '图片编辑System Prompt', icon: '🧠' },
    { id: 'recognition', label: '图片识别场景', icon: '🔎' },
    { id: 'templates', label: '图片编辑快捷Prompt', icon: '📝' },
    { id: 'genTemplates', label: '图片生成快捷Prompt', icon: '⚡' },
  ];
  const [mainTabs, setMainTabs] = useState(DEFAULT_MAIN_TABS);
  const [activeMode, setActiveMode] = useState<MainTabId>('generate');
  // 打开模态时禁用页面滚动，避免窗口出现第二个滚动条
  const prevOverflowHtmlRef = useRef<string>('');
  const prevOverflowBodyRef = useRef<string>('');
  useEffect(() => {
    if (!show) return;
    try {
      prevOverflowHtmlRef.current = document.documentElement.style.overflow;
      prevOverflowBodyRef.current = document.body.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } catch {}
    return () => {
      try {
        document.documentElement.style.overflow = prevOverflowHtmlRef.current || '';
        document.body.style.overflow = prevOverflowBodyRef.current || '';
      } catch {}
    };
  }, [show]);
  // 模板状态（提前声明，供高度测量依赖）
  const [editingTemplates, setEditingTemplates] = useState<any[]>(DEFAULT_EDITING_TEMPLATES);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const originalTemplatesRef = useRef<any[]>([]);
  const [genTemplates, setGenTemplates] = useState<any[]>([]);
  const [loadingGenTemplates, setLoadingGenTemplates] = useState(false);
  const originalGenRef = useRef<any[]>([]);
  // 初始显示/切换到生成快捷Prompt页签/展开/内容变更时，自动调整高度
  useEffect(() => {
    if (!show) return;
    if (activeMode !== 'genTemplates' || !genDriverOpen) return;
    const id = setTimeout(autosizeFiller, 0);
    return () => clearTimeout(id);
  }, [show, activeMode, genDriverOpen, genTemplateFiller, autosizeFiller]);
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
  const ensureStoreScenario = useCallback((scenes: { name: string; content: string }[]) => {
    const map = new Map<string, { name: string; content: string }>();
    scenes.forEach((scene) => {
      const name = (scene?.name || '').trim();
      const content = (scene?.content || '').trim();
      if (!content) return;
      const key = name || '分析场景';
      map.set(key, { name: key, content });
    });
    const storeKey = '门店识别场景';
    if (!map.has(storeKey)) {
      map.set(storeKey, { name: storeKey, content: STORE_RECOGNITION_PROMPT });
    } else {
      const existing = map.get(storeKey);
      if (!existing || !existing.content.trim()) {
        map.set(storeKey, { name: storeKey, content: STORE_RECOGNITION_PROMPT });
      }
    }
    return Array.from(map.values());
  }, []);

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
          setRecognitionScenarios(ensureStoreScenario(parsed));
        } else {
          setRecognitionScenarios(ensureStoreScenario([]));
        }
      } else {
        setRecognitionScenarios(ensureStoreScenario([]));
      }
    } catch (e) {
      console.warn('加载图片识别默认用户提示词或自定义场景失败:', e);
      setRecognitionScenarios(ensureStoreScenario([]));
    }
  }, [ensureStoreScenario, show]);

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
          if (Array.isArray(srvScenarios)) {
            const parsed = srvScenarios.map((s: any) => ({ name: (s?.name || '场景').trim(), content: String(s?.content || '').trim() })).filter((x: any) => x.content);
            setRecognitionScenarios(ensureStoreScenario(parsed));
          } else {
            setRecognitionScenarios(ensureStoreScenario([]));
          }
        } else {
          setRecognitionScenarios(ensureStoreScenario([]));
        }
      } catch (e) {
        console.warn('从服务器加载识别设置失败:', e);
        setRecognitionScenarios(ensureStoreScenario([]));
      }
    };
    loadFromServer();
  }, [ensureStoreScenario, show]);
  // 上移至前面，避免未初始化即被依赖

  // 加载后端模板（编辑/生成）
  useEffect(() => {
    const load = async () => {
      if (!show) return;
      try {
        setLoadingTemplates(true);
        setLoadingGenTemplates(true);
        const resp = await templateAPI.getTemplates('edit');
        if (resp && Array.isArray(resp.data)) {
          const mapped = (resp.data || []).map((t: any) => ({ ...t, emoji: pickEmoji(t) }));
          setEditingTemplates(mapped);
          // 保持原始快照为服务器状态，用于保存时对比（这样缺失emoji会被识别为需要更新）
          originalTemplatesRef.current = resp.data;
        } else {
          originalTemplatesRef.current = editingTemplates;
        }
        const respGen = await templateAPI.getTemplates('generate');
        if (respGen && Array.isArray(respGen.data)) {
          setGenTemplates(respGen.data);
          originalGenRef.current = respGen.data;
        } else {
          originalGenRef.current = genTemplates;
        }
      } catch (e) {
        console.error('加载模板失败:', e);
      } finally {
        setLoadingTemplates(false);
        setLoadingGenTemplates(false);
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
        const filler: string | undefined = resp?.data?.generationTemplateFillerSystemPrompt;
        if (Array.isArray(order) && order.length) {
          const map = new Map(DEFAULT_MAIN_TABS.map(t => [t.id, t]));
          const re = order.map(id => map.get(id as MainTabId)).filter(Boolean) as typeof DEFAULT_MAIN_TABS;
          // 补全缺失项
          DEFAULT_MAIN_TABS.forEach(t => { if (!re.find(x => x.id === t.id)) re.push(t); });
          setMainTabs(re);
          // 若当前active不在re中，回退到第一个
          if (!re.find(t => t.id === activeMode)) setActiveMode(re[0].id);
        }
        if (typeof filler === 'string') setGenTemplateFiller(filler);
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
    setEditingTemplates(prev => [...prev, { id: undefined, name: '新模板', content: '输入提示词...', category: 'edit', emoji: '🧩' }]);
  };

  const removeTemplate = (index: number) => {
    // 仅改内存，保存时统一提交
    setEditingTemplates(prev => prev.filter((_, i) => i !== index));
  };

  const handleTemplateChange = (
    index: number,
    field: 'name' | 'prompt' | 'nameZh' | 'nameEn' | 'contentZh' | 'contentEn' | 'remarkZh' | 'remarkEn' | 'emoji',
    value: string
  ) => {
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
        t.contentZh !== o.contentZh || t.contentEn !== o.contentEn ||
        t.remarkZh !== o.remarkZh || t.remarkEn !== o.remarkEn ||
        t.emoji !== o.emoji
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
          emoji: t.emoji,
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
          remarkZh: t.remarkZh,
          remarkEn: t.remarkEn,
          emoji: t.emoji,
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

  const persistGenTemplates = async () => {
    const original = originalGenRef.current || [];
    const originalMap = new Map(original.map((t: any) => [t.id, t]));
    const currentMap = new Map(genTemplates.filter(t => t.id).map((t: any) => [t.id, t]));

    const toDelete = original.filter((t: any) => !currentMap.has(t.id)).map((t: any) => t.id);
    const toAdd = genTemplates.filter((t: any) => !t.id);
    const toUpdate = genTemplates.filter((t: any) => {
      if (!t.id) return false;
      const o = originalMap.get(t.id) || {};
      return (
        t.name !== o.name ||
        (t.content || t.prompt) !== (o.content || o.prompt) ||
        t.nameZh !== o.nameZh || t.nameEn !== o.nameEn ||
        t.contentZh !== o.contentZh || t.contentEn !== o.contentEn ||
        t.emoji !== o.emoji
      );
    });

    for (const id of toDelete) {
      try { await templateAPI.deleteTemplate(id); } catch (e) { console.error('删除生成模板失败:', e); }
    }
    const addedIds: string[] = [];
    for (const t of toAdd) {
      try {
        const resp = await templateAPI.addTemplate({
          name: t.name,
          content: t.content || t.prompt || '',
          category: 'generate',
          nameZh: t.nameZh,
          nameEn: t.nameEn,
          contentZh: t.contentZh,
          contentEn: t.contentEn,
          emoji: t.emoji,
        });
        if (resp && resp.data && resp.data.id) addedIds.push(resp.data.id);
      } catch (e) { console.error('添加生成模板失败:', e); }
    }
    for (const t of toUpdate) {
      try {
        await templateAPI.updateTemplate(t.id, {
          name: t.name,
          content: t.content || t.prompt || '',
          nameZh: t.nameZh,
          nameEn: t.nameEn,
          contentZh: t.contentZh,
          contentEn: t.contentEn,
          emoji: t.emoji,
        });
      } catch (e) { console.error('更新生成模板失败:', e); }
    }

    // 重新获取
    let latest: any[] = [];
    try { const resp = await templateAPI.getTemplates('generate'); latest = resp?.data || []; } catch {}
    const idList: string[] = genTemplates.map((t: any) => {
      if (t.id) return t.id;
      const found = latest.find(x => !originalMap.has(x.id) && x.name === t.name && (x.content || x.prompt) === (t.content || t.prompt));
      return found?.id;
    }).filter(Boolean) as string[];
    if (idList.length) {
      try { await templateAPI.reorderTemplates(idList, 'generate'); }
      catch (e) { try { await apiClient.post('/templates/reorder', { ids: idList, category: 'generate' }); } catch (err) { console.error('保存生成模板排序失败:', err); } }
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

  // 从前端静态JSON导入 Nano-Bananary 模板
  const importNanoTemplates = async () => {
    try {
      const resp = await fetch('/nano_bananary_edit_templates_bilingual.json', { cache: 'no-cache' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const list: Array<{ nameEn: string; nameZh: string; remarkEn?: string; remarkZh?: string; contentEn: string; contentZh: string }> = await resp.json();
      const existing = new Set((editingTemplates || []).map((t: any) => `${(t.nameEn||t.name)||''}__${(t.contentEn||t.content||t.prompt)||''}`));
      const rawToAdd = (list || []).filter((t) => t && t.nameEn && t.contentEn).filter((t) => !existing.has(`${t.nameEn}__${t.contentEn}`));
      if (rawToAdd.length === 0) {
        alert('没有可导入的新模板（已存在或列表为空）');
        return;
      }
      const toAddBilingual = rawToAdd.map((item) => ({
        id: undefined,
        category: 'edit',
        name: item.nameEn,
        nameEn: item.nameEn,
        nameZh: item.nameZh || item.nameEn,
        content: item.contentEn,
        contentEn: item.contentEn,
        contentZh: item.contentZh || item.contentEn,
        remarkEn: item.remarkEn || '',
        remarkZh: item.remarkZh || ''
      }));
      setEditingTemplates((prev) => [...prev, ...toAddBilingual]);
      try { window.dispatchEvent(new Event('templateUpdated')); } catch {}
      alert(`已导入 ${toAddBilingual.length} 条模板（来源：Nano-Bananary 双语清单）`);
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
      <div className="bg-[var(--surface-card)] rounded-lg p-6 max-w-6xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col border border-[rgba(var(--text-primary-rgb),0.12)] backdrop-blur-xl text-[var(--text-primary)]">
        {/* 标题栏 */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">自定义 System Prompt</h3>
          <button onClick={onClose} className="text-[rgba(var(--text-primary-rgb),0.55)] hover:text-[var(--text-primary)]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* 标签页切换 */}
        <div className="mb-6">
          <div className="border-b border-[rgba(var(--text-primary-rgb),0.12)]">
            <nav className="-mb-px flex space-x-2 sm:space-x-4">
              {mainTabs.map((t, i) => (
                <button
                  key={t.id}
                  className={`py-2 px-2 border-b-2 font-medium text-sm rounded-t ${
                    activeMode === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-[rgba(var(--text-primary-rgb),0.6)] hover:text-[rgba(var(--text-primary-rgb),0.82)]'
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

        {/* 内容区域滚动容器（仅此处滚动；标题与底部按钮不参与滚动） */}
        <div className="flex-1 overflow-y-auto">
          <div className="mb-4">
          {activeMode === 'templates' ? (
            <div>
              <div className="mb-3">
                <h4 className="text-md font-medium text-[rgba(var(--text-primary-rgb),0.82)] mb-2">图片编辑快捷模板</h4>
                <p className="text-sm text-[rgba(var(--text-primary-rgb),0.7)] mb-3">
                  预设的常用编辑指令模板，可以快速应用到图片编辑任务中
                </p>
              </div>
              
              <div className="space-y-2">
                {loadingTemplates ? (
                  <div className="text-sm text-[rgba(var(--text-primary-rgb),0.5)] px-2">加载中...</div>
                ) : editingTemplates.map((template, index) => (
                  <div key={`${template.id || 'new'}-${index}`} className="p-2 border border-[rgba(var(--text-primary-rgb),0.12)] rounded-lg">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col space-y-1">
                        <button className="px-2 py-1 text-xs bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] hover:bg-[rgba(var(--surface-2-rgb,15,23,42),0.5)] rounded" onClick={() => moveTemplate(index, -1)} title="上移">↑</button>
                        <button className="px-2 py-1 text-xs bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] hover:bg-[rgba(var(--surface-2-rgb,15,23,42),0.5)] rounded" onClick={() => moveTemplate(index, 1)} title="下移">↓</button>
                      </div>
                      <div className="flex-1 space-y-2">
                        {/* 图标选择：预览 + 网格面板 + 自定义输入 */}
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[rgba(var(--text-primary-rgb),0.7)]">图标</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="px-2 py-1 rounded border border-[rgba(var(--text-primary-rgb),0.18)] bg-[var(--surface-card)] hover:bg-gray-50"
                              title="当前图标"
                            >{template.emoji || '🧩'}</button>
                            <button
                              type="button"
                              onClick={() => setOpenEmojiPickerIdx(openEmojiPickerIdx === index ? null : index)}
                              className="px-2 py-1 text-sm rounded border border-[rgba(var(--text-primary-rgb),0.18)] bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] text-[rgba(var(--text-primary-rgb),0.82)] hover:bg-[rgba(var(--surface-2-rgb,15,23,42),0.5)]"
                            >{openEmojiPickerIdx === index ? '关闭选择' : '选择图标'}</button>
                          </div>
                        </div>
                        {openEmojiPickerIdx === index && (
                          <div className="mt-2 p-2 rounded-lg border border-[rgba(var(--text-primary-rgb),0.12)] bg-[var(--surface-card)]">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {EMOJI_GROUPS.map((grp, gi) => (
                                <div key={`grp-${gi}`} className="min-w-0">
                                  <div className="text-xs text-[rgba(var(--text-primary-rgb),0.6)] mb-1">{grp.label}</div>
                                  <div className="grid grid-cols-8 gap-1">
                                    {grp.items.map((em) => (
                                      <button
                                        key={em}
                                        onClick={() => { handleTemplateChange(index, 'emoji', em); setOpenEmojiPickerIdx(null); }}
                                        className={`h-8 w-8 flex items-center justify-center rounded border ${
                                          (template.emoji || '🧩') === em ? 'border-blue-500 bg-blue-50' : 'border-[rgba(var(--text-primary-rgb),0.12)] hover:bg-gray-50'
                                        }`}
                                        title={em}
                                      >{em}</button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <span className="text-xs text-[rgba(var(--text-primary-rgb),0.7)]">自定义</span>
                              <input
                                type="text"
                                maxLength={3}
                                placeholder="粘贴任意 emoji 或符号"
                                defaultValue={template.emoji || ''}
                                className="px-2 py-1 text-sm border border-[rgba(var(--text-primary-rgb),0.18)] rounded w-40"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const val = (e.currentTarget as HTMLInputElement).value;
                                    handleTemplateChange(index, 'emoji', val || '🧩');
                                    setOpenEmojiPickerIdx(null);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="px-2 py-1 text-sm rounded border border-[rgba(var(--text-primary-rgb),0.18)] bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] text-[rgba(var(--text-primary-rgb),0.82)] hover:bg-[rgba(var(--surface-2-rgb,15,23,42),0.5)]"
                                onClick={(e) => {
                                  const input = (e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement | null);
                                  const val = input?.value || '';
                                  handleTemplateChange(index, 'emoji', val || '🧩');
                                  setOpenEmojiPickerIdx(null);
                                }}
                              >应用</button>
                            </div>
                          </div>
                        )}
                        {/* 直接双语展示：上中文，下英文 */}
                        <input
                          type="text"
                          value={template.nameZh || template.name || ''}
                          onChange={(e) => handleTemplateChange(index, 'nameZh', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-[rgba(var(--text-primary-rgb),0.18)] bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] text-[var(--text-primary)] placeholder:text-[rgba(var(--text-primary-rgb),0.45)] rounded focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
                          placeholder="中文名称"
                        />
                        <input
                          type="text"
                          value={template.nameEn || template.name || ''}
                          onChange={(e) => handleTemplateChange(index, 'nameEn', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-[rgba(var(--text-primary-rgb),0.18)] bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] text-[var(--text-primary)] placeholder:text-[rgba(var(--text-primary-rgb),0.45)] rounded focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
                          placeholder="English Name"
                        />
                        <input
                          type="text"
                          value={template.contentZh || template.content || template.prompt || ''}
                          onChange={(e) => handleTemplateChange(index, 'contentZh', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-[rgba(var(--text-primary-rgb),0.18)] bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] text-[var(--text-primary)] placeholder:text-[rgba(var(--text-primary-rgb),0.45)] rounded focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
                          placeholder="中文提示词（界面展示）"
                        />
                        <input
                          type="text"
                          value={template.contentEn || template.content || template.prompt || ''}
                          onChange={(e) => handleTemplateChange(index, 'contentEn', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-[rgba(var(--text-primary-rgb),0.18)] bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] text-[var(--text-primary)] placeholder:text-[rgba(var(--text-primary-rgb),0.45)] rounded focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
                          placeholder="English Prompt（用于模型调用）"
                        />
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
                <button onClick={addTemplate} className="px-3 py-1.5 text-sm rounded bg-[rgba(99,102,241,0.25)] hover:bg-[rgba(99,102,241,0.35)] text-[var(--text-primary)]">+ 添加模板</button>
                <button onClick={importNanoTemplates} className="px-3 py-1.5 text-sm rounded bg-[rgba(16,185,129,0.25)] hover:bg-[rgba(16,185,129,0.35)] text-[var(--text-primary)]" title="从内置双语清单导入 Nano 模板">导入 Nano 模板</button>
                <button
                  onClick={async () => {
                    const doLocalMerge = async () => {
                      // Fallback: client-side merge and update one by one
                      try {
                        const respCur = await templateAPI.getTemplates('edit');
                        const current = Array.isArray(respCur?.data) ? respCur.data : [];
                        const respBi = await fetch('/nano_bananary_edit_templates_bilingual.json', { cache: 'no-cache' });
                        const bi = await respBi.json();
                        const biMap = new Map(
                          (bi || []).map((x: any) => [
                            `${(x.nameEn||'').trim()}__${(x.contentEn||'').trim()}`,
                            x
                          ])
                        );
                        let updated = 0;
                        for (const t of current) {
                          const key = `${(t.name||'').trim()}__${(t.content||'').trim()}`;
                          const match = biMap.get(key);
                          const needZh = !t.nameZh || !t.contentZh;
                          if (t.id && match && needZh) {
                            await templateAPI.updateTemplate(t.id, {
                              name: t.name,
                              content: t.content,
                              nameEn: t.nameEn || t.name,
                              contentEn: t.contentEn || t.content,
                              nameZh: t.nameZh || match.nameZh || match.nameEn,
                              contentZh: t.contentZh || match.contentZh || match.contentEn,
                              remarkEn: t.remarkEn || match.remarkEn || '',
                              remarkZh: t.remarkZh || match.remarkZh || ''
                            });
                            updated++;
                          }
                        }
                        const reload = await templateAPI.getTemplates('edit');
                        if (reload && Array.isArray(reload.data)) {
                          const mapped = (reload.data || []).map((t: any) => ({ ...t, emoji: pickEmoji(t) }));
                          setEditingTemplates(mapped);
                          originalTemplatesRef.current = reload.data;
                        }
                        alert(`已合并双语元数据（前端修复）：${updated} 条`);
                      } catch (e) {
                        alert('合并失败');
                      }
                    };
                    try {
                      const r = await fetch('/api/templates/merge-bilingual', { method: 'POST' });
                      if (!r.ok) {
                        await doLocalMerge();
                        return;
                      }
                      const j = await r.json();
                      if (j?.success) {
                        alert(`已合并双语元数据：${j.data?.updated || 0} 条`);
                        const resp = await templateAPI.getTemplates('edit');
                        if (resp && Array.isArray(resp.data)) {
                          const mapped = (resp.data || []).map((t: any) => ({ ...t, emoji: pickEmoji(t) }));
                          setEditingTemplates(mapped);
                          originalTemplatesRef.current = resp.data;
                        }
                      } else {
                        await doLocalMerge();
                      }
                    } catch {
                      await doLocalMerge();
                    }
                  }}
                  className="px-3 py-1.5 text-sm bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] hover:bg-[rgba(var(--surface-2-rgb,15,23,42),0.6)] text-[var(--text-primary)] rounded"
                  title="修复已有英文模板，填充中文展示"
                >
                  合并双语(修复)
                </button>
              </div>
            </div>
          ) : activeMode === 'genTemplates' ? (
            <div>

              {/* 驱动 System Prompt（用于模板填充） */}
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <h5 className="text-sm font-medium text-[rgba(var(--text-primary-rgb),0.82)]">驱动 System Prompt（模板填充）</h5>
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:inline text-xs text-[rgba(var(--text-primary-rgb),0.5)] max-w-[40vw] truncate" title={genTemplateFiller}>{(genTemplateFiller || '').replace(/\s+/g,' ').slice(0, 120)}</span>
                    <button
                      type="button"
                      className="px-2 py-1 text-xs bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] hover:bg-[rgba(var(--surface-2-rgb,15,23,42),0.5)] text-[rgba(var(--text-primary-rgb),0.82)] rounded border border-[rgba(var(--text-primary-rgb),0.18)]"
                      onClick={() => setGenDriverOpen(v => !v)}
                    >{genDriverOpen ? '收起' : '展开编辑'}</button>
                    <button
                      type="button"
                      className="px-2 py-1 text-xs bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] hover:bg-[rgba(var(--surface-2-rgb,15,23,42),0.5)] text-[rgba(var(--text-primary-rgb),0.82)] rounded border border-[rgba(var(--text-primary-rgb),0.18)]"
                      title="恢复为后端默认文案（不影响其他设置）"
                      onClick={async () => {
                        try {
                          await uiAPI.updateSettings({ systemPromptTabsOrder: mainTabs.map(t => t.id), generationTemplateFillerSystemPrompt: '' });
                          const resp = await uiAPI.getSettings();
                          const filler = resp?.data?.generationTemplateFillerSystemPrompt || '';
                          setGenTemplateFiller(filler);
                          setTimeout(autosizeFiller, 0);
                          alert('已恢复为默认驱动 System Prompt');
                        } catch (e) { alert('恢复默认失败'); }
                      }}
                    >恢复默认</button>
                  </div>
                </div>
                {genDriverOpen && (
                  <div className="rounded border border-[rgba(var(--text-primary-rgb),0.12)]">
                    <textarea
                      value={genTemplateFiller}
                      ref={fillerRef}
                      onChange={(e) => { setGenTemplateFiller(e.target.value); setTimeout(autosizeFiller, 0); }}
                      onInput={autosizeFiller}
                      className="w-full p-2 border border-[rgba(var(--text-primary-rgb),0.12)] bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] text-[var(--text-primary)] placeholder:text-[rgba(var(--text-primary-rgb),0.45)] rounded focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)] text-sm min-h-[80px]"
                      placeholder="用于驱动6个生成模板的system prompt，在线微调后保存生效"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {loadingGenTemplates ? (
                  <div className="text-sm text-[rgba(var(--text-primary-rgb),0.5)] px-2">加载中...</div>
                ) : genTemplates.map((template, index) => (
                  <div key={`${template.id || 'new'}-${index}`} className="p-3 border border-[rgba(var(--text-primary-rgb),0.12)] rounded-lg">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col space-y-1">
                        <button className="px-2 py-1 text-xs bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] hover:bg-[rgba(var(--surface-2-rgb,15,23,42),0.5)] rounded" onClick={() => {
                          setGenTemplates(prev => {
                            if (index <= 0) return prev;
                            const next = [...prev];
                            const [m] = next.splice(index, 1);
                            next.splice(index - 1, 0, m);
                            return next;
                          });
                        }} title="上移">↑</button>
                        <button className="px-2 py-1 text-xs bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] hover:bg-[rgba(var(--surface-2-rgb,15,23,42),0.5)] rounded" onClick={() => {
                          setGenTemplates(prev => {
                            if (index >= prev.length - 1) return prev;
                            const next = [...prev];
                            const [m] = next.splice(index, 1);
                            next.splice(index + 1, 0, m);
                            return next;
                          });
                        }} title="下移">↓</button>
                      </div>
                      <div className="flex-1 space-y-2">
                        {/* 图标（与编辑快捷Prompt一致：选择器 + 自定义输入） */}
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[rgba(var(--text-primary-rgb),0.7)]">图标</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="px-2 py-1 rounded border border-[rgba(var(--text-primary-rgb),0.18)] bg-[var(--surface-card)] hover:bg-gray-50"
                              title="当前图标"
                            >{template.emoji || '🧩'}</button>
                            <button
                              type="button"
                              onClick={() => setOpenEmojiPickerIdx(openEmojiPickerIdx === index ? null : index)}
                              className="px-2 py-1 text-sm rounded border border-[rgba(var(--text-primary-rgb),0.18)] bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] text-[rgba(var(--text-primary-rgb),0.82)] hover:bg-[rgba(var(--surface-2-rgb,15,23,42),0.5)]"
                            >{openEmojiPickerIdx === index ? '关闭选择' : '选择图标'}</button>
                          </div>
                        </div>
                        {openEmojiPickerIdx === index && (
                          <div className="mt-2 p-2 rounded-lg border border-[rgba(var(--text-primary-rgb),0.12)] bg-[var(--surface-card)]">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {EMOJI_GROUPS.map((grp, gi) => (
                                <div key={`grp-gen-${gi}`} className="min-w-0">
                                  <div className="text-xs text-[rgba(var(--text-primary-rgb),0.6)] mb-1">{grp.label}</div>
                                  <div className="grid grid-cols-8 gap-1">
                                    {grp.items.map((em) => (
                                      <button
                                        key={`gen-${em}`}
                                        onClick={() => { setGenTemplates(prev => { const next=[...prev]; next[index]={...next[index], emoji: em}; return next; }); setOpenEmojiPickerIdx(null); }}
                                        className={`h-8 w-8 flex items-center justify-center rounded border ${
                                          (template.emoji || '🧩') === em ? 'border-blue-500 bg-blue-50' : 'border-[rgba(var(--text-primary-rgb),0.12)] hover:bg-gray-50'
                                        }`}
                                        title={em}
                                      >{em}</button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <span className="text-xs text-[rgba(var(--text-primary-rgb),0.7)]">自定义</span>
                              <input
                                type="text"
                                maxLength={3}
                                placeholder="粘贴任意 emoji 或符号"
                                defaultValue={template.emoji || ''}
                                className="px-2 py-1 text-sm border border-[rgba(var(--text-primary-rgb),0.18)] rounded w-40"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const val = (e.currentTarget as HTMLInputElement).value;
                                    setGenTemplates(prev => { const next=[...prev]; next[index]={...next[index], emoji: val || '🧩'}; return next; });
                                    setOpenEmojiPickerIdx(null);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="px-2 py-1 text-sm rounded border border-[rgba(var(--text-primary-rgb),0.18)] bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] text-[rgba(var(--text-primary-rgb),0.82)] hover:bg-[rgba(var(--surface-2-rgb,15,23,42),0.5)]"
                                onClick={(e) => {
                                  const input = (e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement | null);
                                  const val = input?.value || '';
                                  setGenTemplates(prev => { const next=[...prev]; next[index]={...next[index], emoji: val || '🧩'}; return next; });
                                  setOpenEmojiPickerIdx(null);
                                }}
                              >应用</button>
                            </div>
                          </div>
                        )}
                        {/* 名称/模板（中/英） */}
                        <input type="text" value={template.nameZh || template.name || ''} onChange={(e) => setGenTemplates(prev => { const n=[...prev]; n[index]={...n[index], nameZh: e.target.value}; return n; })} className="w-full px-2 py-1 text-sm border border-[rgba(var(--text-primary-rgb),0.18)] bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] text-[var(--text-primary)] placeholder:text-[rgba(var(--text-primary-rgb),0.45)] rounded focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)]" placeholder="中文名称" />
                        <textarea value={template.contentZh || template.content || template.prompt || ''} onChange={(e) => setGenTemplates(prev => { const n=[...prev]; n[index]={...n[index], contentZh: e.target.value}; return n; })} className="w-full px-2 py-1 text-sm border border-[rgba(var(--text-primary-rgb),0.18)] bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] text-[var(--text-primary)] placeholder:text-[rgba(var(--text-primary-rgb),0.45)] rounded focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)] h-16" placeholder="中文模板（严格按文档原文）" />
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            className="px-2 py-1 text-xs text-[rgba(var(--text-primary-rgb),0.7)] hover:text-[var(--text-primary)] bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] hover:bg-[rgba(var(--surface-2-rgb,15,23,42),0.5)] rounded"
                            onClick={() => setGenShowEn(prev => ({ ...prev, [String(index)]: !prev[String(index)] }))}
                          >{genShowEn[String(index)] ? '隐藏英文' : '显示英文'}</button>
                        </div>
                        {genShowEn[String(index)] && (
                          <>
                            <input type="text" value={template.nameEn || template.name || ''} onChange={(e) => setGenTemplates(prev => { const n=[...prev]; n[index]={...n[index], nameEn: e.target.value}; return n; })} className="w-full px-2 py-1 text-sm border border-[rgba(var(--text-primary-rgb),0.18)] bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] text-[var(--text-primary)] placeholder:text-[rgba(var(--text-primary-rgb),0.45)] rounded focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)]" placeholder="English Name" />
                            <textarea value={template.contentEn || template.content || template.prompt || ''} onChange={(e) => setGenTemplates(prev => { const n=[...prev]; n[index]={...n[index], contentEn: e.target.value}; return n; })} className="w-full px-2 py-1 text-sm border border-[rgba(var(--text-primary-rgb),0.18)] bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] text-[var(--text-primary)] placeholder:text-[rgba(var(--text-primary-rgb),0.45)] rounded focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)] h-16" placeholder="English Template (exact from docs)" />
                          </>
                        )}
                      </div>
                      <button onClick={() => setGenTemplates(prev => prev.filter((_, i) => i !== index))} className="px-2 py-1 text-red-600 hover:bg-red-50 rounded" title="删除模板">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : activeMode === 'recognition' ? (
            <div>
              {/* 子Tab：场景切换 */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center flex-wrap gap-2">
                  <button
                    className={`px-3 py-1.5 text-sm rounded border ${activeSceneIdx === 0 ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-[var(--surface-card)] border-[rgba(var(--text-primary-rgb),0.18)] text-[rgba(var(--text-primary-rgb),0.82)] hover:bg-gray-50'}`}
                    onClick={() => setActiveSceneIdx(0)}
                  >默认场景</button>
                  {recognitionScenarios.map((s, i) => (
                    <button
                      key={i}
                      className={`px-3 py-1.5 text-sm rounded border ${activeSceneIdx === i + 1 ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-[var(--surface-card)] border-[rgba(var(--text-primary-rgb),0.18)] text-[rgba(var(--text-primary-rgb),0.82)] hover:bg-gray-50'}`}
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
                  <div className="mb-2 text-sm text-[rgba(var(--text-primary-rgb),0.7)]">默认场景内容将作为“快捷指令”提供，并在分析无输入时自动激活。</div>
                  <MarkdownEditor
                    value={customRecognitionPrompt}
                    onChange={setCustomRecognitionPrompt}
                    placeholder="输入默认场景内容...（支持 Markdown / GFM 表格 / 任务列表）"
                    defaultMode="split"
                    minHeight={260}
                  />
                  <div className="mt-2 text-xs text-[rgba(var(--text-primary-rgb),0.6)]">字符数：{customRecognitionPrompt.length}</div>
                </>
              ) : (
                (() => {
                  const idx = activeSceneIdx - 1;
                  const scene = recognitionScenarios[idx] || { name: '', content: '' };
                  const isStoreScene = (scene.name || '').trim() === '门店识别场景';
                  return (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          value={scene.name}
                          onChange={(e) => setRecognitionScenarios(prev => { const next = [...prev]; next[idx] = { ...next[idx], name: e.target.value }; return next; })}
                          className={`w-48 px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500 ${isStoreScene ? 'bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] border-[rgba(var(--text-primary-rgb),0.18)] cursor-not-allowed' : 'border-[rgba(var(--text-primary-rgb),0.18)]'}`}
                          placeholder="场景名称"
                          disabled={isStoreScene}
                          title={isStoreScene ? '门店识别场景名称不可修改' : '场景名称'}
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
                            className="px-2 py-1 text-xs bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] hover:bg-[rgba(var(--surface-2-rgb,15,23,42),0.5)] rounded"
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
                            className="px-2 py-1 text-xs bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)] hover:bg-[rgba(var(--surface-2-rgb,15,23,42),0.5)] rounded"
                            title="下移"
                          >↓</button>
                        </div>
                        <button
                          onClick={() => { if (isStoreScene) return; setRecognitionScenarios(prev => prev.filter((_, i) => i !== idx)); setActiveSceneIdx(0); }}
                          className={`px-2 py-1 text-sm rounded ${isStoreScene ? 'text-[rgba(var(--text-primary-rgb),0.5)] cursor-not-allowed bg-[rgba(var(--surface-2-rgb,15,23,42),0.85)]' : 'text-red-600 hover:bg-red-50'}`}
                          disabled={isStoreScene}
                        >删除</button>
                      </div>
                      <MarkdownEditor
                        value={scene.content}
                        onChange={(val) => setRecognitionScenarios(prev => { const next = [...prev]; next[idx] = { ...next[idx], content: val }; return next; })}
                        placeholder="编写该场景的详细描述...（支持 Markdown / GFM 表格 / 任务列表）"
                        defaultMode="split"
                        minHeight={260}
                      />
                      <div className="mt-2 text-xs text-[rgba(var(--text-primary-rgb),0.6)]">字符数：{(scene.content || '').length}</div>
                    </div>
                  );
                })()
              )}
            </div>
          ) : (
            <div className="flex flex-col min-h-[60vh]">
              <div className="mb-3">
                <h4 className="text-md font-medium text-[rgba(var(--text-primary-rgb),0.82)] mb-2">
                  {activeMode === 'analysis' ? '图片编辑系统提示词' : '图片生成系统提示词'}
                </h4>
                <p className="text-sm text-[rgba(var(--text-primary-rgb),0.7)] mb-3">
                  {activeMode === 'analysis'
                    ? '用于指导AI分析图片并生成针对gemini-2.5-flash-image-preview的优化编辑指令'
                    : '用于指导AI如何优化文生图提示词，将简单描述转化为专业的视觉叙事描述'
                  }
                </p>
              </div>
              
              <textarea
                value={activeMode === 'analysis' ? customEditingPrompt : customGenerationPrompt}
                onChange={(e) => {
                  if (activeMode === 'analysis') {
                    setCustomEditingPrompt(e.target.value);
                  } else {
                    setCustomGenerationPrompt(e.target.value);
                  }
                }}
                placeholder={`输入${activeMode === 'analysis' ? '图片编辑' : '图片生成'}系统提示词...`}
                className="w-full flex-1 p-3 border border-[rgba(var(--text-primary-rgb),0.18)] bg-[rgba(var(--surface-2-rgb,15,23,42),0.92)] text-[var(--text-primary)] placeholder:text-[rgba(var(--text-primary-rgb),0.45)] rounded-lg resize-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] text-sm font-mono min-h-[40vh]"
              />
              
              <div className="mt-2 text-xs text-[rgba(var(--text-primary-rgb),0.6)]">
                字符数：{activeMode === 'analysis' ? customEditingPrompt.length : customGenerationPrompt.length}
              </div>
            </div>
          )}
          </div>
        </div>
        
        {/* 操作按钮（固定在底部，不参与滚动） */}
        <div className="flex justify-end items-center mt-2">
          <div className="flex space-x-2">
            <button onClick={onClose} className="px-4 py-2 bg-[rgba(var(--surface-2-rgb,15,23,42),0.65)] hover:bg-[rgba(var(--surface-2-rgb,15,23,42),0.45)] text-[rgba(var(--text-primary-rgb),0.82)] rounded">
              取消
            </button>
            <button
              onClick={async () => {
                // 统一保存：先保存模板，后保存识别设置，最后回调（以便现有逻辑写入localStorage并广播事件）
                await persistTemplates();
                await persistGenTemplates();
                const scenariosToPersist = ensureStoreScenario(recognitionScenarios);
                setRecognitionScenarios(scenariosToPersist);
                try {
                  await recognitionAPI.updateSettings({
                    customRecognitionPrompt,
                    recognitionScenarios: scenariosToPersist,
                  });
                } catch (e) {
                  console.warn('保存识别设置到服务器失败:', e);
                }
                try {
                  localStorage.setItem('customRecognitionPrompt', customRecognitionPrompt);
                  localStorage.setItem('customRecognitionScenarios', JSON.stringify(scenariosToPersist.map(s => `${s.name}: ${s.content}`)));
                  window.dispatchEvent(new Event('recognitionScenariosUpdated'));
                } catch (e) {
                  console.warn('写入本地图片识别场景失败:', e);
                }
                try {
                  await uiAPI.updateSettings({ systemPromptTabsOrder: mainTabs.map(t => t.id), generationTemplateFillerSystemPrompt: genTemplateFiller });
                } catch (e) {
                  console.warn('保存UI设置失败:', e);
                }
                // 额外：持久化系统提示词（跨浏览器生效）
                try {
                  const password = prompt('请输入模板管理密码以保存系统提示词');
                  if (password) {
                    await apiClient.post('/auth/system-prompts', {
                      password,
                      prompts: {
                        generation: customGenerationPrompt,
                        editing: customEditingPrompt,
                        analysis: customAnalysisPrompt,
                      }
                    });
                  }
                } catch (e) {
                  console.warn('保存系统提示词失败:', e);
                }
                onSave({
                  generation: customGenerationPrompt,
                  editing: customEditingPrompt,
                  analysis: customAnalysisPrompt,
                  recognition: customRecognitionPrompt,
                  recognitionScenarios: scenariosToPersist.map(s => `${s.name}: ${s.content}`)
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
