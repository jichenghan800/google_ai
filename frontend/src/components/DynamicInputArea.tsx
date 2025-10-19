import React from 'react';
import { AspectRatioOption } from '../types/index.ts';
import { AIMode } from './ModeToggle.tsx';

interface DynamicInputAreaProps {
  mode: AIMode;
  
  // 画布选择相关（生成模式）
  selectedRatio?: AspectRatioOption;
  onRatioChange?: (ratio: AspectRatioOption) => void;
  aspectRatioOptions?: AspectRatioOption[];
  
  // 图片上传相关（编辑/分析模式）
  uploadedFiles?: File[];
  imagePreviews?: string[];
  onFilesUploaded?: (files: File[]) => void;
  onFileRemove?: (index: number) => void;
  onFileReplace?: (index: number, file: File) => void; // 在有图时支持拖拽替换
  onClearAll?: () => void;
  dragActive?: boolean;
  onDragHandlers?: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  fileInputRef?: React.RefObject<HTMLInputElement>;
  onFileInputChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRequestUploadLeft?: () => void; // 触发左侧上传（用于区分左右上传来源）
  
  // 处理状态相关
  isSubmitting?: boolean;
  isProcessing?: boolean;
  
  // 预览功能
  onImagePreview?: (imageUrl: string, title: string, type: 'before' | 'after') => void;
  maxPreviewHeight?: number; // 限制预览图最大高度（页面初始化时确定）
  highlight?: boolean; // 高亮边框（橙色虚线），用于提示当前编辑目标
  imageDimensions?: { width: number; height: number }[]; // 用于判断横竖图
  onToggleHistory?: () => void; // 切换历史显示
  // 生成模式：六大场景模板选择回调与等待态（用于上移到画布选择区下方）
  onSelectGenerateTemplate?: (pick: { display: string; english?: string; id?: string; name?: string; nameZh?: string; nameEn?: string }) => void | Promise<void>;
  isTemplateFilling?: boolean;
  forceTall?: boolean;
}

