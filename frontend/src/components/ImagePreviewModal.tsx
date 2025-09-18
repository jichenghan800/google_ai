import React from 'react';
import ReactDOM from 'react-dom';

interface ImagePreviewModalProps {
  imageUrl: string | null;
  title: string;
  type: 'before' | 'after';
  isOpen: boolean;
  onClose: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  imageUrl,
  title,
  type,
  isOpen,
  onClose
}) => {
  if (!isOpen || !imageUrl) return null;

  // Zoom & Pan state
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const draggingRef = React.useRef(false);
  const lastPosRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const imgWrapRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Reset on open/close or new image
  React.useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [isOpen, imageUrl]);

  // Lock page scroll while modal is open
  React.useEffect(() => {
    if (!isOpen) return;
    const htmlEl = document.documentElement as HTMLElement;
    const prevBodyOv = document.body.style.overflow;
    const prevHtmlOv = htmlEl.style.overflow;
    const prevBodyPos = document.body.style.position;
    const prevBodyTop = document.body.style.top as string;
    const prevBodyWidth = document.body.style.width;
    const scrollY = window.scrollY || window.pageYOffset || 0;

    // Freeze background by fixing body position. This is enough to prevent background scroll
    // so we don't need to globally block wheel events (which would also block zoom inside modal).
    htmlEl.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    htmlEl.style.overflow = 'hidden';
    (document.body.style as any).overscrollBehavior = 'none';
    (htmlEl.style as any).overscrollBehavior = 'none';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      document.body.style.overflow = prevBodyOv;
      htmlEl.style.overflow = prevHtmlOv;
      htmlEl.classList.remove('modal-open');
      (document.body.style as any).overscrollBehavior = '';
      (htmlEl.style as any).overscrollBehavior = '';
      document.body.style.position = prevBodyPos;
      document.body.style.top = prevBodyTop || '';
      document.body.style.width = prevBodyWidth;
      try {
        const y = Math.abs(parseInt(prevBodyTop || '0', 10));
        if (y) window.scrollTo(0, y);
      } catch {}
    };
  }, [isOpen]);

  // Extra guard: capture wheel/touch on window to prevent background scroll
  // while still letting events bubble to our inner handler for zoom
  React.useEffect(() => {
    if (!isOpen) return;
    const onWheel = (e: WheelEvent) => { try { e.preventDefault(); } catch {} };
    const onTouch = (e: TouchEvent) => { try { e.preventDefault(); } catch {} };
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('touchmove', onTouch as any, { passive: false, capture: true });
    return () => {
      try {
        window.removeEventListener('wheel', onWheel as any, true as any);
        window.removeEventListener('touchmove', onTouch as any, true as any);
      } catch {}
    };
  }, [isOpen]);

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${type === 'before' ? 'original' : 'generated'}-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const modal = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-75 overscroll-contain"
      onClick={handleBackdropClick}
      // Globally prevent default scroll while modal is open so背景不会滚动；
      // 不阻断事件传播，放行到内部图片容器的 onWheel 来进行缩放。
      onWheelCapture={(e) => {
        e.preventDefault();
      }}
      onScrollCapture={(e) => {
        e.preventDefault();
      }}
      // 兼容某些浏览器的手势/触控滚动
      onTouchMoveCapture={(e) => {
        e.preventDefault();
      }}
      style={{ touchAction: 'none' }}
    >
      <div className="relative max-w-4xl max-h-full bg-white rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${
              type === 'before' ? 'bg-blue-500' : 'bg-green-500'
            }`}></div>
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors duration-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Image with wheel-zoom and pan */}
        <div
          ref={imgWrapRef}
          className="relative max-h-96 overflow-hidden bg-black/5 cursor-grab"
          onWheel={(e) => {
            e.preventDefault();
            // Zoom around the mouse position
            const rect = imgWrapRef.current?.getBoundingClientRect();
            const cx = rect ? e.clientX - rect.left : 0;
            const cy = rect ? e.clientY - rect.top : 0;
            const prev = scale;
            const delta = -e.deltaY; // wheel up -> positive
            const factor = delta > 0 ? 1.1 : 0.9;
            const next = Math.min(6, Math.max(1, prev * factor));
            if (next === prev) return;
            // Adjust offset so that the point under cursor stays under cursor
            const nx = cx - (cx - offset.x) * (next / prev);
            const ny = cy - (cy - offset.y) * (next / prev);
            setScale(next);
            setOffset({ x: nx, y: ny });
          }}
          onMouseDown={(e) => {
            draggingRef.current = true;
            lastPosRef.current = { x: e.clientX, y: e.clientY };
            (e.currentTarget as HTMLElement).classList.add('cursor-grabbing');
          }}
          onMouseMove={(e) => {
            if (!draggingRef.current) return;
            const dx = e.clientX - lastPosRef.current.x;
            const dy = e.clientY - lastPosRef.current.y;
            lastPosRef.current = { x: e.clientX, y: e.clientY };
            setOffset((p) => ({ x: p.x + dx, y: p.y + dy }));
          }}
          onMouseUp={(e) => {
            draggingRef.current = false;
            (e.currentTarget as HTMLElement).classList.remove('cursor-grabbing');
          }}
          onMouseLeave={(e) => {
            draggingRef.current = false;
            (e.currentTarget as HTMLElement).classList.remove('cursor-grabbing');
          }}
          onDoubleClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}
        >
          <img
            src={imageUrl}
            alt={title}
            className="select-none pointer-events-none"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              maxHeight: '24rem', // 96 * 0.25rem
              maxWidth: 'none',
              width: '100%',
              height: 'auto',
              objectFit: 'contain'
            }}
          />
          
          {/* Type indicator */}
          <div className={`absolute top-4 left-4 px-3 py-1 rounded text-sm font-medium ${
            type === 'before' 
              ? 'bg-blue-500/80 text-white' 
              : 'bg-green-500/80 text-white'
          }`}>
            {type === 'before' ? '原图' : '生成结果'}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center p-4 border-t">
          <div className="text-sm text-gray-500">
            点击背景或按 ESC 键关闭
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleDownload}
              className={`btn-primary flex items-center space-x-2 ${
                type === 'before' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-green-500 hover:bg-green-600'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>下载</span>
            </button>
            <button onClick={onClose} className="btn-secondary">
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Render in portal to avoid transformed ancestors affecting fixed overlay
  const portalRoot = typeof document !== 'undefined' ? document.body : null;
  return portalRoot ? ReactDOM.createPortal(modal, portalRoot) : modal;
};
