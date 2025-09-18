import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ImageEditResult, AspectRatioOption, ImageAnalysisResult } from '../types/index.ts';
import { AnalysisResult } from './AnalysisResult.tsx';
import { recognitionAPI, templateAPI } from '../services/api.ts';
import { evaluatePromptQuality } from '../utils/promptQuality.ts';
import { DEFAULT_RECOGNITION_PROMPT } from '../constants/recognitionDefaults.ts';
import { ModeToggle, AIMode } from './ModeToggle.tsx';
import { TemplateInfoBar } from './TemplateInfoBar.tsx';
import { DynamicInputArea } from './DynamicInputArea.tsx';
import { DraggableFloatingButton } from './DraggableFloatingButton.tsx';
import { DraggableActionButton } from './DraggableActionButton.tsx';
import { QuickTemplates } from './QuickTemplates.tsx';
import { MarkdownEditor } from './MarkdownEditor.tsx';


// 宽高比选项配置
const aspectRatioOptions: AspectRatioOption[] = [
  {
    id: '1024x1024',
    label: '方图',
    description: '1024×1024',
    width: 1024,
    height: 1024,
    icon: '🔲', // square button，清晰表达方图
    useCase: 'Square format'
  },
  {
    id: '1344x768',
    label: '横图',
    description: '1344×768',
    width: 1344,
    height: 768,
    icon: '🖼️', // framed picture，直观代表横向图片
    useCase: 'Landscape format'
  },
  {
    id: '768x1344',
    label: '竖图',
    description: '768×1344',
    width: 768,
    height: 1344,
    icon: '📱', // phone 竖屏形态
    useCase: 'Portrait format'
  }
];

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

interface IntegratedWorkflowProps {
  onProcessComplete: (result: ImageEditResult) => void;
  sessionId: string | null;
  isProcessing?: boolean;
  selectedMode?: AIMode;
  currentResult?: ImageEditResult | null;
  onClearResult?: () => void;
  onModeChange?: (mode: AIMode) => void;
  showSystemPromptModal?: boolean;
  onCloseSystemPromptModal?: () => void;
  onOpenSystemPromptModal?: () => void;
  onProcessStart?: () => void;
  onProcessError?: (error: string) => void;
  onToggleHistory?: () => void;
}

// 工具函数：URL转File
const urlToFile = async (url: string, filename: string): Promise<File> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type });
};

// 工具函数：DataURL转File
const dataURLtoFile = (dataurl: string, filename: string): File => {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
};

// 工具函数：保持原样（不强制添加 Markdown 标记）
const ensureMarkdown = (text: string): string => text;