export const DynamicInputArea: React.FC<DynamicInputAreaProps> = (props) => {
  const {
    mode,
    uploadedFiles = [],
    imagePreviews = [],
    onFilesUploaded,
    onFileRemove,
    onFileReplace,
    onClearAll,
    dragActive = false,
    onDragHandlers,
    fileInputRef,
    onFileInputChange,
    isSubmitting = false,
    isProcessing = false,
    onImagePreview,
    maxPreviewHeight,
    highlight = false,
    imageDimensions = [],
    onRequestUploadLeft,
    forceTall = false,
  } = props;
  // 本地测量的图片尺寸，作为后备（Hooks 须在顶层调用）
  const [localDims, setLocalDims] = React.useState<{width:number;height:number}[]>([]);
  const [isGridDragOver, setIsGridDragOver] = React.useState(false);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);
  const dropzoneHeadingClass = 'text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl font-semibold text-slate-100';
  const dropzoneBodyClass = 'text-sm sm:text-base xl:text-lg 2xl:text-xl text-slate-300/90 leading-relaxed';
  const dropzoneFeatureClass = 'inline-flex items-center gap-2 text-xs sm:text-sm text-slate-200';
  // 悬停时长控制：短停=替换，长停=新增
  const HOVER_APPEND_MS = 700; // 悬停超过 700ms 视为“新增”
  const hoverTimerRef = React.useRef<number | null>(null);
  const [longHoverIndex, setLongHoverIndex] = React.useState<number | null>(null);
  React.useEffect(() => () => { if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); } }, []);
  // 主题/语言 - 用于底部三个按钮（在生成模式分组容器内使用）
  // 智能拼贴布局（编辑模块，≤3 张）
  type Box = { x: number; y: number; w: number; h: number; z: number };
  const collageHostRef = React.useRef<HTMLDivElement | null>(null);
  const [boxes, setBoxes] = React.useState<Box[] | null>(null);
  // 使用 ref 保存计算函数，避免 effect 因函数新建造成循环
  const computeCollageRef = React.useRef<() => void>(() => {});
  const recompute = () => { try { computeCollageRef.current(); } catch {} };
  const isSingleImage = imagePreviews.length === 1;
  const primaryDims = imageDimensions?.[0] || localDims?.[0];
  const prefersPortraitMax = isSingleImage && primaryDims ? (primaryDims.height || 0) >= (primaryDims.width || 0) : false;
  const baseMaxPreviewHeight = forceTall ? '800px' : 'min(70vh, var(--pane-max-h, 1433px))';
  const portraitMaxPreviewHeight = forceTall ? '800px' : 'min(92vh, var(--pane-max-h, 1433px))';
  const singleImageMaxHeight = prefersPortraitMax ? portraitMaxPreviewHeight : baseMaxPreviewHeight;
  // 始终更新当前的计算实现（读取最新的尺寸与预览）
  React.useEffect(() => {
    computeCollageRef.current = () => {
      const node = collageHostRef.current;
      if (!node) { setBoxes(null); return; }
      const rect = node.getBoundingClientRect();
      const W = Math.max(0, rect.width);
      const measuredHeight = Math.max(0, rect.height || 0);
      const fallbackHeight = forceTall
        ? 820
        : Math.max(360, Math.round(window.innerHeight * 0.66));
      const H = measuredHeight > 0 ? measuredHeight : fallbackHeight;
      const ds = (imageDimensions.length ? imageDimensions : localDims).map((d) => d || { width: 1, height: 1 });
      const ar = (i:number) => { const d = ds[i] || ({} as any); const w = d.width || 1, h = d.height || 1; return w / h; };
      const gap = 8; // 盒间小间距
      const out: Box[] = [];
      if (imagePreviews.length === 1) {
        out.push({ x: 0, y: 0, w: W, h: H, z: 3 });
        setBoxes(out);
        return;
      }
      const ar1 = ar(0);
      const isLandscape = ar1 >= 1.0;

      if (isLandscape) {
        // 横图主图：放上面占满宽
        const mainH = Math.max(Math.min(H * 0.58, Math.floor(W / ar1)), Math.floor(H * 0.44));
        const remainingH = Math.max(1, H - mainH - gap);
        out.push({ x: 0, y: 0, w: W, h: mainH, z: 3 });
        if (imagePreviews.length === 2) {
          // 两张图：第二张铺满下方区域
          out.push({ x: 0, y: mainH + gap, w: W, h: remainingH, z: 1 });
        } else {
          const colW = Math.floor((W - gap) / 2);
          if (imagePreviews[1]) out.push({ x: 0, y: mainH + gap, w: colW, h: remainingH, z: 1 });
          if (imagePreviews[2]) out.push({ x: colW + gap, y: mainH + gap, w: colW, h: remainingH, z: 1 });
        }
      } else {
        // 竖图主图：靠左占满高
        const mainW = Math.max(Math.min(Math.floor(H * ar1), Math.floor(W * 0.60)), Math.floor(W * 0.36));
        const remainingW = Math.max(1, W - mainW - gap);
        const rowH = Math.floor((H - gap) / 2);
        out.push({ x: 0, y: 0, w: mainW, h: H, z: 3 });
        if (imagePreviews.length === 2) {
          // 两张图：第二张占满右侧竖条
          out.push({ x: mainW + gap, y: 0, w: remainingW, h: H, z: 1 });
        } else {
          if (imagePreviews[1]) out.push({ x: mainW + gap, y: 0, w: remainingW, h: rowH, z: 1 });
          if (imagePreviews[2]) out.push({ x: mainW + gap, y: rowH + gap, w: remainingW, h: rowH, z: 1 });
        }
      }

      setBoxes(out);
    };
  }, [imagePreviews, imageDimensions, localDims, forceTall]);

  React.useEffect(() => {
    if (mode !== 'edit') return;
    if (imagePreviews.length > 0 && imagePreviews.length <= 3) recompute();
  }, [mode, imagePreviews.length, forceTall]);

  // 当首张图片的尺寸就绪时，再触发一次布局计算，避免首次加载误判横竖
  const dimsReadyKey = `${imageDimensions?.[0]?.width || localDims?.[0]?.width || 0}x${imageDimensions?.[0]?.height || localDims?.[0]?.height || 0}`;
  React.useEffect(() => {
    if (mode !== 'edit') return;
    if (!imagePreviews.length || imagePreviews.length > 3) return;
    if (dimsReadyKey !== '0x0') recompute();
  }, [mode, imagePreviews.length, dimsReadyKey, forceTall]);
  React.useEffect(() => {
    const onR = () => { if (mode === 'edit' && imagePreviews.length > 0 && imagePreviews.length <= 3) recompute(); };
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, [mode, imagePreviews.length, forceTall]);

  // 从剪贴板/拖拽 DataTransfer 提取图片 URL（text/uri-list、text/plain、text/html）
  const extractImageUrlsFromDataTransfer = (dt: DataTransfer): string[] => {
    const urls = new Set<string>();
    try {
      const uriList = dt.getData('text/uri-list');
      if (uriList) {
        uriList.split('\n').forEach(line => {
          const url = line.trim();
          if (url && !url.startsWith('#')) urls.add(url);
        });
      }
      const plain = dt.getData('text/plain');
      if (plain && /^https?:\/\//i.test(plain.trim())) {
        urls.add(plain.trim());
      }
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

  // 远程 URL → File（可能受 CORS 限制）
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
    } catch {
      return null;
    }
  };

  // 处理粘贴图片/URL
  const handlePaste = async (e: React.ClipboardEvent) => {
    try {
      const dt = e.clipboardData;
      const pastedFiles: File[] = [];

      // 1) 直接的图片位图（截图、复制图片）
      for (let i = 0; i < dt.items.length; i++) {
        const item = dt.items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            const ext = (blob.type.split('/')[1] || 'png').toLowerCase();
            const file = new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type });
            pastedFiles.push(file);
          }
        }
      }

      // 2) 若无文件，尝试从文本/HTML解析图片 URL 并抓取
      if (pastedFiles.length === 0) {
        const urls = extractImageUrlsFromDataTransfer(dt);
        if (urls.length > 0) {
          const fetched: File[] = [];
          for (const u of urls) {
            const f = await urlToImageFileSafe(u, 'pasted');
            if (f) fetched.push(f);
          }
          if (fetched.length > 0) pastedFiles.push(...fetched);
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        // 交给上层处理（会根据模式/上限过滤）
        onFilesUploaded?.(pastedFiles);
      }
    } catch {}
  };

  // 单个格子的拖拽替换
  const handleTileDropReplace = async (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const dt = e.dataTransfer;
      // 优先使用文件
      const fileList = Array.from(dt.files).filter(f => f.type.startsWith('image/'));
      let file: File | null = fileList[0] || null;
      if (!file) {
        // 尝试从URL抓取
        const urls = extractImageUrlsFromDataTransfer(dt);
        for (const u of urls) {
          const fetched = await urlToImageFileSafe(u, 'replace');
          if (fetched) { file = fetched; break; }
        }
      }
      if (!file) return;
      const atMax = (uploadedFiles?.length || 0) >= 3;
      const wantAppend = (longHoverIndex === index) && !atMax; // 长悬停且未达上限=新增；否则替换
      if (wantAppend) {
        // 追加：交给上层 onFilesUploaded（会按上限过滤）
        onFilesUploaded?.([file]);
      } else {
        // 替换
        if (onFileReplace) {
          onFileReplace(index, file);
        } else if (onFilesUploaded && onFileRemove) {
          // 退化方案：先移除再追加到末尾（顺序可能变化）
          onFileRemove(index);
          onFilesUploaded([file]);
        }
      }
      setDragOverIndex(null);
      setLongHoverIndex(null);
      if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    } catch {}
  };

  // 容器空白区域拖拽追加
  const handleGridDropAppend = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const dt = e.dataTransfer;
      const fileList = Array.from(dt.files).filter(f => f.type.startsWith('image/'));
      let files: File[] = [];
      if (fileList.length > 0) {
        files = fileList;
      } else {
        const urls = extractImageUrlsFromDataTransfer(dt);
        for (const u of urls) {
          const f = await urlToImageFileSafe(u, 'append');
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        // 去重：按 name+size+lastModified 简单判重，避免选择器重复
        const uniq = new Map<string, File>();
        files.forEach(f => { const key = `${f.name}|${f.size}|${(f as any).lastModified||0}`; if (!uniq.has(key)) uniq.set(key, f); });
        onFilesUploaded?.(Array.from(uniq.values()));
      }
    } catch {}
    setIsGridDragOver(false);
  };

  const isAnalyzeMode = mode === 'analyze';
  const analyzePreview = isAnalyzeMode ? imagePreviews?.[0] : undefined;
  const analyzeDimensions = isAnalyzeMode ? (imageDimensions?.[0] || localDims?.[0]) : undefined;
  const analyzeSizeLabel = (analyzeDimensions?.width && analyzeDimensions?.height)
    ? `${analyzeDimensions.width}×${analyzeDimensions.height}`
    : null;
  const analyzeOrientation = React.useMemo<'portrait' | 'landscape' | 'unknown'>(() => {
    if (!analyzeDimensions?.width || !analyzeDimensions?.height) return 'unknown';
    return analyzeDimensions.height >= analyzeDimensions.width ? 'portrait' : 'landscape';
  }, [analyzeDimensions?.width, analyzeDimensions?.height]);
  const analyzeImageStyle = React.useMemo<React.CSSProperties>(() => {
    if (analyzeOrientation === 'portrait') {
      return {
        height: '100%',
        width: 'auto',
        maxHeight: '100%',
        maxWidth: '100%',
      };
    }
    if (analyzeOrientation === 'landscape') {
      return {
        width: '100%',
        height: 'auto',
        maxWidth: '100%',
        maxHeight: '100%',
      };
    }
    return {
      width: '100%',
      height: '100%',
      maxWidth: '100%',
      maxHeight: '100%',
    };
  }, [analyzeOrientation]);

  const triggerUpload = React.useCallback(() => {
    if (onRequestUploadLeft) {
      onRequestUploadLeft();
    } else {
      fileInputRef?.current?.click();
    }
  }, [onRequestUploadLeft, fileInputRef]);

  if (isAnalyzeMode) {

    const clearImage = () => {
      if (onClearAll) {
        onClearAll();
      } else {
        onFileRemove?.(0);
      }
      setLocalDims([]);
    };

    const handlePreviewClick = () => {
      if (analyzePreview && onImagePreview) {
        onImagePreview(analyzePreview, '待分析原图', 'before');
      }
    };

    const analyzeCardClass = [
      'group relative flex flex-1 w-full min-h-[360px] overflow-hidden rounded-3xl border px-6 py-12 sm:px-10 sm:py-14 transition-colors duration-300 backdrop-blur-2xl',
      analyzePreview ? 'items-stretch justify-center' : 'flex-col items-center justify-center text-center',
      dragActive
        ? 'border-emerald-300/80 bg-emerald-300/15 shadow-[0_36px_80px_-34px_rgba(16,185,129,0.55)]'
        : analyzePreview
          ? 'border-white/12 bg-white/[0.05] shadow-[0_30px_70px_-36px_rgba(15,23,42,0.75)]'
          : 'border-white/12 bg-white/10 shadow-[0_30px_70px_-36px_rgba(15,23,42,0.75)] hover:border-white/18 hover:bg-white/[0.14]',
      (!analyzePreview && (isSubmitting || isProcessing)) ? 'cursor-not-allowed opacity-80' : '',
    ].filter(Boolean).join(' ');

    return (
      <div className="flex h-full flex-col space-y-4">
        <div
          className={analyzeCardClass}
          onDragEnter={onDragHandlers?.onDragEnter}
          onDragOver={onDragHandlers?.onDragOver}
          onDragLeave={onDragHandlers?.onDragLeave}
          onDrop={onDragHandlers?.onDrop}
          onPaste={handlePaste}
          role="presentation"
          onClick={(event) => event.stopPropagation()}
        >
          {!analyzePreview && (
            <div className="pointer-events-none absolute inset-0 -z-10">
              <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-white/8 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-100" />
              {dragActive && (
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/45 via-emerald-300/20 to-transparent opacity-90" />
              )}
              <div className="absolute inset-0 rounded-[inherit] border border-white/12 opacity-0 transition-opacity duration-300 group-hover:opacity-60" />
            </div>
          )}
          {analyzePreview ? (
            <div
              className="relative flex h-full w-full flex-1 items-center justify-center rounded-inherit"
              style={{ borderRadius: 'inherit' }}
            >
              <div
                className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit] bg-white/[0.08] transition-colors hover:bg-white/[0.12]"
                style={{ borderRadius: 'inherit' }}
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); handlePreviewClick(); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handlePreviewClick();
                  }
                }}
              >
                <img
                  src={analyzePreview}
                  alt="待分析原图"
                  className="pointer-events-none select-none object-contain"
                  style={analyzeImageStyle}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setLocalDims(prev => {
                      const next = [...prev];
                      next[0] = { width: img.naturalWidth, height: img.naturalHeight };
                      return next;
                    });
                  }}
                />
              </div>

              <button
                type="button"
                className="absolute top-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-lg transition hover:bg-white"
                onClick={(e) => { e.stopPropagation(); clearImage(); }}
                title="移除图片"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="absolute left-3 top-3 rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-semibold text-white shadow">
                待分析
              </div>

              {analyzeSizeLabel && (
                <div className="absolute bottom-3 right-3 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                  {analyzeSizeLabel}
                </div>
              )}
            </div>
          ) : (
            <div className="flex w-full max-w-md flex-col items-center justify-center gap-4 text-slate-100">
              <button
                type="button"
                className={[
                  'flex items-center justify-center transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-300/70 disabled:opacity-60 disabled:cursor-not-allowed',
                  dragActive
                    ? 'scale-105 drop-shadow-[0_10px_22px_rgba(56,189,248,0.45)]'
                    : 'hover:scale-105 hover:drop-shadow-[0_10px_22px_rgba(56,189,248,0.35)]'
                ].join(' ')}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isSubmitting || isProcessing) return;
                  triggerUpload();
                }}
                disabled={isSubmitting || isProcessing}
                aria-label="选择图片"
              >
                <img src="/upload.png" alt="上传图片" className="h-20 w-20 object-contain drop-shadow-[0_8px_20px_rgba(56,189,248,0.45)]" />
              </button>
              <div className="space-y-2 text-center">
                <h3
                  className={dropzoneHeadingClass}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!isSubmitting && !isProcessing) {
                      triggerUpload();
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!isSubmitting && !isProcessing) {
                        triggerUpload();
                      }
                    }
                  }}
                >
                  上传图片
                </h3>
                <p className={dropzoneBodyClass}>上传图片并描述编辑需求，AI 将智能处理您的图片</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-4 text-xs sm:text-sm text-slate-300/80">
                <span className={dropzoneFeatureClass}>
                  <span className="text-lg leading-none">🖱️</span>
                  <span>支持拖拽</span>
                </span>
                <span className={dropzoneFeatureClass}>
                  <span className="text-lg leading-none">🗂️</span>
                  <span>多图上传</span>
                </span>
                <span className={dropzoneFeatureClass}>
                  <span className="text-lg leading-none">📋</span>
                  <span>粘贴上传</span>
                </span>
              </div>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          multiple={false}
          onChange={onFileInputChange}
        />
      </div>
    );
  }

  if (mode === 'generate') {
    return null;
  }
  // 图片上传模式（编辑/分析）

  // 智能拼贴布局（编辑模块，≤3 张） — 已提前到 Hooks 顶层，避免 rules-of-hooks 警告

  const getGridLayoutClass = (count: number) => {
    switch (count) {
      case 1: return 'grid-cols-1';
      case 2: {
        const dims = imageDimensions.length === 2 ? imageDimensions : (localDims.length === 2 ? localDims : [] as any);
        const bothLandscape = dims.length === 2 &&
          dims[0] && dims[1] &&
          dims[0].width > dims[0].height &&
          dims[1].width > dims[1].height;
        return bothLandscape ? 'grid-cols-1' : 'grid-cols-2';
      }
      case 3: return 'grid-cols-2';
      case 4: return 'grid-cols-2';
      default: return 'grid-cols-1';
    }
  };

  if (imagePreviews.length === 0) {
    return (
      <div onPaste={handlePaste} tabIndex={0} className="relative flex h-full flex-col">
          <div
            className={[
            'group relative flex h-full w-full min-h-[360px] flex-col items-center justify-center overflow-hidden rounded-3xl border px-6 py-12 text-center transition-colors duration-300 backdrop-blur-2xl sm:px-10 sm:py-14',
            dragActive
              ? 'border-emerald-300/80 bg-emerald-300/15 shadow-[0_36px_80px_-34px_rgba(16,185,129,0.55)]'
              : 'border-white/12 bg-white/10 shadow-[0_30px_70px_-36px_rgba(15,23,42,0.75)] hover:border-white/18 hover:bg-white/[0.14]',
            isSubmitting || isProcessing
              ? 'cursor-not-allowed opacity-80'
              : 'cursor-default'
          ].join(' ')}
          onClick={(event) => event.stopPropagation()}
          {...(onDragHandlers || {})}
        >
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-white/8 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-100" />
            {dragActive && (
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/45 via-emerald-300/20 to-transparent opacity-90" />
            )}
            <div className="absolute inset-0 rounded-[inherit] border border-white/12 opacity-0 transition-opacity duration-300 group-hover:opacity-60" />
          </div>

          <div className="flex w-full max-w-md flex-col items-center justify-center gap-4 text-slate-100">
            <button
              type="button"
              className={[
                'flex items-center justify-center transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-300/70 disabled:opacity-60 disabled:cursor-not-allowed',
                dragActive
                  ? 'scale-105 drop-shadow-[0_10px_22px_rgba(56,189,248,0.45)]'
                  : 'hover:scale-105 hover:drop-shadow-[0_10px_22px_rgba(56,189,248,0.35)]'
              ].join(' ')}
              onClick={(event) => {
                event.stopPropagation();
                if (isSubmitting || isProcessing) return;
                triggerUpload();
              }}
              disabled={isSubmitting || isProcessing}
              aria-label="选择图片"
            >
              <img src="/upload.png" alt="上传图片" className="h-20 w-20 object-contain drop-shadow-[0_8px_20px_rgba(56,189,248,0.45)]" />
            </button>
            <div className="space-y-2 text-center">
              <h3
              className={dropzoneHeadingClass}
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                if (!isSubmitting && !isProcessing) {
                  triggerUpload();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!isSubmitting && !isProcessing) {
                    triggerUpload();
                  }
                }
              }}
            >
              上传图片
            </h3>
              <p className={dropzoneBodyClass}>上传图片并描述编辑需求，AI 将智能处理您的图片</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs sm:text-sm text-slate-300/80">
              <span className={dropzoneFeatureClass}>
                <span className="text-lg leading-none">🖱️</span>
                <span>支持拖拽</span>
              </span>
              <span className={dropzoneFeatureClass}>
                <span className="text-lg leading-none">🗂️</span>
                <span>多图上传</span>
              </span>
              <span className={dropzoneFeatureClass}>
                <span className="text-lg leading-none">📋</span>
                <span>粘贴上传</span>
              </span>
            </div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          multiple={mode === 'edit'}
          onChange={onFileInputChange}
        />
      </div>
    );
  }

  return (
    <div
      onPaste={handlePaste}
      onClick={(event) => event.stopPropagation()}
      tabIndex={0}
      className={[
        'group relative overflow-visible rounded-2xl border transition-colors duration-300 image-preview-responsive flex flex-col h-full',
        highlight ? 'border-orange-300 bg-white/[0.08]' : 'border-white/12 bg-white/[0.04]'
      ].join(' ')}
    >
      {/* 顶部右侧浮层操作按钮（添加） */}
      {imagePreviews.length > 0 && (
        <button
          type="button"
          className="absolute top-3 left-3 z-30 w-9 h-9 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center transition-colors disabled:bg-gray-300 shadow"
          onClick={() => {
            if (onRequestUploadLeft) {
              onRequestUploadLeft();
            } else {
              fileInputRef?.current?.click();
            }
          }}
          disabled={isSubmitting || isProcessing || uploadedFiles.length >= 3}
          title={uploadedFiles.length >= 3 ? '已达上限' : '添加更多'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
      <div
        className="flex-1 overflow-hidden rounded-inherit"
        style={{ borderRadius: 'inherit' }}
      >
        {/* 原图预览 - 多张图片共享预览区域（<=3张采用智能拼贴；>3张使用网格） */}
        <div
          className="h-full rounded-inherit"
          style={{ borderRadius: 'inherit' }}
        >
          {imagePreviews.length > 0 ? (
            imagePreviews.length <= 3 ? (
              <div
                ref={collageHostRef}
                className="relative w-full h-full overflow-hidden rounded-inherit bg-white/10"
                style={{ borderRadius: 'inherit' }}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsGridDragOver(true); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsGridDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsGridDragOver(false); }}
                onDrop={handleGridDropAppend}
              >
                {isGridDragOver && dragOverIndex === null && (
                  <div className="pointer-events-none absolute inset-0 rounded-inherit border-2 border-green-500/80">
                    <div className="absolute top-2 right-2 bg-green-600 text-white text-xs px-2 py-0.5 rounded shadow">追加</div>
                  </div>
                )}
                {(boxes || []).map((b, index) => {
                  const preview = imagePreviews[index];
                  const isSecondOfTwo = imagePreviews.length === 2 && index === 1;
                  const dimsForIndex = imageDimensions?.[index] || localDims?.[index];
                  const isWideTopOfTwo =
                    imagePreviews.length === 2 &&
                    index === 0 &&
                    dimsForIndex &&
                    (dimsForIndex.width || 0) >= (dimsForIndex.height || 0);
                  const hoverClass = isSecondOfTwo || isWideTopOfTwo ? 'hover:bg-slate-900/65' : 'hover:bg-slate-900/60';
                  return (
                    <div
                      key={index}
                      className="group absolute rounded-inherit"
                      style={{ left: b.x, top: b.y, width: b.w, height: b.h, zIndex: b.z, borderRadius: 'inherit' }}
                      onClick={() => { onImagePreview?.(preview, '修改前', 'before'); }}
                      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverIndex(index); setIsGridDragOver(false); setLongHoverIndex(null); if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); hoverTimerRef.current = window.setTimeout(() => setLongHoverIndex(index), HOVER_APPEND_MS); }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dragOverIndex !== index) { setDragOverIndex(index); setLongHoverIndex(null); if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); hoverTimerRef.current = window.setTimeout(() => setLongHoverIndex(index), HOVER_APPEND_MS); } }}
                      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverIndex((cur) => cur === index ? null : cur); if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; } setLongHoverIndex(null); }}
                      onDrop={(e) => handleTileDropReplace(e, index)}
                  >
                    <div
                      className={`w-full h-full overflow-hidden bg-slate-900/55 cursor-pointer transition-colors flex items-center justify-center rounded rounded-inherit ${hoverClass}`}
                      style={{ borderRadius: 'inherit' }}
                    >
                      <img
                        data-pane-img
                        src={preview}
                        alt={`原图 ${index + 1}`}
                        className={`w-full h-full rounded-inherit transition-transform duration-200 ${(isSecondOfTwo || isWideTopOfTwo) ? 'object-cover' : 'object-contain hover:scale-105'}`}
                        style={{
                          borderRadius: 'inherit',
                          maxHeight: isSingleImage ? singleImageMaxHeight : baseMaxPreviewHeight,
                          objectFit: (isSecondOfTwo || isWideTopOfTwo) ? 'cover' : 'contain',
                          objectPosition: 'center',
                        }}
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          setLocalDims((prev) => {
                            const next = [...prev];
                            next[index] = { width: img.naturalWidth, height: img.naturalHeight };
                            return next;
                          });
                          requestAnimationFrame(() => recompute());
                        }}
                      />
                    </div>
                    {dragOverIndex === index && (
                      (() => { const atMax = (uploadedFiles?.length || 0) >= 3; const longHover = longHoverIndex === index; const ring = longHover ? (atMax ? 'ring-amber-500/80 bg-amber-500/5' : 'ring-emerald-500/80 bg-emerald-500/5') : 'ring-blue-500/80 bg-blue-500/5'; const textClass = longHover ? (atMax ? 'text-amber-700' : 'text-emerald-700') : 'text-blue-700'; const label = longHover ? (atMax ? '已达上限' : '松手新增') : '替换'; return (<div className={`pointer-events-none absolute inset-0 rounded-inherit ring-2 ${ring} flex items-center justify-center`}><span className={`text-xs font-semibold px-2 py-0.5 rounded bg-white/80 shadow ${textClass}`}>{label}</span></div>); })()
                    )}
                    <button onClick={(e) => { e.stopPropagation(); onFileRemove?.(index); }} className="absolute top-2 right-2 z-30 bg-red-500 text-white w-9 h-9 rounded-full opacity-0 group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-200 hover:bg-red-600 shadow-lg flex items-center justify-center" disabled={isSubmitting || isProcessing} title="删除图片">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                className={`relative grid gap-2 ${getGridLayoutClass(imagePreviews.length)} h-full rounded-inherit`}
                style={{ gridAutoRows: '1fr', borderRadius: 'inherit' }}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsGridDragOver(true); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsGridDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsGridDragOver(false); }}
                onDrop={handleGridDropAppend}
              >
                {isGridDragOver && dragOverIndex === null && (
                  <div className="pointer-events-none absolute inset-0 rounded-inherit border-2 border-green-500/80">
                    <div className="absolute top-2 right-2 bg-green-600 text-white text-xs px-2 py-0.5 rounded shadow">追加</div>
                  </div>
                )}
                {imagePreviews.map((preview, index) => (
                  <div
                    key={index}
                    className={`relative group rounded-inherit ${
                      imagePreviews.length === 3 && index === 2 ? 'col-span-2' : ''
                    }`}
                    style={{ borderRadius: 'inherit' }}
                  >
                    <div 
                      className="w-full h-full overflow-hidden bg-slate-900/55 cursor-pointer hover:bg-slate-900/60 transition-colors flex items-start justify-center rounded-inherit"
                      style={{ borderRadius: 'inherit' }}
                      onClick={() => { if (onImagePreview) onImagePreview(preview, '修改前', 'before'); }}
                      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverIndex(index); setIsGridDragOver(false); setLongHoverIndex(null); if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); hoverTimerRef.current = window.setTimeout(() => setLongHoverIndex(index), HOVER_APPEND_MS); }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dragOverIndex !== index) { setDragOverIndex(index); setLongHoverIndex(null); if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); hoverTimerRef.current = window.setTimeout(() => setLongHoverIndex(index), HOVER_APPEND_MS); } }}
                      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverIndex((cur) => cur === index ? null : cur); if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; } setLongHoverIndex(null); }}
                      onDrop={(e) => handleTileDropReplace(e, index)}
                    >
                      <img
                        data-pane-img
                        src={preview}
                        alt={`原图 ${index + 1}`}
                        className="original-image w-full h-full object-contain object-top hover:scale-105 transition-transform duration-200 rounded-inherit"
                        style={{ borderRadius: 'inherit', maxHeight: isSingleImage ? singleImageMaxHeight : baseMaxPreviewHeight }}
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          setLocalDims((prev) => {
                            const next = [...prev];
                            next[index] = { width: img.naturalWidth, height: img.naturalHeight };
                            return next;
                          });
                        }}
                      />
                    </div>
                    {dragOverIndex === index && (
                      (() => { const atMax = (uploadedFiles?.length || 0) >= 3; const longHover = longHoverIndex === index; const ring = longHover ? (atMax ? 'ring-amber-500/80 bg-amber-500/5' : 'ring-emerald-500/80 bg-emerald-500/5') : 'ring-blue-500/80 bg-blue-500/5'; const textClass = longHover ? (atMax ? 'text-amber-700' : 'text-emerald-700') : 'text-blue-700'; const label = longHover ? (atMax ? '已达上限' : '松手新增') : '替换'; return (<div className={`pointer-events-none absolute inset-0 rounded-inherit ring-2 ${ring} flex items-center justify-center`}><span className={`text-xs font-semibold px-2 py-0.5 rounded bg-white/80 shadow ${textClass}`}>{label}</span></div>); })()
                    )}
                    <button onClick={(e) => { e.stopPropagation(); onFileRemove?.(index); }} className="absolute top-2 right-2 z-30 bg-red-500 text-white w-9 h-9 rounded-full opacity-0 group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-200 hover:bg-red-600 shadow-lg flex items-center justify-center" disabled={isSubmitting || isProcessing} title="删除图片">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div
              className={[
                'group relative flex h-full w-full min-h-[360px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed px-6 py-12 text-center transition-colors duration-300 backdrop-blur-xl sm:px-10 sm:py-14',
                dragActive
                  ? 'border-emerald-300/80 bg-emerald-300/10 shadow-[0_28px_70px_-32px_rgba(16,185,129,0.55)]'
                  : 'border-white/12 bg-white/[0.04] shadow-[0_26px_60px_-36px_rgba(15,23,42,0.7)]',
                isSubmitting || isProcessing
                  ? 'cursor-not-allowed opacity-80'
                  : 'hover:border-white/18 hover:bg-white/[0.08]'
              ].join(' ')}
              {...(onDragHandlers || {})}
            >
              <div className="pointer-events-none absolute inset-0 -z-10">
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-white/[0.02] to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
                {dragActive && (
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/25 via-emerald-400/10 to-transparent opacity-80" />
                )}
                <div className="absolute -inset-px rounded-[inherit] border border-white/8 opacity-0 transition-opacity duration-300 group-hover:opacity-40" />
              </div>

              <div className="flex w-full max-w-md flex-col items-center justify-center gap-4 text-slate-100">
                <button
                  type="button"
                  className={[
                    'flex items-center justify-center transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-300/70 disabled:opacity-60',
                    dragActive
                      ? 'scale-105'
                      : 'hover:scale-105'
                  ].join(' ')}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isSubmitting || isProcessing) return;
                    triggerUpload();
                  }}
                  disabled={isSubmitting || isProcessing}
                  aria-label="选择图片"
                >
                <img src="/upload.png" alt="上传图片" className="h-20 w-20 object-contain drop-shadow-[0_8px_20px_rgba(56,189,248,0.45)]" />
              </button>
                <div className="space-y-2 text-center">
                  <h3
              className={dropzoneHeadingClass}
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                if (!isSubmitting && !isProcessing) {
                  triggerUpload();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!isSubmitting && !isProcessing) {
                    triggerUpload();
                  }
                }
              }}
            >
              上传图片
            </h3>
                  <p className={dropzoneBodyClass}>上传图片并描述编辑需求，AI 将智能处理您的图片</p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-4 text-xs sm:text-sm text-slate-300/80">
                  <span className={dropzoneFeatureClass}>
                    <span className="text-lg leading-none">🖱️</span>
                    <span>支持拖拽</span>
                  </span>
                  <span className={dropzoneFeatureClass}>
                    <span className="text-lg leading-none">🗂️</span>
                    <span>多图上传</span>
                  </span>
                  <span className={dropzoneFeatureClass}>
                    <span className="text-lg leading-none">📋</span>
                    <span>粘贴上传</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* 底部操作条已移除，按钮上移到浮层，给图片更多空间 */}
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        multiple={mode === 'edit'}
        onChange={onFileInputChange}
      />
    </div>
  );
};
