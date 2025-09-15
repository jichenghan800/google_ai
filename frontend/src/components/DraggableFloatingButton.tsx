import React, { useState, useRef, useEffect, useCallback } from 'react';

interface DraggableFloatingButtonProps {
  children: React.ReactNode;
  className?: string;
  initialPosition?: { x: number; y: number };
  onPositionChange?: (position: { x: number; y: number }) => void;
  storageKey?: string; // 新增：用于localStorage的键名
}

export const DraggableFloatingButton: React.FC<DraggableFloatingButtonProps> = ({
  children,
  className = '',
  initialPosition,
  onPositionChange,
  storageKey = 'draggable-button-position'
}) => {
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const frameRef = useRef<number | null>(null);
  const pendingPosRef = useRef<{ x: number; y: number } | null>(null);
  const SAFE_MARGIN = 12; // 避免贴边/跑出屏幕

  const clampToViewport = useCallback((pos: { x: number; y: number }) => {
    if (typeof window === 'undefined') return pos;
    const el = buttonRef.current;
    const w = sizeRef.current.w || el?.offsetWidth || 0;
    const h = sizeRef.current.h || el?.offsetHeight || 0;
    const maxX = Math.max(0, window.innerWidth - w - SAFE_MARGIN);
    const maxY = Math.max(0, window.innerHeight - h - SAFE_MARGIN);
    return {
      x: Math.min(Math.max(pos.x, SAFE_MARGIN), maxX),
      y: Math.min(Math.max(pos.y, SAFE_MARGIN), maxY)
    };
  }, [SAFE_MARGIN]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 尝试从localStorage加载位置
      const savedPosition = localStorage.getItem(storageKey);
      if (savedPosition) {
        try {
          const parsed = JSON.parse(savedPosition);
          // 先设置，再在下一帧按元素真实尺寸钳制到可视区
          setPosition(parsed);
          requestAnimationFrame(() => {
            const clamped = clampToViewport(parsed);
            setPosition(clamped);
            localStorage.setItem(storageKey, JSON.stringify(clamped));
          });
          return;
        } catch (error) {
          console.warn('Failed to parse saved position:', error);
        }
      }
      
      // 如果没有保存的位置，使用初始位置或默认位置
      if (initialPosition) {
        setPosition(initialPosition);
      } else {
        const defaultPos = {
          x: Math.max(SAFE_MARGIN, window.innerWidth - 260),
          y: Math.max(SAFE_MARGIN, window.innerHeight - 160)
        };
        const clamped = clampToViewport(defaultPos);
        setPosition(clamped);
      }
    }
  }, [initialPosition, storageKey, clampToViewport]);

  const handleStart = (clientX: number, clientY: number) => {
    if (!buttonRef.current) return;
    
    const rect = buttonRef.current.getBoundingClientRect();
    sizeRef.current = { w: rect.width, h: rect.height };
    setDragOffset({
      x: clientX - rect.left,
      y: clientY - rect.top
    });
    setIsDragging(true);
  };

  const flushFrame = useCallback(() => {
    if (!pendingPosRef.current || !buttonRef.current) return;
    const p = pendingPosRef.current;
    // 使用 transform 提升到合成层，减少回流与抖动
    buttonRef.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    frameRef.current = null;
  }, []);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging || typeof window === 'undefined') return;

    const newX = clientX - dragOffset.x;
    const newY = clientY - dragOffset.y;

    const boundedPosition = clampToViewport({ x: newX, y: newY });

    // rAF 批处理，避免每次触发 React 重渲染
    pendingPosRef.current = boundedPosition;
    if (frameRef.current == null) {
      frameRef.current = requestAnimationFrame(flushFrame);
    }
    // 拖动过程仅触发回调，不写入 localStorage，结束时统一持久化
    onPositionChange?.(boundedPosition);
  }, [isDragging, dragOffset, clampToViewport, flushFrame, onPositionChange]);
  
  // 监听窗口尺寸变化，防止按钮保存在越界位置
  useEffect(() => {
    const onResize = () => {
      setPosition(prev => {
        const clamped = clampToViewport(prev);
        localStorage.setItem(storageKey, JSON.stringify(clamped));
        return clamped;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [storageKey, clampToViewport]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    handleMove(e.clientX, e.clientY);
  }, [handleMove]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  }, [handleMove]);

  const handleEnd = () => {
    setIsDragging(false);
    // 拖拽结束：同步最终位置到 React state 与 localStorage
    const finalPos = pendingPosRef.current;
    if (finalPos) {
      const clamped = clampToViewport(finalPos);
      setPosition(clamped);
      try { localStorage.setItem(storageKey, JSON.stringify(clamped)); } catch {}
    }
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleEnd);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleEnd);
      };
    }
  }, [isDragging, handleMouseMove, handleTouchMove]);

  return (
    <div
      ref={buttonRef}
      className={`fixed z-50 select-none ${className}`}
      style={{
        left: `0px`,
        top: `0px`,
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        touchAction: 'none',
        willChange: 'transform'
      }}
    >
      {React.cloneElement(children as React.ReactElement, {
        onDragStart: (clientX: number, clientY: number) => handleStart(clientX, clientY)
      })}
    </div>
  );
};