export const IntegratedWorkflow: React.FC<IntegratedWorkflowProps> = ({
  onProcessComplete,
  sessionId,
  isProcessing = false,
  selectedMode = 'generate',
  currentResult,
  onClearResult,
  onModeChange,
  showSystemPromptModal = false,
  onCloseSystemPromptModal,
  onOpenSystemPromptModal,
  onProcessStart,
  onProcessError,
  onToggleHistory
}) => {
  // 默认场景兜底提示词（当本地与服务端均无配置时使用）
  const DEFAULT_RECOGNITION_PROMPT_FALLBACK = DEFAULT_RECOGNITION_PROMPT;
  // 状态管理
  const [mode, setMode] = useState<AIMode>(selectedMode);
  const [selectedRatio, setSelectedRatio] = useState<AspectRatioOption>(aspectRatioOptions[1]); // 默认选择横图
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number}[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isQuickTemplatePrompt, setIsQuickTemplatePrompt] = useState(false); // 标记：是否来自“编辑快捷Prompt”
  const [lastTemplatePick, setLastTemplatePick] = useState<{ display: string; english?: string } | null>(null);
  // 顶部信息条：展示最近选择的模板内容，生成完成后自动恢复按钮
  const [showTemplateInfoBar, setShowTemplateInfoBar] = useState(false);
  const [selectedTemplateInfo, setSelectedTemplateInfo] = useState<{ name?: string; emoji?: string; display: string; english?: string; remark?: string } | null>(null);
  // 生成模块：AI优化策略开关 Off/Suggest/Auto
  type GenOptimizeMode = 'off' | 'suggest';
  const [genOptimizeMode, setGenOptimizeMode] = useState<GenOptimizeMode>(() => {
    try {
      const v = localStorage.getItem('genOptimizeMode');
      if (v === 'off' || v === 'suggest') return v as GenOptimizeMode;
      return 'suggest';
    } catch { return 'suggest'; }
  });
  useEffect(() => { try { localStorage.setItem('genOptimizeMode', genOptimizeMode); } catch {} }, [genOptimizeMode]);
  const [genOptimizedBadge, setGenOptimizedBadge] = useState(false);
  const [genPrevPrompt, setGenPrevPrompt] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  // Prompt 元信息：来源与是否为用户编辑过
  const [promptMeta, setPromptMeta] = useState<{
    source: 'user' | 'template' | 'optimize';
    sceneKey?: string;
    edited: boolean;
    ts: number;
  } | null>(null);
  const lastAutoBySceneRef = useRef<Record<string, string>>({});
  // 模板填充中的等待状态与请求竞态控制
  const [isTemplateFilling, setIsTemplateFilling] = useState(false);
  const templateReqIdRef = useRef<number>(0);
  // 指令模板（编辑模式）
  const [editTemplates, setEditTemplates] = useState<any[]>([]);
  // 悬浮球已移除，面板常显（编辑模式）
  const [templatePanelOpen, setTemplatePanelOpen] = useState(true);
  // 记录当前选中的模板，用于高亮（优先使用后端id；无id则回退到渲染索引）
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null);

  // 同步左列高度到右列（用于超宽/4K下图片结果高度动态变化时）
  const [syncedLeftHeight, setSyncedLeftHeight] = useState<number | null>(null);
  const syncLeftHeightToRight = useCallback(() => {
    try {
      const right = rightColRef.current;
      if (!right) return;
      const isTwoCol = window.matchMedia('(min-width: 1024px)').matches; // lg 及以上为两列
      if (!isTwoCol) {
        setSyncedLeftHeight(null);
        return;
      }
      const rect = right.getBoundingClientRect();
      if (rect && rect.height > 0) {
        setSyncedLeftHeight(Math.round(rect.height));
      }
    } catch {}
  }, []);

  useEffect(() => {
    // 初始与窗口变化时同步
    const onResize = () => syncLeftHeightToRight();
    window.addEventListener('resize', onResize);
    const t = setTimeout(syncLeftHeightToRight, 50);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    };
  }, [syncLeftHeightToRight]);

  // 当仅左侧有图片而右侧无结果时，让右侧虚线框高度对齐左侧预览高度
  useEffect(() => {
    if (mode !== 'edit') return;
    if (currentResult) return; // 有结果时由内容自然撑开/已有逻辑处理
    const leftHost = leftColRef.current as any;
    if (!leftHost) return;
    const get = () => {
      try {
        const leftArea = leftHost?.querySelector?.('.image-preview-responsive') || leftHost;
        if (!leftArea) return;
        const rect = leftArea.getBoundingClientRect?.();
        const el = resultCardRef.current as any;
        if (rect && el) {
          // 直接设置右侧容器的最小高度以对齐
          el.style.minHeight = Math.max(320, Math.round(rect.height)) + 'px';
        }
      } catch {}
    };
    get();
    let ro: any = null;
    try {
      const RZ: any = (window as any).ResizeObserver;
      if (RZ) {
        ro = new RZ(() => get());
        const leftArea = leftHost?.querySelector?.('.image-preview-responsive') || leftHost;
        if (leftArea) ro.observe(leftArea);
      }
    } catch {}
    window.addEventListener('resize', get);
    const t = setTimeout(get, 80);
    return () => {
      try { ro && ro.disconnect && ro.disconnect(); } catch {}
      window.removeEventListener('resize', get);
      clearTimeout(t);
    };
  }, [mode, imagePreviews.length, currentResult]);

  useEffect(() => {
    // 结果区尺寸变化时同步（图片加载、模式切换等）
    if (!rightColRef.current) return;
    let ro: ResizeObserver | null = null;
    try {
      const RZ: any = (window as any).ResizeObserver;
      if (typeof RZ === 'function') {
        ro = new RZ(() => syncLeftHeightToRight());
        ro.observe(rightColRef.current);
      }
    } catch {}
    const t = setTimeout(syncLeftHeightToRight, 80);
    return () => { try { ro && ro.disconnect(); } catch {}; clearTimeout(t); };
  }, [currentResult, imagePreviews.length, mode, syncLeftHeightToRight]);
  // 面板展开方向与动画控制
  const [panelOpenDir, setPanelOpenDir] = useState<'left' | 'right'>('left');
  const [panelAnimReady, setPanelAnimReady] = useState(false);
  const leftColRef = useRef<HTMLDivElement | null>(null);
  const rightColRef = useRef<HTMLDivElement | null>(null);
  const promptContainerRef = useRef<HTMLDivElement | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; height: number; width: number }>({ top: 0, left: 0, height: 320, width: 256 });
  // Nano emoji fallback mapping by English title
  const nanoEmojiMap: Record<string, string> = {
    '3D Figurine': '🧍',
    'Funko Pop Figure': '📦',
    'LEGO Minifigure': '🧱',
    'Crochet Doll': '🧶',
    'Anime to Cosplay': '🎭',
    'Cute Plushie': '🧸',
    'Acrylic Keychain': '🔑',
    'HD Enhance': '🔍',
    'Pose Reference': '💃',
    'To Photorealistic': '🪄',
    'Fashion Magazine': '📸',
    'Hyper-realistic': '✨',
    'Architecture Model': '🏗️',
    'Product Render': '💡',
    'Soda Can Design': '🥤',
    'Industrial Design Render': '🛋️',
    'Color Palette Swap': '🎨',
    'Line Art Drawing': '✍🏻',
    'Painting Process': '🖼️',
    'Marker Sketch': '🖊️',
    'Add Illustration': '🧑‍🎨',
    'Cyberpunk': '🤖',
    'Van Gogh Style': '🌌',
    'Isolate & Enhance': '🎯',
    '3D Screen Effect': '📺',
    'Makeup Analysis': '💄',
    'Change Background': '🪩'
  };
  // 模块上传区隔离的缓存（编辑/分析）
  const [editCache, setEditCache] = useState<{ files: File[]; previews: string[]; dims: { width: number; height: number }[] }>({ files: [], previews: [], dims: [] });
  const [analyzeCache, setAnalyzeCache] = useState<{ files: File[]; previews: string[]; dims: { width: number; height: number }[] }>({ files: [], previews: [], dims: [] });
  
  // 图片预览模态框状态
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [previewImageTitle, setPreviewImageTitle] = useState('');
  const [previewImageType, setPreviewImageType] = useState<'before' | 'after'>('before');
  
  // 持续编辑模式状态
  const [isContinueEditMode, setIsContinueEditMode] = useState(false);
  const [continueEditPreviews, setContinueEditPreviews] = useState<string[]>([]);
  const [continueEditDimensions, setContinueEditDimensions] = useState<{width:number;height:number}[]>([]);
  const [resultDimensions, setResultDimensions] = useState<{width:number;height:number} | null>(null);
  const [singleImageHeight, setSingleImageHeight] = useState<number | null>(null);
  
  // 继续编辑模式下的新上传图片状态
  const [continueEditFiles, setContinueEditFiles] = useState<File[]>([]);
  const [continueEditFilePreviews, setContinueEditFilePreviews] = useState<string[]>([]);
  
  // 图片预览模态框状态
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    imageUrl: string;
    title: string;
  }>({
    isOpen: false,
    imageUrl: '',
    title: ''
  });
  
  // 错误结果显示状态（按模块隔离）
  type ErrorInfo = {
    type: 'policy_violation' | 'general_error';
    title: string;
    message: string;
    details?: string;
    originalResponse?: string;
    timestamp: number;
  } | null;
  const [errorByMode, setErrorByMode] = useState<Record<AIMode, ErrorInfo>>({ generate: null, edit: null, analyze: null });
  // 图片分析结果
  const [analysisResult, setAnalysisResult] = useState<ImageAnalysisResult | null>(null);
  const [isAnalyzingLocal, setIsAnalyzingLocal] = useState(false);
  const analysisStartRef = useRef<number | null>(null);
  // 分析编辑栏模式：初始化为“编辑”
  const [analyzeEditorMode, setAnalyzeEditorMode] = useState<'edit' | 'preview' | 'split'>('edit');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 上传目的地：左侧上传区 或 右侧持续编辑预览区
  const [uploadTarget, setUploadTarget] = useState<'left' | 'right'>('left');

  // 页面初始化时确定一个稳定的预览最大高度，避免图片加载导致布局跳动
  const [maxPreviewHeight, setMaxPreviewHeight] = useState<number>(420);
  const resultCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = resultCardRef.current;
    if (el) {
      const reserved = 120; // 标题/内边距/底部操作占位
      const h = el.clientHeight || 480;
      setMaxPreviewHeight(Math.max(240, h - reserved));
    } else if (typeof window !== 'undefined') {
      setMaxPreviewHeight(Math.max(240, Math.floor(window.innerHeight * 0.45)));
    }
  }, []);

  // 针对“4K 显示器 + 150% 系统缩放”下的特殊高度对齐
  // 该环境下 viewport 宽度通常在 2500px 左右，但低于我们自定义的 4k 断点（2559px），
  // 会导致左列（生成模式）仍为 675px，而右列已到 800px，从而出现左右不齐与中间空白。
  // 这里在该宽度区间内强制两列高度统一为 800px（仅此环境生效）。
  const [force800For4k150, setForce800For4k150] = useState(false);
  useEffect(() => {
    const check = () => {
      try {
        const w = window.innerWidth || 0;
        const h = window.innerHeight || 0;
        const dpr = (window.devicePixelRatio || 1);
        // 宽度在 2400~2600 且高度在 1200~1500，且 DPR 约在 1.4~1.6 之间（≈150% 缩放）
        const widthOk = w >= 2400 && w <= 2600;
        const heightOk = h >= 1200 && h <= 1500;
        const dprOk = dpr >= 1.4 && dpr <= 1.6;
        setForce800For4k150(widthOk && heightOk && dprOk);
      } catch {
        setForce800For4k150(false);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 加载编辑模板（双语优先）
  useEffect(() => {
    (async () => {
      try {
        const resp = await templateAPI.getTemplates('edit');
        if (resp?.success && Array.isArray(resp.data)) {
          setEditTemplates(resp.data);
        }
      } catch (e) {
        console.warn('加载编辑模板失败', e);
      }
    })();
  }, []);

  // 上传后展示悬浮球并自动展开一次（仅编辑模式）
  const prevUploadCountRef = useRef<number>(0);
  useEffect(() => {
    // 编辑模式下常显面板；非编辑模式隐藏
    setTemplatePanelOpen(mode === 'edit');
    prevUploadCountRef.current = uploadedFiles.length;
  }, [mode, uploadedFiles.length]);

  // 计算面板位置（右侧模式）：
  // - 若右侧已有结果图：面板贴在结果卡右侧，顶部对齐结果卡，底部对齐提示词容器
  // - 若右侧暂无结果图：面板显示在结果区域内部，顶部对齐结果卡；高度与左侧上传预览高度一致
  const computePanelPos = useCallback(() => {
    try {
      const host = rightColRef.current as any;
      const hostRect = host?.getBoundingClientRect?.();
      const resultRect = (resultCardRef.current as any)?.getBoundingClientRect?.();
      const promptRect = (promptContainerRef.current as any)?.getBoundingClientRect?.();
      const panelW = 256; // 16rem
      const gap = 4; // 外侧紧贴
      const baseTop = resultRect ? resultRect.top : (hostRect ? hostRect.top : 8);
      const top = hostRect ? Math.max(8, baseTop - hostRect.top) : 8;
      // 判断是否已有右侧结果图
      const hasRightImage = !!(currentResult && ((currentResult as any).resultType === 'image' || (currentResult as any).imageUrl || (currentResult as any).result));

      let left = 8;
      let height = 320;

      if (hostRect && resultRect) {
        if (hasRightImage) {
          // 外侧：紧贴结果卡右侧
          left = (resultRect.right - hostRect.left) + gap;
          // 高度：结果卡顶 → 提示词顶（避免覆盖到“输入提示词”区域，防止遮挡按钮点击）
          if (promptRect) {
            height = Math.max(180, Math.floor(promptRect.top - resultRect.top - gap));
          } else {
            height = Math.max(240, resultRect.height - gap);
          }
          setPanelOpenDir('right');
        } else {
          // 内侧：显示在结果区域内部，左侧对齐结果卡左边，稍作内边距
          const innerPad = 4;
          left = (resultRect.left - hostRect.left) + innerPad;
          // 高度：与左侧上传预览高度保持一致
          const leftHost = leftColRef.current as any;
          const leftArea = leftHost?.querySelector?.('.image-preview-responsive') || leftHost;
          const leftRect = leftArea?.getBoundingClientRect?.();
          if (leftRect) {
            height = Math.max(160, Math.floor(leftRect.height));
          } else {
            // 回退：使用结果区域的高度
            height = Math.max(160, Math.floor(resultRect.height));
          }
          setPanelOpenDir('right');
        }
      }

      setPanelPos({ top, left, height, width: panelW });
    } catch {
      setPanelPos({ top: 8, left: 8, height: 320, width: 256 });
    }
  }, [currentResult]);

  // 面板出现时触发入场动画（淡入 + 水平位移）
  useEffect(() => {
    if (templatePanelOpen) {
      setPanelAnimReady(false);
      const t = requestAnimationFrame(() => setPanelAnimReady(true));
      return () => cancelAnimationFrame(t);
    } else {
      setPanelAnimReady(false);
    }
  }, [templatePanelOpen, panelOpenDir]);

  // 是否应显示指令面板：编辑模式 且 左侧有图 或 右侧有图
  const showInstructionPanel = (
    mode === 'edit' && (
      (imagePreviews.length > 0) ||
      (!!currentResult && ((currentResult as any).resultType === 'image' || (currentResult as any).imageUrl))
    )
  );

  // 当指令面板不可见时，信息栏同步复原（避免遗留占位导致布局不一致）
  useEffect(() => {
    if (!showInstructionPanel) {
      setShowTemplateInfoBar(false);
    }
  }, [showInstructionPanel]);

  useEffect(() => {
    if (!showInstructionPanel) return;
    let rafId = 0;
    let tries = 0;
    const tick = () => {
      computePanelPos();
      const hostRect = (rightColRef.current as any)?.getBoundingClientRect?.();
      const resultRect = (resultCardRef.current as any)?.getBoundingClientRect?.();
      const ok = !!hostRect && !!resultRect && (resultRect.width || 0) > 0;
      if (!ok && tries < 20) {
        tries += 1;
        rafId = requestAnimationFrame(tick);
      }
    };
    tick();

    // 额外的延时重算，覆盖图片异步加载完成后的布局变化
    const t1 = setTimeout(computePanelPos, 120);
    const t2 = setTimeout(computePanelPos, 360);
    const t3 = setTimeout(computePanelPos, 800);

    // 监听窗口尺寸变化
    window.addEventListener('resize', computePanelPos);

    // 监听相关容器尺寸变化（结果卡、提示词容器、左侧上传区）
    const obs: ResizeObserver[] = [];
    try {
      const ro = (typeof ResizeObserver !== 'undefined') ? ResizeObserver : null;
      if (ro) {
        const addObs = (el: Element | null) => {
          if (!el) return;
          const o = new ro(() => computePanelPos());
          o.observe(el as Element);
          obs.push(o as any);
        };
        addObs(resultCardRef.current);
        addObs(promptContainerRef.current);
        const leftHost = leftColRef.current as any;
        const leftArea = leftHost?.querySelector?.('.image-preview-responsive') || leftHost;
        addObs(leftArea);
      }
    } catch {}

    return () => {
      window.removeEventListener('resize', computePanelPos);
      cancelAnimationFrame(rafId);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      obs.forEach(o => { try { (o as any).disconnect?.(); } catch {} });
    };
  }, [showInstructionPanel, templatePanelOpen, computePanelPos, uploadedFiles.length, currentResult]);

  // 当上传/结果/模式变化时，补一次位置计算，避免初次展开显示不全
  useEffect(() => {
    if (!showInstructionPanel) return;
    computePanelPos();
  }, [showInstructionPanel, imagePreviews.length, currentResult]);

  // 提示词按模块隔离：加载/保存到 sessionStorage
  // 加载：切换模块时读取该模块的提示词
  useEffect(() => {
    try {
      const key = `iwf:prompt:${mode}`;
      const saved = sessionStorage.getItem(key);
      if (typeof saved === 'string') setPrompt(saved);
    } catch {}
  }, [mode]);
  // 保存：仅在提示词变更时写入当前模块 key，避免切换模块时把上一个模块的提示词写入新模块
  const promptSaveModeRef = useRef<AIMode>(mode);
  useEffect(() => { promptSaveModeRef.current = mode; }, [mode]);
  useEffect(() => {
    try { sessionStorage.setItem(`iwf:prompt:${promptSaveModeRef.current}`, prompt); } catch {}
  }, [prompt]);

  // 当切换到“图像分析”模块时，默认展示“编辑”模式
  useEffect(() => {
    if (mode === 'analyze') {
      setAnalyzeEditorMode('edit');
    }
  }, [mode]);

  // 确保左侧图片尺寸完整：当通过迁移结果或其他途径设置了 imagePreviews 而未设置尺寸时，自动补齐尺寸
  useEffect(() => {
    if (mode !== 'edit') return;
    if (imagePreviews.length === 0) return;
    if (imageDimensions.length === imagePreviews.length) return;

    imagePreviews.forEach((src, idx) => {
      if (!imageDimensions[idx] && src) {
        const img = new Image();
        img.onload = () => {
          setImageDimensions(prev => {
            const next = [...prev];
            next[idx] = { width: img.width, height: img.height };
            return next;
          });
        };
        img.src = src;
      }
    });
  }, [mode, imagePreviews, imageDimensions]);

  // 图片预览方法
  const openImagePreview = useCallback((imageUrl: string, title: string, type: 'before' | 'after') => {
    setPreviewImageUrl(imageUrl);
    setPreviewImageTitle(title);
    setPreviewImageType(type);
    setShowImagePreview(true);
  }, []);
  // 左右切换预览：在键盘事件监听之前定义
  const switchPreviewImage = useCallback(() => {
    if (previewImageType === 'before' && currentResult && (currentResult as any)) {
      const afterSrc = (currentResult as any).result || (currentResult as any).imageUrl;
      if (!afterSrc) return;
      setPreviewImageUrl(afterSrc);
      setPreviewImageTitle('修改后');
      setPreviewImageType('after');
    } else if (previewImageType === 'after' && imagePreviews.length > 0) {
      setPreviewImageUrl(imagePreviews[0]);
      setPreviewImageTitle('修改前');
      setPreviewImageType('before');
    }
  }, [previewImageType, currentResult, imagePreviews]);
  // 预览层键盘交互：ESC 关闭；左右方向键切换前/后图
  useEffect(() => {
    if (!showImagePreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowImagePreview(false);
      } else if (e.key === 'ArrowRight' && previewImageType === 'before') {
        // 向右：从修改前 → 修改后
        switchPreviewImage();
      } else if (e.key === 'ArrowLeft' && previewImageType === 'after') {
        // 向左：从修改后 → 修改前
        switchPreviewImage();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showImagePreview, previewImageType, switchPreviewImage]);

  // 主按钮禁用逻辑（用于属性与样式一致）
  const primaryDisabled = (
    isProcessing ||
    isAnalyzingLocal ||
    ((mode !== 'analyze') && !prompt.trim()) ||
    (mode !== 'generate' && uploadedFiles.length === 0)
  );

  // 图片识别自定义场景（作为分析快捷指令）
  const [recognitionQuickScenarios, setRecognitionQuickScenarios] = useState<{ label: string; content: string }[]>([]);
  const loadRecognitionScenarios = useCallback(async () => {
    try {
      const raw = localStorage.getItem('customRecognitionScenarios');
      const savedDefault = localStorage.getItem('customRecognitionPrompt') || '';
      const defaultPrompt = (savedDefault && savedDefault.trim()) ? savedDefault : DEFAULT_RECOGNITION_PROMPT_FALLBACK;
      // 始终包含“默认场景”
      const base = [{ label: '默认场景', content: defaultPrompt }];
      if (!raw) { setRecognitionQuickScenarios(base); return; }
      const arr: string[] = JSON.parse(raw);
      if (!Array.isArray(arr)) { setRecognitionQuickScenarios(base); return; }
      const extras = arr.map((s) => {
        const [name, ...rest] = String(s).split(':');
        const label = (name || '').trim();
        const content = (rest.length ? rest.join(':') : name || '').trim();
        return { label: label || content || '场景', content };
      }).filter(x => x.content);
      setRecognitionQuickScenarios([...base, ...extras]);
    } catch { setRecognitionQuickScenarios([]); }
  }, []);

  useEffect(() => {
    // 先加载本地，然后总是请求一次服务器，确保跨设备同步
    (async () => {
      await loadRecognitionScenarios();
      try {
        const resp = await recognitionAPI.getSettings();
        if (resp?.success && resp.data) {
          const { customRecognitionPrompt, recognitionScenarios } = resp.data as any;
          const srvDefault = (customRecognitionPrompt && typeof customRecognitionPrompt === 'string' && customRecognitionPrompt.trim()) ? customRecognitionPrompt : DEFAULT_RECOGNITION_PROMPT_FALLBACK;
          try { localStorage.setItem('customRecognitionPrompt', srvDefault); } catch {}
          if (Array.isArray(recognitionScenarios)) {
            const arr = recognitionScenarios.map((s: any) => `${s.name || ''}: ${s.content || ''}`);
            try { localStorage.setItem('customRecognitionScenarios', JSON.stringify(arr)); } catch {}
          }
          // 合并并更新（包含“默认场景”）
          const base = [{ label: '默认场景', content: srvDefault }];
          const parsed = Array.isArray(recognitionScenarios) ? recognitionScenarios.map((s: any) => ({ label: s.name || '场景', content: s.content || '' })).filter((x: any) => x.content) : [];
          setRecognitionQuickScenarios([...base, ...parsed]);
        }
      } catch (e) {
        console.warn('回填识别设置失败:', e);
      }
    })();
    const handler = () => loadRecognitionScenarios();
    window.addEventListener('recognitionScenariosUpdated', handler as any);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('recognitionScenariosUpdated', handler as any);
      window.removeEventListener('storage', handler);
    };
  }, [loadRecognitionScenarios]);

  // 离开“图片生成”模块时，如当前提示词属于“模板自动填充且未编辑”，视为临时遗留并清空
  const prevModeRef = useRef<AIMode>(mode);
  useEffect(() => {
    const prev = prevModeRef.current;
    if (prev !== mode) {
      if (prev === 'generate' && promptMeta?.source === 'template' && promptMeta?.edited === false) {
        try { console.debug('[ModuleSwitch] clear auto-filled template when leaving generate', { prevMode: prev, nextMode: mode, prevMeta: promptMeta }); } catch {}
        setPrompt('');
        setPromptMeta(null);
      }
      prevModeRef.current = mode;
    }
  }, [mode, promptMeta]);

  // 条件对齐：当左右第一张图片的朝向相同（都为横图或都为竖图）时，仅对齐“第一张左图”的高度到右侧结果图高度；否则恢复默认（不强制设置）
  const alignHeightsIfSameOrientation = useCallback(() => {
    // 需要有结果图渲染出来
    const resultImg = document.getElementById('result-image') as HTMLImageElement | null;
    if (!resultImg) return;

    // 判断右侧朝向
    const r = resultDimensions;
    if (!r) return;
    const rightIsLandscape = r.width > r.height;

    // 只看第一张左侧图片的朝向
    if (imagePreviews.length === 0) return;
    if (!imageDimensions[0]) return;
    const leftFirstIsLandscape = imageDimensions[0].width > imageDimensions[0].height;
    const sameOrientation = leftFirstIsLandscape === rightIsLandscape;

    const firstOriginal = document.querySelector<HTMLImageElement>('.original-image');
    if (!firstOriginal) return;

    if (!sameOrientation) {
      // 恢复默认：只清除第一张左图内联高度，并确保顶部对齐
      const el = firstOriginal as unknown as HTMLElement;
      el.style.height = '';
      el.style.objectFit = 'contain';
      el.style.objectPosition = 'top center';
      return;
    }

    // 同步高度
    const h = resultImg.getBoundingClientRect().height;
    if (!h || h <= 0) return;
    const el = firstOriginal as unknown as HTMLElement;
    el.style.height = `${Math.round(h)}px`;
    el.style.objectFit = 'cover';
    el.style.objectPosition = 'top center';
  }, [resultDimensions, imagePreviews.length, imageDimensions]);

  // 在结果尺寸、左侧尺寸或数量变化、以及窗口缩放时进行一次条件对齐
  useEffect(() => {
    if (!currentResult) return;
    const cb = () => alignHeightsIfSameOrientation();
    const t = setTimeout(cb, 50);
    window.addEventListener('resize', cb);
    return () => { clearTimeout(t); window.removeEventListener('resize', cb); };
  }, [currentResult, alignHeightsIfSameOrientation]);


  const closeImagePreview = useCallback(() => {
    setShowImagePreview(false);
  }, []);

  // switchPreviewImage 已提前到键盘监听之前

  // 持续编辑处理
  const handleContinueEditing = useCallback(async () => {
    if (currentResult && currentResult.result) {
      if (isContinueEditMode) {
        // 用户手动退出持续编辑模式
        setContinueEditFiles([]);
        setContinueEditFilePreviews([]);
        setIsContinueEditMode(false);
        console.log('退出继续编辑模式');
      } else {
        // 激活继续编辑模式
        setIsContinueEditMode(true);
        setPrompt('');
        console.log('继续编辑模式已激活');
      }
    }
  }, [isContinueEditMode, currentResult]);

  // 模式切换处理
  const handleModeChange = useCallback(async (newMode: AIMode) => {
    const previousMode = mode;
    // 先保存当前模块的左侧上传区状态
    if (previousMode === 'edit') {
      setEditCache({ files: uploadedFiles, previews: imagePreviews, dims: imageDimensions });
    } else if (previousMode === 'analyze') {
      setAnalyzeCache({ files: uploadedFiles, previews: imagePreviews, dims: imageDimensions });
    }
    
    // 从生成模式切换到编辑模式时的自动迁移
    if (previousMode === 'generate' && newMode === 'edit' && currentResult?.imageUrl && editCache.files.length === 0 && editCache.previews.length === 0) {
      try {
        const file = await urlToFile(currentResult.imageUrl, 'generated-image.png');
        setUploadedFiles([file]);
        setImagePreviews([currentResult.imageUrl]);
        
        // 清空右侧结果
        onClearResult?.();
        
        console.log('已自动加载生成的图片到编辑模式');
      } catch (error) {
        console.error('图片迁移失败:', error);
      }
    }
    
    // 目标模块：恢复其缓存的左侧上传区状态（生成模块不使用上传，置空）
    if (newMode === 'edit') {
      setUploadedFiles(editCache.files);
      setImagePreviews(editCache.previews);
      setImageDimensions(editCache.dims);
    } else if (newMode === 'analyze') {
      setUploadedFiles(analyzeCache.files);
      setImagePreviews(analyzeCache.previews);
      setImageDimensions(analyzeCache.dims);
    } else {
      setUploadedFiles([]);
      setImagePreviews([]);
      setImageDimensions([]);
    }
    
    setMode(newMode);
    onModeChange?.(newMode);
  }, [mode, currentResult, onClearResult, onModeChange, uploadedFiles, imagePreviews, imageDimensions, editCache.files.length, editCache.previews.length, analyzeCache.files.length, analyzeCache.previews.length]);

  // 当父组件的 selectedMode 改变（底部按钮切换）时，触发内部切换逻辑
  useEffect(() => {
    if (mode !== selectedMode) {
      (async () => { await handleModeChange(selectedMode); })();
    }
  }, [selectedMode]);

  // 文件处理
  const handleFiles = useCallback((files: File[]) => {
    // 仅在分析模块下，选择新文件时清空分析结果；其他模块不影响分析结果
    if (mode === 'analyze') setAnalysisResult(null);
    const maxFiles = mode === 'edit' ? 2 : 1;
    const currentCount = uploadedFiles.length;
    const remainingSlots = maxFiles - currentCount;
    
    if (remainingSlots <= 0) return;
    
    const validFiles = files.slice(0, remainingSlots).filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) return;

    // 追加到现有文件
    const newUploadedFiles = [...uploadedFiles, ...validFiles];
    setUploadedFiles(newUploadedFiles);
    
    // 生成新的预览
    const newPreviews: string[] = [];
    const newDimensions: {width: number, height: number}[] = [];
    
    validFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        newPreviews[index] = result;
        
        const img = new Image();
        img.onload = () => {
          newDimensions[index] = { width: img.width, height: img.height };
          
          if (newPreviews.length === validFiles.length && newDimensions.length === validFiles.length) {
            // 追加到现有预览
            setImagePreviews(prev => [...prev, ...newPreviews]);
            setImageDimensions(prev => [...prev, ...newDimensions]);
          }
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    });
  }, [mode, uploadedFiles]);

  // 从 DataTransfer 提取网页图片 URL（支持 text/uri-list 与 text/html）
  const extractImageUrlsFromDataTransfer = (dt: DataTransfer): string[] => {
    const urls = new Set<string>();
    try {
      // 1) text/uri-list: 按行分割
      const uriList = dt.getData('text/uri-list');
      if (uriList) {
        uriList.split('\n').forEach(line => {
          const url = line.trim();
          if (url && !url.startsWith('#')) urls.add(url);
        });
      }
      // 2) text/plain: 可能直接是一个 URL
      const plain = dt.getData('text/plain');
      if (plain && /^https?:\/\//i.test(plain.trim())) {
        urls.add(plain.trim());
      }
      // 3) text/html: 提取 <img src="...">
      const html = dt.getData('text/html');
      if (html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const img = doc.querySelector('img');
        const href = doc.querySelector('a')?.getAttribute('href') || '';
        if (img?.getAttribute('src')) urls.add(img.getAttribute('src')!);
        if (href && /^https?:\/\//i.test(href)) urls.add(href);
      }
    } catch {}
    return Array.from(urls);
  };

  // 远程图片 URL 转 File（可能受 CORS 限制）
  const urlToImageFileSafe = async (url: string, fallbackName = 'image'): Promise<File | null> => {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) return null;
      const ext = blob.type.split('/')[1] || 'png';
      const nameFromUrl = (() => {
        try {
          const u = new URL(url);
          const base = u.pathname.split('/').pop() || '';
          if (base && base.includes('.')) return base;
        } catch {}
        return `${fallbackName}.${ext}`;
      })();
      return new File([blob], nameFromUrl, { type: blob.type });
    } catch (err) {
      console.warn('跨站图片拉取失败（可能被 CORS 限制）:', url, err);
      return null;
    }
  };

  // 拖拽处理
  const dragHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDrop: async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const dt = e.dataTransfer;
      const files = Array.from(dt.files);
      if (files.length > 0) {
        handleFiles(files);
        return;
      }
      // 处理从网页拖拽来的图片 URL
      const urls = extractImageUrlsFromDataTransfer(dt);
      if (urls.length === 0) return;
      const maxFiles = (mode === 'edit' ? 2 : 1) - uploadedFiles.length;
      if (maxFiles <= 0) return;
      const pick = urls.slice(0, maxFiles);
      const fetched: File[] = [];
      for (const u of pick) {
        const f = await urlToImageFileSafe(u);
        if (f) fetched.push(f);
      }
      if (fetched.length > 0) {
        handleFiles(fetched);
      } else {
        console.warn('未能获取到可上传的图片文件。可能来源站点未开启 CORS，建议“另存为”后再拖拽本地文件。');
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      if (uploadTarget === 'right' && isContinueEditMode) {
        // 持续编辑模式：处理右侧区域的新上传文件
        const newFiles = Array.from(files);
        const maxFiles = 2 - continueEditFiles.length;
        const validFiles = newFiles.slice(0, maxFiles).filter(file => file.type.startsWith('image/'));
        
        if (validFiles.length > 0) {
          setContinueEditFiles(prev => [...prev, ...validFiles]);
          
          // 生成预览并记录尺寸
          validFiles.forEach((file) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const dataUrl = ev.target?.result as string;
              setContinueEditFilePreviews(prev => [...prev, dataUrl]);
              const img = new Image();
              img.onload = () => {
                setContinueEditDimensions(prev => [...prev, { width: img.width, height: img.height }]);
              };
              img.src = dataUrl;
            };
            reader.readAsDataURL(file);
          });
        }
      } else {
        // 普通模式：处理左侧区域的文件
        handleFiles(Array.from(files));
      }
    }
    // 重置上传目标为左侧，避免下一次误判
    setUploadTarget('left');
  };

  // 替换指定索引的文件
  const handleFileReplace = useCallback((index: number, file: File) => {
    try {
      // 读取预览并测量尺寸
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          setUploadedFiles(prev => {
            const next = [...prev];
            next[index] = file;
            return next;
          });
          setImagePreviews(prev => {
            const next = [...prev];
            next[index] = dataUrl;
            return next;
          });
          setImageDimensions(prev => {
            const next = [...prev];
            next[index] = { width: img.width, height: img.height };
            return next;
          });
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.warn('替换图片失败:', e);
    }
  }, []);

  const handleFileRemove = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);
    const newDimensions = imageDimensions.filter((_, i) => i !== index);
    
    setUploadedFiles(newFiles);
    setImagePreviews(newPreviews);
    setImageDimensions(newDimensions);
    
    // 需求更新：在持续编辑下，只要左侧发生“删除”动作就自动退出持续编辑（无论剩余数量）
    if (isContinueEditMode) setIsContinueEditMode(false);
  };

  // 提示词优化功能
  // AI优化提示词：恢复原有逻辑（不接受额外参数）
  const handleOptimizePrompt = async (): Promise<string | undefined> => {
    if (!prompt.trim() || !sessionId) return;
    
    setIsPolishing(true);
    try {
      // 检查是否为编辑模式且有图片
      if (mode === 'edit' && (uploadedFiles.length > 0 || isContinueEditMode)) {
        
        // 创建FormData - 关键：正确传递图片
        const formData = new FormData();
        
        // 根据模式添加图片
        if (isContinueEditMode && currentResult) {
          // 继续编辑：将生成结果转为文件
          const resultFile = dataURLtoFile(currentResult.result, 'continue-edit-analysis.png');
          formData.append('images', resultFile);
          
          // 添加新上传的图片
          continueEditFiles.forEach((file) => {
            formData.append('images', file);
          });
        } else {
          // 普通模式：添加所有上传的图片
          uploadedFiles.forEach((file) => {
            formData.append('images', file);
          });
        }
        
        // 添加其他参数
        formData.append('sessionId', sessionId || '');
        formData.append('userInstruction', prompt.trim());
        formData.append('customSystemPrompt', systemPrompt || '');
        
        // 调用智能分析API
        const response = await fetch(`${API_BASE_URL}/edit/intelligent-analysis-editing`, {
          method: 'POST',
          body: formData, // 注意：不设置Content-Type，让浏览器自动设置
        });
        
        const result = await response.json();
        if (result.success) {
          setPrompt(ensureMarkdown(result.data.editPrompt)); // 更新提示词（带基础Markdown）
        } else {
          throw new Error(result.error || 'Optimization failed');
        }
        
      } else {
        // 无图片的传统优化流程
        const currentSystemPrompt = systemPrompt || (mode === 'generate' 
          ? `你是一位专业的AI图像生成提示词优化专家，专门为Gemini 2.5 Flash Image Preview优化文生图提示词。

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

请将输入转化为专业的、叙事驱动的提示词，遵循Gemini最佳实践。专注于场景描述和视觉叙事。只返回优化后的提示词，不要解释。`
          : `你是一位专业的AI图片编辑提示词优化专家，擅长为Gemini 2.5 Flash Image Preview生成精确的图片编辑指令。

请基于图片编辑最佳实践，优化用户的编辑指令，使其更加精确和专业。

## 优化重点
1. 明确编辑目标和范围
2. 保持原图的核心特征
3. 使用精确的编辑术语
4. 考虑视觉和谐性
5. 提供具体的修改指导

请优化编辑指令，使其更加专业和精确。只返回优化后的提示词，用中文输出。`);

        const response = await fetch(`${API_BASE_URL}/edit/polish-prompt`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId,
            originalPrompt: prompt,
            aspectRatio: selectedRatio.id,
            customSystemPrompt: currentSystemPrompt,
            promptType: mode === 'edit' ? 'editing' : 'generation'
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success && data.data?.polishedPrompt) {
          const polished = ensureMarkdown(data.data.polishedPrompt);
          setPrompt(polished);
          setPromptMeta({ source: 'optimize', edited: false, ts: Date.now() });
          return polished;
        }
      }
    } catch (error) {
      console.error('提示词优化失败:', error);
      alert(`优化失败: ${error.message}`);
    } finally {
      setIsPolishing(false);
    }
    return undefined;
  };

  // 生成模板应用：将所选模板作为 system prompt，走模板填充流程（不影响“AI优化提示词”按钮）
  const applyGenerationTemplate = async (
    templateSystemPrompt: string,
    sceneKey?: string,
    templateName?: string
  ): Promise<string | undefined> => {
    if (!sessionId) { alert('会话未初始化，请刷新页面重试'); return; }
    const myId = templateReqIdRef.current + 1;
    try {
      templateReqIdRef.current = myId;
      setIsTemplateFilling(true);
      try {
        // 调试：记录本次模板填充请求上下文
        console.log('[TemplateFill] start', {
          reqId: myId,
          sceneKey,
          templateName,
          hasSession: !!sessionId,
          prevMeta: promptMeta,
        });
      } catch {}
      // 将内部宽高比选项映射为常见AR以利于后端/模板描述
      const arMap: Record<string, string> = { '1024x1024': '1:1', '1344x768': '16:9', '768x1344': '9:16' };
      const ar = arMap[selectedRatio.id] || '1:1';
      try { console.log('[TemplateFill] request payload', { reqId: myId, ar, templateName, sceneKey, ignoreUserBrief: true }); } catch {}
      const response = await fetch(`${API_BASE_URL}/edit/polish-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          // 重要：模板填充不依赖用户输入，统一传空，避免旧内容影响新场景
          originalPrompt: '',
          aspectRatio: ar,
          customSystemPrompt: templateSystemPrompt,
          promptType: 'generation',
          useTemplateFiller: true,
          templateName: templateName || ''
        })
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (myId !== templateReqIdRef.current) {
        // 已有更新的请求在进行，丢弃本次结果
        try { console.warn('[TemplateFill] stale response discarded', { reqId: myId, currentReqId: templateReqIdRef.current }); } catch {}
        return undefined;
      }
      if (data.success && data.data?.polishedPrompt) {
        const generated = ensureMarkdown(data.data.polishedPrompt);
        try { console.log('[TemplateFill] success', { reqId: myId, length: generated?.length, head: (generated||'').slice(0, 80) }); } catch {}
        setPrompt(generated);
        setPromptMeta({ source: 'template', sceneKey, edited: false, ts: Date.now() });
        setGenOptimizedBadge(true);
        return generated;
      }
      try { console.warn('[TemplateFill] empty result', { reqId: myId, payloadKeys: Object.keys(data||{}) }); } catch {}
    } catch (e: any) {
      console.warn('生成模板应用失败:', e);
      try { console.error('[TemplateFill] error', { reqId: myId, message: e?.message || String(e) }); } catch {}
      alert(`模板应用失败: ${e?.message || e}`);
    } finally {
      // 仅当本请求仍是最新时，关闭加载态
      if (templateReqIdRef.current === myId) {
        try { console.log('[TemplateFill] end', { reqId: myId }); } catch {}
        setIsTemplateFilling(false);
      }
    }
    return undefined;
  };

  // 提交处理 - 使用原来的完整实现
  const handleSubmit = async () => {
    if (!sessionId) {
      alert('会话未初始化，请刷新页面重试');
      return;
    }

    if (mode !== 'analyze' && !prompt.trim()) {
      alert('请输入提示词');
      return;
    }

    // 智能编辑/分析模式下必须上传图片
    if ((mode === 'edit' || mode === 'analyze') && uploadedFiles.length === 0) {
      alert('智能编辑模式需要上传至少一张图片');
      return;
    }

    // 生成/编辑才通知父组件开始处理（分析模式不触发全局loading）
    if (mode !== 'analyze') {
      onProcessStart?.();
    }

    try {
      // 分析模式：直接走 /analyze/analyze-image
      if (mode === 'analyze') {
        setAnalysisResult(null);
        setIsAnalyzingLocal(true);
        analysisStartRef.current = Date.now();
        const formData = new FormData();
        formData.append('image', uploadedFiles[0]);
        formData.append('sessionId', sessionId);
        // 若无输入，自动使用“默认场景”作为分析提示词
        let userPrompt = prompt.trim();
        if (!userPrompt) {
          try {
            const localDefault = localStorage.getItem('customRecognitionPrompt') || '';
            userPrompt = (localDefault && localDefault.trim()) ? localDefault.trim() : DEFAULT_RECOGNITION_PROMPT_FALLBACK;
          } catch {
            userPrompt = DEFAULT_RECOGNITION_PROMPT_FALLBACK;
          }
        }
        if (userPrompt) {
          formData.append('prompt', userPrompt);
        }

        // 注入“图片分析 System Prompt”与场景（来自5次点击弹窗保存）
        try {
          const recPrompt = localStorage.getItem('customRecognitionPrompt');
          const recScenariosRaw = localStorage.getItem('customRecognitionScenarios');
          const scenarios: string[] = recScenariosRaw ? JSON.parse(recScenariosRaw) : [];
          const scenarioText = Array.isArray(scenarios) ? scenarios.join('\n') : '';
          if (recPrompt && recPrompt.trim()) formData.append('customSystemPrompt', recPrompt);
          if (scenarioText && scenarioText.trim()) formData.append('scenario', scenarioText);
        } catch (e) {
          console.warn('读取本地图片分析System Prompt失败:', e);
        }

        const response = await fetch(`${API_BASE_URL}/analyze/analyze-image`, {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          console.error('[Analyze] API error payload:', result);
          const extra = result.originalError ? ` | ${result.originalError}` : '';
          throw new Error((result.message || result.error || `HTTP ${response.status}: ${response.statusText}`) + extra);
        }

        const finalResult: ImageAnalysisResult = {
          ...result.data,
          imagePreview: imagePreviews[0],
        };
        setAnalysisResult(finalResult);
        // 保证最少显示 600ms 的运行效果
        const elapsed = analysisStartRef.current ? Date.now() - analysisStartRef.current : 0;
        const remain = Math.max(0, 600 - elapsed);
        setTimeout(() => setIsAnalyzingLocal(false), remain);
        // 分析模式不触发全局完成回调，避免“处理中”吐司残留或误提示
        return; // 分析流程到此结束
      }

      const formData = new FormData();
      
      // AI创作模式：如果没有上传图片，先生成背景图
      // 在生成模式提交前，依据策略判定是否需要优化
      let generationPromptToUse = prompt.trim();
      if (mode === 'generate') {
        const { score, reasons } = evaluatePromptQuality(generationPromptToUse);
        const needImprove = score < 60 && !/不要优化|勿优化|保持原样|按我写的来/.test(generationPromptToUse);
        if (genOptimizeMode === 'suggest' && needImprove) {
          try {
            setGenPrevPrompt(generationPromptToUse);
            const polished = await handleOptimizePrompt();
            if (polished) {
              generationPromptToUse = polished;
              setGenOptimizedBadge(true);
            }
          } catch (e) {
            console.warn('Optimize failed, continue with original');
          }
        }
      }

      if (mode === 'generate') {
        console.log(`🎨 生成背景图片: ${selectedRatio.width}x${selectedRatio.height} (${selectedRatio.label})`);
        
        // 生成对应宽高比的背景图片
        const canvas = document.createElement('canvas');
        canvas.width = selectedRatio.width;
        canvas.height = selectedRatio.height;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          // 创建渐变背景
          const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
          gradient.addColorStop(0, '#f8f9fa');
          gradient.addColorStop(1, '#e9ecef');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        // 等待 blob 生成完成
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, 'image/png');
        });
        
        if (blob) {
          const backgroundImage = new File([blob], 'background.png', { type: 'image/png' });
          formData.append('images', backgroundImage);
          
          // 校验生成的背景图尺寸
          console.log(`✅ 背景图片已生成:`, {
            expectedSize: `${selectedRatio.width}x${selectedRatio.height}`,
            actualCanvasSize: `${canvas.width}x${canvas.height}`,
            fileSize: `${(blob.size / 1024).toFixed(2)}KB`,
            aspectRatio: selectedRatio.id,
            label: selectedRatio.label
          });
        }
      } else {
        // 智能编辑模式下的图片处理
        if (mode === 'edit') {
          if (isContinueEditMode && currentResult) {
            // 继续编辑模式：使用生成结果作为主图片
            const resultFile = dataURLtoFile(currentResult.result || currentResult.imageUrl, 'continue-edit-source.png');
            formData.append('images', resultFile);
            
            // 如果有新上传的图片，也添加进去
            continueEditFiles.forEach((file) => {
              formData.append('images', file);
            });
            
            console.log(`继续编辑模式：使用生成结果作为源图片${continueEditFiles.length > 0 ? ` + ${continueEditFiles.length}张新上传图片` : ''}`);
          } else {
            // 普通编辑模式：使用用户上传的图片
            uploadedFiles.forEach((file) => {
              formData.append('images', file);
            });
          }
        } else {
          // 分析等其他模式：添加用户上传的图片
          uploadedFiles.forEach((file) => {
            formData.append('images', file);
          });
        }
      }
      
      formData.append('sessionId', sessionId);
      
      // 根据模式构建最终提示词：
      // - 生成模式：追加 --ar 比例参数
      // - 编辑模式：不追加 --ar；若来自“快捷指令”，按原样直传
      let finalPrompt = '';
      if (mode === 'generate') {
        const aspectRatioMap = {
          '1024x1024': '1:1',
          '1344x768': '16:9', 
          '768x1344': '9:16'
        } as const;
        const aspectRatioParam = `--ar ${aspectRatioMap[selectedRatio.id]}`;
        // 使用可能被自动/建议优化后的 prompt；将 --ar 放在后缀（更稳定）
        finalPrompt = `${generationPromptToUse} ${aspectRatioParam}`;
      } else {
        // 编辑模式：若选择的是模板且未改动（输入区仍等于模板中文展示文本），优先用英文模板调用模型
        const currentInput = prompt.trim();
        if (lastTemplatePick && currentInput === (lastTemplatePick.display || '').trim() && lastTemplatePick.english) {
          finalPrompt = lastTemplatePick.english.trim();
        } else {
          finalPrompt = currentInput;
        }
      }
      
      formData.append('prompt', finalPrompt);
      console.log('Final prompt with aspect ratio:', finalPrompt);
      
      // 移除发送给后端的分辨率/比例参数，避免干扰模型控制
      
      // 添加分析功能控制参数 - 智能编辑模式下默认启用
      // 图片编辑模块：永远直传原始内容，不做“分析+优化”
      formData.append('enableAnalysis', 'false');

      console.log('Submitting request to /edit/edit-images:', {
        mode,
        hasImages: uploadedFiles.length > 0 || (mode === 'generate'),
        finalPrompt
      });

      const response = await fetch(`${API_BASE_URL}/edit/edit-images`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      if (result.success) {
        console.log('✅ Processing completed:', result.data);
        // 清除当前模块的错误提示
        setErrorByMode(prev => ({ ...prev, [mode]: null }));
        
        // 将左侧输入图片打包到 inputImages.dataUrl，便于历史快速恢复
        const augmented = {
          ...result.data,
          inputImages: (isContinueEditMode || mode === 'edit')
            ? (imagePreviews || []).map((url) => ({ originalName: '', mimeType: '', size: 0, dataUrl: url }))
            : [],
        };
        
        // 如果是继续编辑模式，需要将上一次的结果移到左侧显示区域
        if (isContinueEditMode && currentResult) {
          try {
            // 将上一次的结果转换为File对象并设置为上传的文件
            const previousResultFile = dataURLtoFile(currentResult.result || currentResult.imageUrl, 'previous-result.png');
            const previewUrl = URL.createObjectURL(previousResultFile);
            
            setUploadedFiles([previousResultFile]);
            setImagePreviews([previewUrl]);
            
            console.log('继续编辑完成：上一次结果已移至左侧原图区域');
          } catch (error) {
            console.warn('移动上一次结果到左侧失败:', error);
          }

          // 关键：清空右侧继续编辑的临时图片，只保留新的结果图
          setContinueEditFiles([]);
          setContinueEditFilePreviews([]);
          setContinueEditDimensions([]);
        }
        
        onProcessComplete(augmented as any);
        // 生成完成：恢复顶部模式切换按钮
        setShowTemplateInfoBar(false);
      } else {
        throw new Error(result.message || 'Processing failed');
      }
      
    } catch (error) {
      console.error('处理失败:', error);
      const errorMessage = error instanceof Error ? error.message : '处理失败';
      
      // 检查是否是内容政策违规错误
      if (errorMessage.includes('Content policy violation')) {
        setErrorByMode(prev => ({ ...prev, [mode]: {
          type: 'policy_violation',
          title: '内容政策违规',
          message: '上传的图片或编辑指令不符合AI安全政策要求',
          details: '可能原因：\n• 图片包含敏感内容\n• 编辑指令涉及不当内容\n• 图片质量或格式问题\n\n建议：\n• 更换其他图片\n• 修改编辑指令\n• 检查图片是否清晰可识别',
          originalResponse: errorMessage,
          timestamp: Date.now()
        }}));
        
        // 清除当前结果，让错误信息显示在结果区域
        onClearResult?.();
      }
      // 检查是否是敏感词被拒绝的情况
      else if (errorMessage.includes("Sorry, I'm unable to help you with that.")) {
        setErrorByMode(prev => ({ ...prev, [mode]: {
          type: 'policy_violation',
          title: '内容被拒绝',
          message: '提示词包含敏感信息被AI拒绝',
          details: '建议：\n• 调整提示词内容\n• 避免使用可能被视为敏感的词汇\n• 尝试更换描述方式',
          originalResponse: errorMessage,
          timestamp: Date.now()
        }}));
        
        onClearResult?.();
      } else {
        // 其他错误显示在结果区域
        setErrorByMode(prev => ({ ...prev, [mode]: {
          type: 'general_error',
          title: 'AI处理失败',
          message: '图片生成过程中发生错误',
          details: '可能原因：\n• 网络连接问题\n• 服务器暂时不可用\n• 请求超时\n\n建议：\n• 检查网络连接\n• 稍后重试\n• 尝试简化提示词',
          originalResponse: errorMessage,
          timestamp: Date.now()
        }}));
        
        onClearResult?.();
      }
      
      onProcessError?.(errorMessage);
      const elapsed = analysisStartRef.current ? Date.now() - analysisStartRef.current : 0;
      const remain = Math.max(0, 600 - elapsed);
      setTimeout(() => setIsAnalyzingLocal(false), remain);
    }
  };

  return (
    <div className="space-y-4 xl:space-y-6">
      {/* 顶部区域：若选择了模板，则临时作为信息展示框；生成后恢复为模式切换 */}
      {mode === 'edit' && showTemplateInfoBar && selectedTemplateInfo ? (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <TemplateInfoBar info={selectedTemplateInfo} />
          </div>
        </div>
      ) : (
        <ModeToggle
          selectedMode={mode}
          onModeChange={handleModeChange}
          isProcessing={isProcessing}
        />
      )}
      
      {/* 上半部分：输入区域和结果展示 */}
      <div className={`grid grid-cols-1 gap-4 xl:gap-6 items-stretch ${
        mode === 'generate' 
          ? 'lg:grid-cols-5 lg:h-[675px] ultrawide:h-[675px] 4k:h-[800px]' // 生成：两列总高固定到 675（4K特例 800）
          : mode === 'analyze' 
          ? 'lg:grid-cols-5 lg:h-[675px] ultrawide:h-[675px] 4k:h-[800px]' // 分析：同上
          : 'lg:grid-cols-2' // 编辑模式：1:1 比例，不强制总高
      }`}>
        {/* 左侧：动态输入区域（相对定位以托管悬浮面板） */}
        <div
          ref={leftColRef}
          className={`relative overflow-visible ${
            mode === 'generate'
              ? 'h-auto lg:h-[675px] 2xl:h-[675px] 3xl:h-[675px] ultrawide:h-[675px] 4k:h-[800px]'
              : 'min-h-[480px] xl:min-h-[520px] 2xl:min-h-[700px] 3xl:min-h-[800px] 4k:min-h-[800px] ultrawide:min-h-[700px]'
          } lg:col-span-1`}
          style={force800For4k150 ? (mode === 'generate' ? { height: 800, minHeight: 800 } : { minHeight: 800 }) : undefined}
        >
          {/* 生成模式：六大场景已接入 UnifiedWorkflow 画布区；此处不再渲染 */}
          {/* 悬浮球和面板：移至右侧结果区 */}
          <DynamicInputArea
            mode={mode}
            selectedRatio={selectedRatio}
            onRatioChange={setSelectedRatio}
            aspectRatioOptions={aspectRatioOptions}
            uploadedFiles={uploadedFiles}
            imagePreviews={imagePreviews}
            onFilesUploaded={handleFiles}
            onFileRemove={handleFileRemove}
            onFileReplace={handleFileReplace}
            onClearAll={() => {
              // 清理所有预览URL以避免内存泄漏
              imagePreviews.forEach(preview => {
                if (preview && preview.startsWith('blob:')) {
                  URL.revokeObjectURL(preview);
                }
              });
              
              setUploadedFiles([]);
              setImagePreviews([]);
              // 同步清理当前模块的左侧上传区缓存（不影响其他模块）
              if (mode === 'edit') {
                setEditCache({ files: [], previews: [], dims: [] });
              } else if (mode === 'analyze') {
                setAnalyzeCache({ files: [], previews: [], dims: [] });
              }
              // 不自动清空提示词，让用户手动控制
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
              
              // 清除所有时也应该退出持续编辑模式
              setIsContinueEditMode(false);
              setContinueEditFiles([]);
              setContinueEditFilePreviews([]);
            }}
            dragActive={dragActive}
            onDragHandlers={dragHandlers}
            fileInputRef={fileInputRef}
            onFileInputChange={handleFileInputChange}
            onRequestUploadLeft={() => {
              setUploadTarget('left');
              fileInputRef.current?.click();
            }}
            showBeforeBadge={!!currentResult}
            isSubmitting={isProcessing}
            isProcessing={isProcessing}
            onImagePreview={openImagePreview}
            maxPreviewHeight={maxPreviewHeight}
            highlight={mode === 'edit' && !isContinueEditMode && imagePreviews.length > 0 && !!currentResult}
            onToggleHistory={onToggleHistory}
            // 生成模式：上移六大场景到画布选择区
            onSelectGenerateTemplate={async (pick) => {
              try { console.log('[TemplateClick]', { pick }); } catch {}
              if (isTemplateFilling) return;
              const sceneKey = pick.id || pick.name || pick.nameZh || pick.nameEn || (pick.english || pick.display);
              if (promptMeta?.source === 'template' && promptMeta?.edited === false && promptMeta?.sceneKey && promptMeta.sceneKey !== sceneKey) {
                try { console.log('[TemplateClick] clear previous auto-filled template due to scene change', { prevMeta: promptMeta, nextSceneKey: sceneKey }); } catch {}
                setPrompt('');
              }
              const templateName = pick.nameEn || pick.nameZh || pick.name || undefined;
              const ok = await applyGenerationTemplate(pick.english || pick.display, sceneKey || undefined, templateName);
              if (ok) {
                setSelectedTemplateInfo({ name: '生成模板', emoji: '⚡', display: pick.display, english: pick.english });
                setShowTemplateInfoBar(true);
              }
            }}
            isTemplateFilling={isTemplateFilling}
          />
          {/* 生成模式：左侧不渲染额外底部操作按钮，保留外部（左侧既有三按钮位）控制右侧 */}
        </div>
        
        {/* 右侧：结果展示（承载指令面板） */}
        <div
          ref={rightColRef}
          className={`relative overflow-visible min-h-[480px] xl:min-h-[520px] 2xl:min-h-[700px] 3xl:min-h-[800px] ultrawide:min-h-[675px] 4k:min-h-[800px] ${
            mode === 'generate' ? 'lg:col-span-4' : mode === 'analyze' ? 'lg:col-span-4' : 'lg:col-span-1'
          }`}
          style={force800For4k150 ? { minHeight: 800 } : undefined}
        >
          {showInstructionPanel && (
            <div
              className={`no-scrollbar overflow-auto rounded-lg pt-0 px-2 pb-2 transition-all duration-200 ease-out transform will-change-transform ${
                panelAnimReady ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'
              }`}
              style={{
                position: 'absolute',
                top: panelPos.top,
                left: panelPos.left,
                width: panelPos.width,
                height: panelPos.height,
                background: 'transparent',
                border: 'none',
                borderRadius: '0.5rem',
                zIndex: 30
              }}
            >
              <div className="grid grid-cols-1 gap-1 pr-1">
                {editTemplates.slice(0, 30).map((t: any, idx: number) => (
                  <button
                    key={t.id || idx}
                    onClick={() => {
                      const zh = t.contentZh || t.content || t.prompt || '';
                      const en = t.contentEn || t.content || t.prompt || '';
                      setIsQuickTemplatePrompt(true);
                      setPrompt(zh);
                      setLastTemplatePick({ display: zh, english: en });
                      // 将顶部切换区临时作为“信息展示框”使用
                      const title = t.nameZh || t.name || '模板';
                      const emoji = t.emoji || nanoEmojiMap[(t.nameEn || t.name || '').trim()] || '🧩';
                      const remark = t.remark || '';
                      setSelectedTemplateInfo({ name: title, emoji, display: zh, english: en, remark });
                      setShowTemplateInfoBar(true);
                      const key = String(t.id || idx);
                      setSelectedTemplateKey(key);
                    }}
                    aria-pressed={selectedTemplateKey === String(t.id || idx) ? true : false}
                    className={`inline-flex w-fit items-center gap-2 px-1 py-0.5 rounded text-left transition-colors ${
                      selectedTemplateKey === String(t.id || idx)
                        ? 'bg-white/80'
                        : 'bg-transparent hover:bg-white/50'
                    }`}
                    title={(t.contentZh || t.content || '').slice(0, 160)}
                  >
                    <span className={`inline-block px-1.5 py-0.5 rounded text-base ${
                      selectedTemplateKey === String(t.id || idx) ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-900'
                    }`}>{t.emoji || nanoEmojiMap[(t.nameEn || t.name || '').trim()] || '🧩'}</span>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-sm truncate ${
                      selectedTemplateKey === String(t.id || idx) ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-900'
                    }`}>{t.nameZh || t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {mode === 'edit' && (imagePreviews.length > 0 || isContinueEditMode || !!currentResult) ? (
            // 编辑模式：显示修改后区域
            <div ref={resultCardRef} className={`group relative border-2 border-dashed rounded-lg overflow-hidden bg-gray-50 flex-1 flex flex-col min-h-[480px] ${
              isContinueEditMode ? 'border-orange-400' : 'border-gray-200'
            }`} style={(force800For4k150
              ? { minHeight: 800 }
              : (imagePreviews.length > 0 && !currentResult ? (() => {
                  try {
                    const leftHost = leftColRef.current as any;
                    const leftArea = leftHost?.querySelector?.('.image-preview-responsive') || leftHost;
                    const rect = leftArea?.getBoundingClientRect?.();
                    return rect ? { minHeight: Math.max(320, Math.round(rect.height)) } : undefined;
                  } catch (e) { return undefined; }
                })() : undefined)
            }>
              {/* 顶部浮层标题：
                 - 修改中…：持续编辑时可见（悬停显示）
                 - 修改后：仅当右侧已有生成结果图时在悬停显示 */}
              {isContinueEditMode ? (
                <div className="absolute top-2 left-2 z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <span className="inline-block text-white text-sm px-2.5 py-1 rounded bg-orange-500/80">修改中…</span>
                </div>
              ) : ((currentResult && ((currentResult as any).resultType === 'image' || (currentResult as any).imageUrl || (currentResult as any).result)) ? (
                <div className="absolute top-2 left-2 z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <span className="inline-block text-white text-sm px-2.5 py-1 rounded bg-black/60">修改后</span>
                </div>
              ) : null)}
              
              {/* 顶部右侧浮层操作（上传 / 清除所有 / 下载 / 持续编辑） */}
              {currentResult && (
                <div className="absolute top-2 right-2 z-20 flex items-center space-x-2 pointer-events-none">
                  {/* 右侧上传按钮（仅持续编辑时生效） */}
                  <button
                    type="button"
                    className={`pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center transition-colors shadow ${
                      isContinueEditMode ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                    onClick={() => {
                      if (isContinueEditMode) {
                        setUploadTarget('right');
                        fileInputRef.current?.click();
                      }
                    }}
                    disabled={!isContinueEditMode || isProcessing}
                    title={!isContinueEditMode ? '请先开启持续编辑' : '上传新图片参与编辑'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>

                  {/* 清除所有右侧临时图片（任何情况下都可点击，并同时退出持续编辑） */}
                  <button
                    type="button"
                    className="pointer-events-auto w-9 h-9 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow"
                    onClick={() => {
                      setContinueEditFiles([]);
                      setContinueEditFilePreviews([]);
                      setContinueEditDimensions([]);
                      setIsContinueEditMode(false);
                      // 同时清除右侧生成结果
                      onClearResult?.();
                      setResultDimensions(null);
                    }}
                    title="清除所有（右侧临时图片）"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  {(currentResult.resultType === 'image' || currentResult.imageUrl) && (
                    <a
                      href={currentResult.result || currentResult.imageUrl}
                      download="generated-image.png"
                      className="pointer-events-auto w-9 h-9 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors shadow"
                      title="下载图片"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </a>
                  )}
                  <button
                    onClick={handleContinueEditing}
                    className="pointer-events-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-200 bg-white/80 hover:bg-white shadow-sm"
                    title={isContinueEditMode ? '点击退出持续编辑模式' : '点击进入持续编辑模式'}
                  >
                    <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                      isContinueEditMode ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                        isContinueEditMode ? 'translate-x-4' : 'translate-x-1'
                      }`} />
                    </div>
                    <span className={`text-xs sm:text-sm ${isContinueEditMode ? 'text-emerald-700' : 'text-gray-700'}`}>持续编辑</span>
                  </button>
                </div>
              )}
              
              {currentResult ? (
                <>
                  {/* 图片显示区域（统一双图并列风格） */}
                  <div className="flex-1 p-0 h-full">
                    {isContinueEditMode && continueEditFilePreviews.length > 0 ? (
                      <div className={`grid gap-2 h-full ${(() => {
                        const total = 1 + continueEditFilePreviews.length;
                        if (total === 2 && resultDimensions && continueEditDimensions.length >= 1) {
                          const bothLandscape = resultDimensions.width > resultDimensions.height &&
                            continueEditDimensions[0].width > continueEditDimensions[0].height;
                          return bothLandscape ? 'grid-cols-1' : 'grid-cols-2';
                        }
                        return total === 1 ? 'grid-cols-1' : 'grid-cols-2';
                      })()}`}>
                        {/* 第一项：当前结果 */}
                        <div className="relative group" onClick={() => openImagePreview(currentResult.result || currentResult.imageUrl, '修改后', 'after')}>
                          <div
                            className="w-full overflow-hidden bg-gray-100 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-center"
                          >
                            {currentResult.resultType === 'image' ? (
                              <img
                                id="result-image"
                                src={currentResult.result || currentResult.imageUrl}
                                alt="生成的图片"
                                className="w-full h-full object-contain hover:scale-105 transition-transform duration-200"
                                onLoad={(e) => {
                                  const img = e.currentTarget;
                                  setResultDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                                  // 结果图加载后，按需对齐左右高度（仅在左右朝向一致时）
                                  setTimeout(() => alignHeightsIfSameOrientation(), 0);
                                }}
                              />
                            ) : (
                              <div className="p-6 min-h-[200px] flex items-center justify-center">
                                <div className="text-gray-700 text-sm whitespace-pre-wrap text-center max-w-full">
                                  {currentResult.result}
                                </div>
                              </div>
                            )}
                          </div>
                          {currentResult.resultType !== 'image' && (
                            <div className="absolute top-2 left-2 bg-blue-500/80 text-white text-xs px-2 py-1 rounded pointer-events-none">
                              AI回复
                            </div>
                          )}
                          {/* 移除编辑右侧的生成完成时间标记 */}
                        </div>

                        {/* 后续项：新上传图片 */}
                        {continueEditFilePreviews.map((preview, index) => (
                          <div key={index} className="relative group">
                            <div
                              className="w-full overflow-hidden bg-gray-100 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-center"
                              onClick={() => openImagePreview(preview, '新上传图片', 'before')}
                              title="点击预览新上传图片"
                            >
                              <img
                                src={preview}
                                alt={`新上传 ${index + 1}`}
                                className="w-full h-full object-contain hover:scale-105 transition-transform duration-200"
                              />
                            </div>
                            <button
                              onClick={() => {
                                setContinueEditFiles(prev => prev.filter((_, i) => i !== index));
                                setContinueEditFilePreviews(prev => prev.filter((_, i) => i !== index));
                              }}
                              className="absolute top-2 right-2 bg-red-500 text-white w-9 h-9 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600 shadow-lg flex items-center justify-center"
                              title="删除图片"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                            <div className="absolute top-2 left-2 bg-orange-500/80 text-white text-xs px-2 py-1 rounded pointer-events-none">
                              新上传
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                          <div className="relative" onClick={() => openImagePreview(currentResult.result || currentResult.imageUrl, '修改后', 'after')}>
                            <div
                          className="w-full h-full overflow-hidden bg-gray-100 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-center"
                          >
                          {currentResult.resultType === 'image' ? (
                            <img
                              id="result-image"
                              src={currentResult.result || currentResult.imageUrl}
                              alt="生成的图片"
                              className="w-full h-full object-contain hover:scale-105 transition-transform duration-200"
                              onLoad={() => setTimeout(() => alignHeightsIfSameOrientation(), 0)}
                            />
                          ) : (
                            <div className="p-6 min-h-[200px] flex items-center justify-center">
                              <div className="text-gray-700 text-sm whitespace-pre-wrap text-center max-w-full">
                                {currentResult.result}
                              </div>
                            </div>
                          )}
                        </div>
                        {currentResult.resultType !== 'image' && (
                          <div className="absolute top-2 left-2 bg-blue-500/80 text-white text-xs px-2 py-1 rounded pointer-events-none">
                            AI回复
                          </div>
                        )}
                        {/* 移除编辑右侧的生成完成时间标记 */}
                      </div>
                    )}
                  </div>
                
                  {/* 底部操作条已移除，按钮已上移为浮层 */}
                </>
              ) : (
                <div className="flex-1" style={force800For4k150 ? { minHeight: 800 } : undefined} />
              )}
            </div>
          ) : (mode === 'analyze' && analysisResult) ? (
            <div className="bg-white rounded-lg border border-gray-200" style={force800For4k150 ? { minHeight: 800 } : undefined}>
              <AnalysisResult
                result={analysisResult}
                onClose={() => setAnalysisResult(null)}
              />
            </div>
          ) : (mode === 'generate' && currentResult) ? (
            // 生成模式：画布结果（hover 删除 / 点击放大 / ESC关闭）
            <div className="bg-white rounded-lg border border-gray-200 flex flex-col" style={force800For4k150 ? { height: 800, minHeight: 800 } : undefined}>
              <div className="p-6 flex items-center justify-center">
                <div className="relative group">
                  {(currentResult as any).resultType === 'image' ? (
                    <img data-pane-img
                      src={(currentResult as any).result || (currentResult as any).imageUrl}
                      alt="生成结果"
                      className="max-w-full max-h-[675px] ultrawide:max-h-[675px] 4k:max-h-[800px] object-contain rounded-lg shadow-sm cursor-pointer transition-transform duration-200 group-hover:scale-[1.01]"
                      style={force800For4k150 ? { maxHeight: 800 } : undefined}
                      onClick={() => openImagePreview((currentResult as any).result || (currentResult as any).imageUrl, '生成结果', 'after')}
                    />
                  ) : (
                    <div className="p-6 min-h-[200px] flex items-center justify-center" style={force800For4k150 ? { minHeight: 800 } : undefined}>
                      <div className="text-gray-700 text-sm whitespace-pre-wrap text-center max-w-full">
                        {(currentResult as any).result}
                      </div>
                    </div>
                  )}
                  {/* 右上角操作条：下载 / 转入编辑（删除按钮已移除） */}
                  <div className="absolute top-2 right-2 z-20 flex items-center space-x-2 pointer-events-none">
                    {/* 下载 - 绿色圆形 */}
                    <a
                      href={(currentResult as any).result || (currentResult as any).imageUrl}
                      download="generated-image.png"
                      className="pointer-events-auto w-9 h-9 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors shadow"
                      title="下载图片"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </a>
                    {/* 转入编辑 - 白底紫边圆形 */}
                    <button
                      type="button"
                      className="pointer-events-auto w-9 h-9 bg-white border-2 border-purple-500 text-purple-600 hover:bg-purple-50 rounded-full flex items-center justify-center transition-colors shadow"
                      title="转入编辑"
                      onClick={async () => {
                        try {
                          const src: string = (currentResult as any).result || (currentResult as any).imageUrl;
                          if (!src) return;
                          let file: File;
                          let previewUrl: string;
                          if (src.startsWith('data:')) {
                            file = dataURLtoFile(src, 'generated-image.png');
                            previewUrl = src;
                          } else {
                            file = await urlToFile(src, 'generated-image.png');
                            previewUrl = URL.createObjectURL(file);
                          }
                          setUploadedFiles([file]);
                          setImagePreviews([previewUrl]);
                          setMode('edit');
                          onModeChange?.('edit');
                        } catch (e) {
                          console.error('转入编辑失败:', e);
                        }
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    {/* 删除按钮已移除：生成结果不提供清除操作 */}
                  </div>
                </div>
              </div>
            </div>
          ) : (() => { const errorResult = errorByMode[mode]; return !!errorResult; })() ? (
            // 仅显示当前模块的错误，不影响其他模块
            // 错误结果显示
            <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
              <div className="flex-1 p-6 flex items-center justify-center">
                <div className="text-center space-y-4 max-w-md">
                  {/* 错误图标 */}
                  <div className="text-red-400 mb-4">
                    <svg className="mx-auto h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z"
                      />
                    </svg>
                  </div>
                  
                  {/* 错误标题 */}
                  <div>
                    <h3 className="text-lg font-medium text-red-800 mb-2">
                      ⚠️ {errorByMode[mode]?.title}
                    </h3>
                    <p className="text-red-700 text-sm mb-4">
                      {errorByMode[mode]?.message}
                    </p>
                  </div>
                  
                  {/* 错误详情 */}
                  {errorByMode[mode]?.details && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left">
                      <div className="text-sm text-red-800 whitespace-pre-line">
                        {errorByMode[mode]?.details}
                      </div>
                    </div>
                  )}
                  
                  {/* AI原始回复 */}
                  {errorByMode[mode]?.originalResponse && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-left">
                      <div className="text-xs text-gray-600 mb-2 font-medium">AI原始回复：</div>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap">
                        {errorByMode[mode]?.originalResponse}
                      </div>
                    </div>
                  )}
                  
                  {/* 清除错误按钮 */}
                  <button
                    onClick={() => setErrorByMode(prev => ({ ...prev, [mode]: null }))}
                    className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm"
                  >
                    清除错误信息
                  </button>
                  
                  {/* 时间戳 */}
                  <div className="text-xs text-gray-500">
                    失败时间：{errorByMode[mode]?.timestamp ? new Date(errorByMode[mode]!.timestamp).toLocaleTimeString() : ''}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={`bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-lg ${mode==='generate' ? 'min-h-[675px]' : 'min-h-[480px] xl:min-h-[520px] 2xl:min-h-[700px] 3xl:min-h-[800px] ultrawide:min-h-[675px] 4k:min-h-[800px]'} flex flex-col items-center justify-center text-center p-6`} style={force800For4k150 ? { minHeight: 800 } : undefined}>
              <div className="mb-6">
                <div className="text-6xl xl:text-7xl 2xl:text-8xl 3xl:text-9xl mb-4 opacity-60">
                  {mode === 'generate' ? '🎨' : mode === 'edit' ? '✨' : '🔍'}
                </div>
                <h3 className="text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl font-medium text-gray-700 mb-2">
                  {mode === 'generate' ? '创作画布' : mode === 'edit' ? '编辑预览' : '分析结果'}
                </h3>
                <p className="text-sm xl:text-base 2xl:text-lg 3xl:text-xl text-gray-500 max-w-md">
                  {mode === 'generate' 
                    ? '输入创意提示词，AI将为您生成精美的图片作品' 
                    : mode === 'edit' 
                    ? '上传图片并描述编辑需求，AI将智能处理您的图片'
                    : '上传图片进行智能分析，获取详细的内容描述'
                  }
                </p>
              </div>
              
              <div className="flex items-center space-x-4 text-xs xl:text-sm 2xl:text-base text-gray-400">
                <div className="flex items-center space-x-1">
                  <span>⚡</span>
                  <span>快速生成</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span>🎯</span>
                  <span>精准控制</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span>✨</span>
                  <span>专业品质</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* 下半部分：提示词输入区域（横向全宽） */}
      <div ref={promptContainerRef} className="bg-white rounded-lg border border-gray-200 p-4 xl:p-6">
          <div className="flex items-center justify-between mb-2 xl:mb-3">
          <div className="flex items-center flex-wrap gap-3">
            {mode === 'edit' || mode === 'generate' ? (
              <span role="heading" aria-level={3} className="inline-flex items-center text-base sm:text-lg xl:text-xl font-semibold text-green-700 cursor-default select-none">
                <span>输入提示词</span>
              </span>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <span role="heading" aria-level={3} className="inline-flex items-center text-base sm:text-lg xl:text-xl font-semibold text-green-700 cursor-default select-none">
                  <span>输入提示词</span>
                </span>
                {/* 分析快捷指令（来源：图片识别自定义场景） */}
                {recognitionQuickScenarios.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {recognitionQuickScenarios.slice(0, 8).map((s, idx) => (
                      <button
                        key={`${s.label}-${idx}`}
                        onClick={() => { setPrompt(s.content); setAnalyzeEditorMode('preview'); }}
                        className="px-2.5 py-1 text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                        title={s.content}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* 编辑模式：同一行展示图片编辑快捷Prompt，与标题保持间距 */}
            {mode === 'edit' && (
              <QuickTemplates
                selectedMode={mode}
                compact
                onSelectTemplate={(pick) => {
                  setIsQuickTemplatePrompt(true);
                  setLastTemplatePick(pick);
                  setPrompt(pick.display);
                  // 没有名称信息时提供通用标题与图标
                  setSelectedTemplateInfo({ name: '快捷模板', emoji: '🧩', display: pick.display, english: pick.english });
                  setShowTemplateInfoBar(true);
                }}
                onManageTemplates={() => {}}
              />
            )}
            {/* 生成模式的六大场景按钮已上移至画布选择区 */}
            {mode === 'generate' && isTemplateFilling && (
              <span className="inline-flex items-center gap-2 text-xs sm:text-sm text-gray-500 ml-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                正在根据模板生成…
              </span>
            )}
            {/* 移除标题行的三段开关；生成模式下已将场景按钮上移至画布选择区 */}
          </div>
          <div className="flex items-center gap-2">
          <button
            onClick={handleOptimizePrompt}
            disabled={!prompt.trim() || isPolishing || isProcessing}
            className="inline-flex items-center bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 transition-colors px-3 py-1.5 rounded-md text-xs sm:text-sm space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            title="AI优化提示词"
          >
            {isPolishing ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                <span>AI优化中...</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>AI优化提示词</span>
              </>
            )}
          </button>
          {mode === 'generate' && (
            <button
              type="button"
              onClick={() => setGenOptimizeMode(genOptimizeMode === 'suggest' ? 'off' : 'suggest')}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-200 bg-white/80 hover:bg-white shadow-sm text-xs sm:text-sm transition-colors`}
              title="自动优化：开=Suggest，关=Off"
            >
              <span className={`${genOptimizeMode === 'suggest' ? 'text-emerald-700' : 'text-gray-700'}`}>自动优化</span>
              <span className={`inline-flex items-center w-9 h-5 rounded-full transition-colors ${
                genOptimizeMode === 'suggest' ? 'bg-emerald-500' : 'bg-gray-300'
              }`}>
                <span className={`h-4 w-4 bg-white rounded-full transition-transform transform ${
                  genOptimizeMode === 'suggest' ? 'translate-x-4' : 'translate-x-1'
                }`} />
              </span>
            </button>
          )}
          {mode === 'generate' && genOptimizedBadge && (
            <div className="inline-flex items-center">
              {genPrevPrompt && (
                <button
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 bg-white/80 hover:bg-emerald-50 text-emerald-700"
                  title="撤销自动优化"
                  onClick={() => {
                    setPrompt(genPrevPrompt!);
                    setGenPrevPrompt(null);
                    setGenOptimizedBadge(false);
                    setGenOptimizeMode('off');
                  }}
                >
                  <span className="text-sm">↺</span>
                </button>
              )}
            </div>
          )}
          </div>
        </div>
        {mode === 'analyze' ? (
          <MarkdownEditor
            value={prompt}
            onChange={(val) => { setPrompt(val); setPromptMeta(prev => { const next = { ...(prev || {}), source: 'user', edited: true, ts: Date.now() }; try { console.log('[PromptChange] markdown', next); } catch {} return next; }); }}
            placeholder={'例如：分析图片中的主要元素和构图特点（支持 Markdown）'}
            disabled={isProcessing}
            defaultMode="edit"
            mode={analyzeEditorMode}
            onModeChange={setAnalyzeEditorMode}
            minHeight={170}
          />
        ) : (
          <textarea
            value={prompt}
            onChange={(e) => { setIsQuickTemplatePrompt(false); setPrompt(e.target.value); setPromptMeta(prev => { const next = { ...(prev || {}), source: 'user', edited: true, ts: Date.now() }; try { console.log('[PromptChange] text', next); } catch {} return next; }); }}
            placeholder={
              mode === 'generate' ? '例如：一只可爱的小猫在花园里玩耍，阳光明媚，油画风格' :
              '例如：将背景改为海滩，增加夕阳效果'
            }
            className="w-full h-32 xl:h-36 2xl:h-40 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm xl:text-base"
            disabled={isProcessing}
          />
        )}

      </div>
      
      
      {/* 可拖动的浮动生成按钮 */}
      <DraggableFloatingButton
        storageKey={`generate-button-position-${mode}`}
        className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300"
      >
        <DraggableActionButton
          onClick={handleSubmit}
          disabled={primaryDisabled}
          className={`backdrop-blur-md border-2 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center space-x-2 sm:space-x-3 px-4 sm:px-8 py-2 sm:py-3 text-sm sm:text-base rounded-2xl font-semibold ring-2 whitespace-nowrap ${
            (isProcessing || isAnalyzingLocal)
              ? 'bg-transparent border-emerald-500 text-emerald-700 ring-emerald-200/60 cursor-wait'
              : primaryDisabled
              ? 'bg-white/40 border-gray-300/50 text-gray-500 cursor-not-allowed ring-blue-200/60'
              : 'bg-transparent border-emerald-500 text-emerald-700 hover:bg-emerald-50/30 hover:border-emerald-600 hover:text-emerald-800 ring-emerald-200/60 hover:ring-emerald-300/80'
          }`}
          style={{
            textShadow: (isProcessing || isAnalyzingLocal) ? 'none' : '0 1px 2px rgba(0,0,0,0.2)',
            backdropFilter: 'blur(12px)',
            boxShadow: (isProcessing || isAnalyzingLocal)
              ? '0 4px 16px rgba(16, 185, 129, 0.20)'
              : primaryDisabled
              ? '0 4px 16px rgba(0,0,0,0.1)'
              : '0 8px 24px rgba(16, 185, 129, 0.18)',
          }}
          icon={(isProcessing || isAnalyzingLocal) ? (
            <div className="relative">
              <span className="text-xl animate-pulse">⚡</span>
              <div className="absolute inset-0 animate-ping">
                <span className="text-xl opacity-75">✨</span>
              </div>
            </div>
          ) : (
            <span className="text-xl">✨</span>
          )}
       >
          {(isProcessing || isAnalyzingLocal) ? (
            <>
              <div className="flex items-center space-x-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <div className="flex items-center">
                  <span className="animate-pulse">AI正在</span>
                  <span className="ml-1">
                    {mode === 'generate' ? '创作中' : mode === 'edit' ? '编辑中' : '分析中'}
                  </span>
                  <span className="animate-bounce ml-1">...</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <span className="hidden xs:inline">
                {mode === 'generate' ? '生成图片' : mode === 'edit' ? '编辑图片' : '分析图片'}
              </span>
              <span className="xs:hidden">
                {mode === 'generate' ? '生成' : mode === 'edit' ? '编辑' : '分析'}
              </span>
            </>
          )}
        </DraggableActionButton>
      </DraggableFloatingButton>
      
      {/* 系统提示词模态框交由 App.tsx 的 SystemPromptModal 统一渲染，避免重复弹出 */}
      
      {/* 图片预览模态框 */}
      {showImagePreview && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50" onClick={closeImagePreview}>
          <div className="relative max-w-full max-h-full p-4" onClick={(e) => e.stopPropagation()}>
            <div className="relative">
              <img
                src={previewImageUrl}
                alt={previewImageTitle}
                className="max-w-full max-h-screen object-contain"
                style={{ maxWidth: '90vw', maxHeight: '90vh' }}
              />
              
              {/* 关闭按钮 */}
              <button
                onClick={closeImagePreview}
                className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
                title="关闭预览"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              {/* 标题已移除，避免与页面操作重复 */}
              
              {/* 左右切换箭头 - 只在有两张图片时显示 */}
              {imagePreviews.length > 0 && currentResult && (
                <>
                  {/* 左箭头 - 切换到修改前 */}
                  {previewImageType === 'after' && (
                    <button
                      onClick={switchPreviewImage}
                      className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 text-white p-3 rounded-full hover:bg-black/70 transition-colors"
                      title="查看修改前"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  )}
                  
                  {/* 右箭头 - 切换到修改后 */}
                  {previewImageType === 'before' && (
                    <button
                      onClick={switchPreviewImage}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 text-white p-3 rounded-full hover:bg-black/70 transition-colors"
                      title="查看修改后"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}
                </>
              )}
              
              {/* 下载按钮移除，预览层不再重复该操作 */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
