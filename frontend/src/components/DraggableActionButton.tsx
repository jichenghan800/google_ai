import React, { useCallback, useEffect, useRef } from 'react';

interface DraggableActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  icon: React.ReactNode;
  children: React.ReactNode;
  onDragStart?: (clientX: number, clientY: number) => void;
}

const LONG_PRESS_DELAY_MOUSE = 450;
const LONG_PRESS_DELAY_TOUCH = 280;
const MOVE_CANCEL_THRESHOLD = 6; // pixels

export const DraggableActionButton: React.FC<DraggableActionButtonProps> = ({
  onClick,
  disabled,
  className,
  style,
  icon,
  children,
  onDragStart
}) => {
  const pressTimeoutRef = useRef<number | null>(null);
  const hasTriggeredDragRef = useRef(false);
  const shouldBlockClickRef = useRef(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const latestPointRef = useRef<{ x: number; y: number } | null>(null);

  const clearPressTimer = useCallback(() => {
    if (pressTimeoutRef.current != null) {
      window.clearTimeout(pressTimeoutRef.current);
      pressTimeoutRef.current = null;
    }
  }, []);

  const resetTracking = useCallback(() => {
    clearPressTimer();
    hasTriggeredDragRef.current = false;
    startPointRef.current = null;
    latestPointRef.current = null;
  }, [clearPressTimer]);

  const scheduleLongPress = useCallback(
    (point: { x: number; y: number }, pointerType: 'mouse' | 'touch') => {
      if (!onDragStart) return;
      // Delay drag activation so short taps stay as normal clicks.
      const delay = pointerType === 'touch' ? LONG_PRESS_DELAY_TOUCH : LONG_PRESS_DELAY_MOUSE;
      pressTimeoutRef.current = window.setTimeout(() => {
        hasTriggeredDragRef.current = true;
        shouldBlockClickRef.current = true;
        const latest = latestPointRef.current ?? point;
        onDragStart(latest.x, latest.y);
      }, delay);
    },
    [onDragStart]
  );

  const handlePointerRelease = useCallback(() => {
    if (!startPointRef.current && !hasTriggeredDragRef.current) return;
    if (hasTriggeredDragRef.current) {
      shouldBlockClickRef.current = true;
    }
    resetTracking();
  }, [resetTracking]);

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0) return;
    startPointRef.current = { x: e.clientX, y: e.clientY };
    latestPointRef.current = { x: e.clientX, y: e.clientY };
    hasTriggeredDragRef.current = false;
    shouldBlockClickRef.current = false;
    clearPressTimer();
    scheduleLongPress({ x: e.clientX, y: e.clientY }, 'mouse');
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!startPointRef.current) return;
    latestPointRef.current = { x: e.clientX, y: e.clientY };

    if (!hasTriggeredDragRef.current) {
      const dx = e.clientX - startPointRef.current.x;
      const dy = e.clientY - startPointRef.current.y;
      if (Math.hypot(dx, dy) > MOVE_CANCEL_THRESHOLD) {
        resetTracking();
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const touch = e.touches[0];
    if (!touch) return;
    const point = { x: touch.clientX, y: touch.clientY };
    startPointRef.current = point;
    latestPointRef.current = point;
    hasTriggeredDragRef.current = false;
    shouldBlockClickRef.current = false;
    clearPressTimer();
    scheduleLongPress(point, 'touch');
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLButtonElement>) => {
    const touch = e.touches[0];
    if (!touch || !startPointRef.current) return;
    const point = { x: touch.clientX, y: touch.clientY };
    latestPointRef.current = point;

    if (!hasTriggeredDragRef.current) {
      const dx = point.x - startPointRef.current.x;
      const dy = point.y - startPointRef.current.y;
      if (Math.hypot(dx, dy) > MOVE_CANCEL_THRESHOLD) {
        resetTracking();
      }
    }
  };

  useEffect(() => {
    return () => {
      clearPressTimer();
    };
  }, [clearPressTimer]);

  useEffect(() => {
    // Ensure we always release the long-press tracker even if the pointer ends outside the button.
    const handleGlobalMouseUp = () => handlePointerRelease();
    const handleGlobalTouchEnd = () => handlePointerRelease();

    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalTouchEnd);
    window.addEventListener('touchcancel', handleGlobalTouchEnd);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
      window.removeEventListener('touchcancel', handleGlobalTouchEnd);
    };
  }, [handlePointerRelease]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (shouldBlockClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      shouldBlockClickRef.current = false;
      return;
    }
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handlePointerRelease}
      onMouseLeave={handlePointerRelease}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handlePointerRelease}
      onTouchCancel={handlePointerRelease}
      disabled={disabled}
      className={className}
      style={style}
      title="长按拖动按钮位置"
    >
      {icon}
      {children}
    </button>
  );
};
