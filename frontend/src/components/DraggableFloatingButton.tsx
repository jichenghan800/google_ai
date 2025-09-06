import React, { useState, useRef, useEffect, useCallback } from 'react';

interface DraggableFloatingButtonProps {
  children: React.ReactNode;
  className?: string;
  initialPosition?: { x: number; y: number };
  onPositionChange?: (position: { x: number; y: number }) => void;
}

export const DraggableFloatingButton: React.FC<DraggableFloatingButtonProps> = ({
  children,
  className = '',
  initialPosition,
  onPositionChange
}) => {
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialPosition) {
      setPosition(initialPosition);
    } else if (typeof window !== 'undefined') {
      setPosition({
        x: Math.max(20, window.innerWidth / 2 - 100),
        y: Math.max(20, window.innerHeight - 320)
      });
    }
  }, [initialPosition]);

  const handleStart = (clientX: number, clientY: number) => {
    if (!buttonRef.current) return;
    
    const rect = buttonRef.current.getBoundingClientRect();
    setDragOffset({
      x: clientX - rect.left,
      y: clientY - rect.top
    });
    setIsDragging(true);
  };

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging || typeof window === 'undefined') return;

    const newX = clientX - dragOffset.x;
    const newY = clientY - dragOffset.y;

    const maxX = window.innerWidth - (buttonRef.current?.offsetWidth || 0);
    const maxY = window.innerHeight - (buttonRef.current?.offsetHeight || 0);

    const boundedPosition = {
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY))
    };

    setPosition(boundedPosition);
    onPositionChange?.(boundedPosition);
  }, [isDragging, dragOffset, onPositionChange]);

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
        left: `${position.x}px`,
        top: `${position.y}px`,
        touchAction: 'none'
      }}
    >
      {React.cloneElement(children as React.ReactElement, {
        onDragStart: (clientX: number, clientY: number) => handleStart(clientX, clientY)
      })}
    </div>
  );
};
