import React from 'react';

interface DraggableActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  icon: React.ReactNode;
  children: React.ReactNode;
  onDragStart?: (clientX: number, clientY: number) => void;
}

export const DraggableActionButton: React.FC<DraggableActionButtonProps> = ({
  onClick,
  disabled,
  className,
  style,
  icon,
  children,
  onDragStart
}) => {
  const handleDragMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDragStart?.(e.clientX, e.clientY);
  };

  const handleDragTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.touches[0];
    onDragStart?.(touch.clientX, touch.clientY);
  };

  return (
    <div className="flex items-center backdrop-blur-md border-2 transition-all duration-300 shadow-lg hover:shadow-xl rounded-2xl overflow-hidden">
      <div 
        className="cursor-move hover:bg-white/30 px-3 py-2 transition-colors flex items-center border-r border-white/20"
        onMouseDown={handleDragMouseDown}
        onTouchStart={handleDragTouchStart}
        title="拖动移动按钮"
      >
        {icon}
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`${className} border-none rounded-none flex-1`}
        style={style}
      >
        {children}
      </button>
    </div>
  );
};
