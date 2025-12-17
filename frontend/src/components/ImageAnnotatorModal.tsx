import React, { useEffect, useRef } from 'react';
import 'tui-image-editor/dist/tui-image-editor.css';
import '../styles/tui-editor-overrides.css';

const COLORS = ['#ff4d4f', '#36b37e', '#0065ff', '#ffab00', '#6554c0'];
const DEFAULT_COLOR = COLORS[0];

const getViewportSize = () => {
  if (typeof window === 'undefined') {
    return { width: 1200, height: 900 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
};

interface ImageAnnotatorModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  originalUrl?: string | null;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

export const ImageAnnotatorModal: React.FC<ImageAnnotatorModalProps> = ({
  isOpen,
  imageUrl,
  originalUrl,
  onClose,
  onSave
}) => {
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const editorInstanceRef = useRef<any>(null);
  // 动态加载构造函数，避免直接 import 缺少类型时报错
  const editorCtorRef = useRef<any>(null);

  const applyDefaultBrush = (inst: any) => {
    try {
      inst.startDrawingMode('FREE_DRAW', { width: 4, color: DEFAULT_COLOR });
      if (inst.setBrush) {
        inst.setBrush({ width: 4, color: DEFAULT_COLOR });
      }
    } catch (e) {
      console.warn('init brush failed', e);
    }
  };

  // esc 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // 初始化原生 tui-image-editor 实例（替代 React 包装以规避 fire(null)）
  useEffect(() => {
    if (!isOpen) return;
    if (!imageUrl) return;
    if (!editorRootRef.current) return;

    let destroyed = false;

    const init = async () => {
      try {
        if (!editorCtorRef.current) {
          const mod = await import('tui-image-editor');
          editorCtorRef.current = (mod as any).default || (mod as any);
        }
        if (destroyed || !editorRootRef.current) return;
        // 销毁旧实例（如果有）
        if (editorInstanceRef.current?.destroy) {
          try { editorInstanceRef.current.destroy(); } catch {}
        }
        const EditorCtor = editorCtorRef.current;
        const { width: viewportWidth, height: viewportHeight } = getViewportSize();
        const editorMaxWidth = Math.min(1400, viewportWidth - 80);
        const editorMaxHeight = Math.min(1000, Math.max(640, viewportHeight - 160));
        const inst = new EditorCtor(editorRootRef.current, {
          includeUI: {
            loadImage: { path: imageUrl, name: 'image' },
            menu: ['draw'],
            initMenu: 'draw',
            menuBarPosition: 'left',
            theme: {
              'common.bi.display': 'none',
              'menu.normalIcon.color': '#666',
              'menu.activeIcon.color': '#111',
              'submenu.normalLabel.color': '#111',
              'submenu.activeLabel.color': '#111',
              'submenu.normalLabel.fontWeight': '400',
              'submenu.activeLabel.fontWeight': '600'
            }
          },
          cssMaxHeight: editorMaxHeight,
          cssMaxWidth: editorMaxWidth,
          selectionStyle: { cornerSize: 16, rotatingPointOffset: 32 },
          usageStatistics: false
        });
        editorInstanceRef.current = inst;
        inst.on?.('loadImage', () => applyDefaultBrush(inst));
        applyDefaultBrush(inst);
      } catch (e) {
        console.error('init tui-image-editor failed', e);
      }
    };

    init();

    return () => {
      destroyed = true;
      const inst = editorInstanceRef.current;
      if (inst?.destroy) {
        try { inst.destroy(); } catch {}
      }
      editorInstanceRef.current = null;
    };
  }, [isOpen, imageUrl]);

  const handleClear = async () => {
    if (!originalUrl || !editorInstanceRef.current) return;
    const inst = editorInstanceRef.current;
    if (!inst) return;
    try {
      await inst.loadImageFromURL(originalUrl, 'image');
      applyDefaultBrush(inst);
    } catch (e) {
      console.warn('clear failed', e);
    }
  };

  const handleSave = () => {
    const inst = editorInstanceRef.current;
    if (!inst) return;
    try {
      const dataUrl = inst.toDataURL();
      if (dataUrl) {
        onSave(dataUrl);
      }
    } catch (e) {
      console.warn('save failed', e);
    }
  };

  if (!isOpen || !imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4 md:p-8"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[1400px] h-[90vh] max-h-[92vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-2 left-3 right-3 z-20 flex items-center justify-between bg-transparent pointer-events-none">
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-md bg-black/45 px-2.5 py-1.5 text-sm font-semibold text-white backdrop-blur-sm">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            <span>图片标记</span>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              onClick={handleClear}
              className="px-2.5 py-1 text-xs rounded-md bg-black/45 text-white hover:bg-black/55 border border-white/10 transition-colors backdrop-blur-sm"
            >
              clear
            </button>
            <button
              onClick={handleSave}
              className="px-2.5 py-1 text-xs rounded-md bg-blue-600/90 text-white hover:bg-blue-600 transition-colors shadow-sm"
            >
              保存
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-black/35 text-white hover:bg-black/50 transition-colors backdrop-blur-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 p-0 pt-0 pb-0 overflow-hidden">
          <div ref={editorRootRef} className="h-full w-full min-h-[520px] md:min-h-[560px] rounded-lg bg-gray-50" />
        </div>
      </div>
    </div>
  );
};
