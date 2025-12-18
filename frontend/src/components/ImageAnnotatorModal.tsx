import React, { useEffect, useMemo, useRef, useState } from 'react';
import 'tui-image-editor/dist/tui-image-editor.css';
import '../styles/tui-editor-overrides.css';

const PALETTE = ['#ff4d4f', '#f9d64a', '#34d399', '#3b82f6', '#ffffff'];
const DEFAULT_COLOR = PALETTE[0];

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
  const colorRef = useRef<string>(DEFAULT_COLOR);
  const [selectedColor, setSelectedColor] = useState<string>(DEFAULT_COLOR);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const applyBrush = (inst: any, color: string) => {
    try {
      inst.ui?.changeMenu?.('draw');
    } catch {}
    try {
      inst.startDrawingMode?.('FREE_DRAWING', { width: 8, color });
    } catch (e) {
      console.warn('startDrawingMode failed', e);
    }
    try {
      inst.setBrush?.({ width: 8, color });
    } catch (e) {
      console.warn('set brush failed', e);
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
        const editorMaxWidth = Math.min(1500, viewportWidth - 48);
        const editorMaxHeight = Math.min(1200, Math.max(640, viewportHeight - 100));
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
        inst.on?.('loadImage', () => {
          applyBrush(inst, colorRef.current);
          setCanUndo(false);
          setCanRedo(false);
        });
        inst.on?.('undoStackChanged', (len: number) => setCanUndo(!!len));
        inst.on?.('redoStackChanged', (len: number) => setCanRedo(!!len));
        applyBrush(inst, colorRef.current);
      } catch (e) {
        console.error('init tui-image-editor failed', e);
      }
    };

    init();

    return () => {
      destroyed = true;
      const inst = editorInstanceRef.current;
      if (inst?.destroy) {
        try {
          inst.off?.('undoStackChanged');
          inst.off?.('redoStackChanged');
          inst.destroy();
        } catch {}
      }
      editorInstanceRef.current = null;
      setCanUndo(false);
      setCanRedo(false);
    };
  }, [isOpen, imageUrl]);

  useEffect(() => {
    colorRef.current = selectedColor;
    const inst = editorInstanceRef.current;
    if (inst?.setBrush) {
      try {
        applyBrush(inst, selectedColor);
      } catch (e) {
        console.warn('set brush color failed', e);
      }
    }
  }, [selectedColor]);

  useEffect(() => {
    if (!isOpen) return;
    colorRef.current = DEFAULT_COLOR;
    setSelectedColor(DEFAULT_COLOR);
    const inst = editorInstanceRef.current;
    if (inst) {
      applyBrush(inst, DEFAULT_COLOR);
    }
  }, [isOpen]);

  const handleColorPick = (hex: string) => {
    setSelectedColor(hex);
  };

  const handleClear = async () => {
    if (!originalUrl || !editorInstanceRef.current) return;
    const inst = editorInstanceRef.current;
    if (!inst) return;
    try {
      await inst.loadImageFromURL(originalUrl, 'image');
      applyBrush(inst, colorRef.current);
      setCanUndo(false);
      setCanRedo(false);
    } catch (e) {
      console.warn('clear failed', e);
    }
  };

  const handleUndo = async () => {
    const inst = editorInstanceRef.current;
    if (!inst) return;
    try {
      await inst.undo?.();
    } catch (e) {
      console.warn('undo failed', e);
    }
  };

  const handleRedo = async () => {
    const inst = editorInstanceRef.current;
    if (!inst) return;
    try {
      await inst.redo?.();
    } catch (e) {
      console.warn('redo failed', e);
    }
  };

  const glassPanelStyle = useMemo(() => ({
    background: 'var(--annotator-glass)',
    border: '1px solid var(--border-soft)',
    boxShadow: '0 30px 80px -40px rgba(0,0,0,0.55)',
    backdropFilter: 'blur(16px) saturate(150%)',
    WebkitBackdropFilter: 'blur(16px) saturate(150%)'
  }), []);

  const glassCanvasStyle = useMemo(() => ({
    background: 'var(--annotator-canvas)',
    border: '1px solid var(--border-soft)',
    boxShadow: 'inset 0 18px 48px -40px rgba(0,0,0,0.55)'
  }), []);

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
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-2 md:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[1500px] h-[94vh] max-h-[96vh] rounded-2xl overflow-hidden flex flex-col"
        style={glassPanelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-2 left-3 right-3 z-20 flex items-center justify-between bg-transparent pointer-events-none">
          <button
            type="button"
            onClick={onClose}
            className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/50 transition-colors backdrop-blur-sm"
            title="返回（不保存）"
            aria-label="返回（不保存）"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden p-1.5">
          <div
            ref={editorRootRef}
            className="h-full w-full rounded-xl"
            style={glassCanvasStyle}
          />
        </div>

        <div className="pointer-events-none absolute top-5 right-6 z-30 flex items-center justify-center">
          <div className="pointer-events-auto flex items-center gap-2 px-2 py-1 rounded-full bg-transparent">
            {PALETTE.map((c) => {
              const selected = selectedColor === c;
              return (
                <button
                  key={c}
                  onClick={() => handleColorPick(c)}
                  className={[
                    'transition-transform duration-150 ease-out',
                    selected ? 'scale-120 ring-2 ring-[rgba(59,130,246,0.35)]' : 'scale-90 opacity-90'
                  ].join(' ')}
                  style={{
                    width: selected ? 28 : 22,
                    height: selected ? 28 : 22,
                    borderRadius: '999px',
                    background: c,
                    border: c === '#ffffff' ? '1px solid #d1d5db' : '1px solid rgba(0,0,0,0.05)',
                    boxShadow: '0 6px 16px -10px rgba(0,0,0,0.45)'
                  }}
                  title={c}
                />
              );
            })}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 right-3 z-30 flex items-end justify-end gap-3">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className="pointer-events-auto w-11 h-11 rounded-full bg-black/45 text-white hover:bg-black/60 transition-colors backdrop-blur-sm border border-white/10 shadow-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            title="上一步"
            aria-label="上一步"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 15l-6-6 6-6" />
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 9h10a6 6 0 0 1 0 12h-2" />
            </svg>
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className="pointer-events-auto w-11 h-11 rounded-full bg-black/45 text-white hover:bg-black/60 transition-colors backdrop-blur-sm border border-white/10 shadow-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            title="下一步"
            aria-label="下一步"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6-6-6" />
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M21 9H11a6 6 0 0 0 0 12h2" />
            </svg>
          </button>
          <button
            onClick={handleSave}
            className="pointer-events-auto w-11 h-11 rounded-full bg-blue-600/90 text-white hover:bg-blue-600 transition-colors border border-blue-500/80 shadow-lg flex items-center justify-center"
            title="保存"
            aria-label="保存"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 5h14v14H5z" />
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 3h6v4H9z" />
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 12h6v7H9z" />
            </svg>
          </button>
        </div>

        <div className="pointer-events-none absolute bottom-4 left-4 z-30">
          <button
            onClick={handleClear}
            className="pointer-events-auto w-10 h-10 rounded-full bg-black/45 text-white hover:bg-black/60 transition-colors backdrop-blur-sm flex items-center justify-center shadow-lg"
            title="clear"
            aria-label="clear"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
