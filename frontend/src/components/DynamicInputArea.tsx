import React from 'react';
import { QuickTemplates } from './QuickTemplates.tsx';
import { CanvasSelector } from './CanvasSelector.tsx';
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
  showBeforeBadge?: boolean; // 显示左上角“修改前”徽标
  onToggleHistory?: () => void; // 切换历史显示
  // 生成模式：六大场景模板选择回调与等待态（用于上移到画布选择区下方）
  onSelectGenerateTemplate?: (pick: { display: string; english?: string; id?: string; name?: string; nameZh?: string; nameEn?: string }) => void | Promise<void>;
  isTemplateFilling?: boolean;
}

export const DynamicInputArea: React.FC<DynamicInputAreaProps> = ({
  mode,
  selectedRatio,
  onRatioChange,
  aspectRatioOptions,
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
  showBeforeBadge = true,
  onToggleHistory,
  onSelectGenerateTemplate,
  isTemplateFilling
}) => {
  // 本地测量的图片尺寸，作为后备（Hooks 须在顶层调用）
  const [localDims, setLocalDims] = React.useState<{width:number;height:number}[]>([]);
  const [isGridDragOver, setIsGridDragOver] = React.useState(false);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);
  // 主题/语言 - 用于底部三个按钮（在生成模式分组容器内使用）
  const [uiTheme, setUiTheme] = React.useState<string>(() => {
    try { return localStorage.getItem('theme') || 'light'; } catch { return 'light'; }
  });
  const [uiLang, setUiLang] = React.useState<string>(() => {
    try { return localStorage.getItem('lang') || 'zh'; } catch { return 'zh'; }
  });
  React.useEffect(() => {
    try {
      localStorage.setItem('theme', uiTheme);
      document.documentElement.classList.toggle('dark', uiTheme === 'dark');
      document.documentElement.setAttribute('data-theme', uiTheme);
    } catch {}
  }, [uiTheme]);
  React.useEffect(() => {
    try { localStorage.setItem('lang', uiLang); } catch {}
  }, [uiLang]);

  // 与 IntegratedWorkflow 同步：针对 4K + 150% 系统缩放时强制将生成模式左侧容器 max-height 调整到 800，
  // 以避免左侧 675px、右侧 800px 导致的上下留白与左右不齐。（仅该环境下生效）
  const [force800For4k150, setForce800For4k150] = React.useState(false);
  React.useEffect(() => {
    const check = () => {
      try {
        const w = window.innerWidth || 0;
        const h = window.innerHeight || 0;
        const dpr = (window.devicePixelRatio || 1);
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
      if (onFileReplace) {
        onFileReplace(index, file);
      } else if (onFilesUploaded && onFileRemove) {
        // 退化方案：先移除再追加到末尾（顺序可能变化）
        onFileRemove(index);
        onFilesUploaded([file]);
      }
      setDragOverIndex(null);
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
        onFilesUploaded?.(files);
      }
    } catch {}
    setIsGridDragOver(false);
  };

  if (mode === 'generate') {
    // 画布选择模式
    if (!selectedRatio || !onRatioChange || !aspectRatioOptions) {
      return null;
    }
    
    return (
      <div
        className="border border-gray-200 rounded-lg bg-white p-3 h-auto max-h-[675px] ultrawide:max-h-[675px] 4k:max-h-[800px] grid gap-4 sm:gap-5 grid-rows-[1fr_1fr_auto]"
        style={force800For4k150 ? { height: 800, maxHeight: 800 } : undefined}
      >
        {/* 1/3：画布选择（标题 + 三个矩形卡片，垂直排列） */}
        <div className="min-h-0 flex flex-col pb-3 border-b border-gray-100 mt-1 sm:mt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-semibold text-blue-700 flex items-center space-x-1 sm:space-x-2">
              <span>画布选择</span>
            </h3>
          </div>
          <p className="text-sm sm:text-base text-gray-600 mt-1">选择您的图片比例</p>
          <div className="mt-2">
            <CanvasSelector
              selectedRatio={selectedRatio}
              onRatioChange={onRatioChange}
              aspectRatioOptions={aspectRatioOptions}
              onToggleHistory={onToggleHistory}
              hideHeader
              frameless
            />
          </div>
        </div>

        {/* 2/3：最佳实践（标题 + 列表，填满剩余空间，可滚动） */}
        <div className="min-h-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-blue-700 flex items-center space-x-1 sm:space-x-2">
                <span>最佳实践</span>
              </h3>
              <p className="text-sm sm:text-base text-gray-600 mt-1">点击生成demo图片</p>
            </div>
            {isTemplateFilling && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                生成中…
              </span>
            )}
          </div>
          <div className="mt-2 flex-1 overflow-auto">
            <QuickTemplates
              selectedMode="generate"
              compact
              stacked
              variant="list"
              dense
              onSelectTemplate={(pick) => { onSelectGenerateTemplate?.(pick); }}
              onManageTemplates={() => {}}
            />
          </div>
        </div>

        {/* 3/3：底部按钮（主题/历史/语言） */}
        <div className="pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setUiTheme(t => (t === 'dark' ? 'light' : 'dark'))}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 flex items-center justify-center shadow-sm"
              title="切换主题"
            >
              {uiTheme === 'dark' ? (
                <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364l-1.414-1.414M7.05 7.05L5.636 5.636m12.728 0l-1.414 1.414M7.05 16.95l-1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 118.646 3.646 7 7 0 0020.354 15.354z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => onToggleHistory?.()}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 flex items-center justify-center shadow-sm"
              title="历史记录"
            >
              <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setUiLang(l => (l === 'zh' ? 'en' : 'zh'))}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 flex items-center justify-center shadow-sm"
              title="切换语言"
            >
              <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 0c2.5 2 4 5.5 4 9s-1.5 7-4 9m0-18c-2.5 2-4 5.5-4 9s1.5 7 4 9m-7-9h14" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }
  // 图片上传模式（编辑/分析）

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

  const dims = imageDimensions.length === 2 ? imageDimensions : (localDims.length === 2 ? localDims : [] as any);

  return (
    <div onPaste={handlePaste} tabIndex={0} className={`group relative border-2 border-dashed rounded-lg overflow-visible bg-gray-50 image-preview-responsive flex flex-col h-full ${
      highlight ? 'border-orange-400' : 'border-gray-200'
    }`}>
      {/* 顶部浮层标题（仅在需要时显示） */}
      {showBeforeBadge && imagePreviews.length > 0 && (
        <div className="absolute top-2 left-2 z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <span className="inline-block bg-black/60 text-white text-sm px-2.5 py-1 rounded">
            修改前
          </span>
        </div>
      )}
      
      {/* 顶部右侧浮层操作按钮（添加 / 清除） */}
      {imagePreviews.length > 0 && (
        <div className="absolute top-2 right-2 z-20 flex space-x-2 pointer-events-none">
          <button
            type="button"
            className="pointer-events-auto w-9 h-9 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center transition-colors disabled:bg-gray-300 shadow"
            onClick={() => {
              if (onRequestUploadLeft) {
                onRequestUploadLeft();
              } else {
                fileInputRef?.current?.click();
              }
            }}
            disabled={isSubmitting || isProcessing || uploadedFiles.length >= 2}
            title={uploadedFiles.length >= 2 ? '已达上限' : '添加更多'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            type="button"
            className="pointer-events-auto w-9 h-9 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors disabled:bg-gray-300 shadow"
            onClick={() => {
              if (onClearAll) {
                onClearAll();
              }
            }}
            disabled={isSubmitting || isProcessing}
            title="清除所有"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        {/* 原图预览 - 多张图片共享预览区域 */}
        <div className="h-full">
          {imagePreviews.length > 0 ? (
            <div
              className={`relative grid gap-2 ${getGridLayoutClass(imagePreviews.length)} h-full`}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsGridDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsGridDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsGridDragOver(false); }}
              onDrop={handleGridDropAppend}
            >
              {isGridDragOver && dragOverIndex === null && (
                <div className="pointer-events-none absolute inset-0 rounded-lg border-2 border-green-500/80">
                  <div className="absolute top-2 right-2 bg-green-600 text-white text-xs px-2 py-0.5 rounded shadow">追加</div>
                </div>
              )}
              {imagePreviews.map((preview, index) => (
                <div key={index} className={`relative group ${
                  imagePreviews.length === 3 && index === 2 ? 'col-span-2' : ''
                }`}>
                  <div 
                    className="w-full h-full overflow-hidden bg-gray-100 cursor-pointer hover:bg-gray-50 transition-colors flex items-start justify-center"
                    onClick={() => {
                      // 调用预览功能
                      if (onImagePreview) {
                        onImagePreview(preview, '修改前', 'before');
                      }
                    }}
                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverIndex(index); setIsGridDragOver(false); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverIndex(index); }}
                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverIndex((cur) => cur === index ? null : cur); }}
                    onDrop={(e) => handleTileDropReplace(e, index)}
                  >
                    <img
                      src={preview}
                      alt={`原图 ${index + 1}`}
                      className="original-image w-full h-full object-contain object-top hover:scale-105 transition-transform duration-200"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        setLocalDims(prev => {
                          const next = [...prev];
                          next[index] = { width: img.naturalWidth, height: img.naturalHeight };
                          return next;
                        });
                      }}
                    />
                  </div>
                  {dragOverIndex === index && (
                    <div className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-blue-500/80 bg-blue-500/5 flex items-center justify-center">
                      <span className="text-blue-700 text-xs font-semibold px-2 py-0.5 rounded bg-white/80 shadow">替换</span>
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onFileRemove) {
                        onFileRemove(index);
                      }
                    }}
                    className="absolute top-2 right-2 bg-red-500 text-white w-9 h-9 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600 shadow-lg flex items-center justify-center"
                    disabled={isSubmitting || isProcessing}
                    title="删除图片"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  {/* 移除左下角文件名显示，保持画面简洁 */}
                  {/* 去除“点击预览原图”提示，保持画面简洁 */}
                </div>
              ))}
            </div>
          ) : (
            <div
              className={`h-full flex items-center justify-center transition-colors duration-200 rounded-lg p-8 text-center ${
                dragActive ? 'bg-primary-50' : 'hover:bg-gray-100'
              }`}
              {...(onDragHandlers || {})}
            >
              <div className="max-w-md mx-auto space-y-3">
                {/* 彩色图标圆片，增强空态识别度 */}
                <div className="mx-auto w-14 h-14 rounded-full bg-green-50 flex items-center justify-center text-green-600 shadow-sm">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6H16a5 5 0 011 9.9M12 12v6m0 0l-3-3m3 3l3-3" />
                  </svg>
                </div>
                {/* 主标题与说明分层，字号稍增大 */}
                <p className="text-base sm:text-lg font-semibold text-green-700">上传原图</p>
                <p className="text-sm sm:text-base text-gray-600">拖拽到此处或点击下方按钮上传</p>
                <div className="flex justify-center">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      if (onRequestUploadLeft) {
                        onRequestUploadLeft();
                      } else {
                        fileInputRef?.current?.click();
                      }
                    }}
                    disabled={isSubmitting || isProcessing}
                  >
                    选择图片
                  </button>
                </div>
                <p className="text-xs text-gray-400">支持 JPG / PNG / GIF / WebP，最大 10MB</p>
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
        multiple
        max={2}
        onChange={onFileInputChange}
      />
    </div>
  );
};
