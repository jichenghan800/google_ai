import React from 'react';

export type AIMode = 'generate' | 'edit' | 'analyze';

interface ModeToggleProps {
  selectedMode: AIMode;
  onModeChange: (mode: AIMode) => void;
  isProcessing?: boolean;
  compact?: boolean;
  size?: 'normal' | 'large' | 'compact';
}

const modes = [
  { id: 'generate' as AIMode, icon: '🎨', label: '图片生成' },
  { id: 'edit' as AIMode, icon: '✨', label: '图片编辑' },
  { id: 'analyze' as AIMode, icon: '🔍', label: '图像分析' }
];

export const ModeToggle: React.FC<ModeToggleProps> = ({
  selectedMode,
  onModeChange,
  isProcessing = false,
  compact = false,
  size = 'normal'
}) => {
  const isCompact = size === 'compact' || compact;
  const isLarge = size === 'large';
  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 ${isCompact ? 'p-1' : isLarge ? 'p-5' : 'p-4'}`}>
      <div className={`flex bg-gray-100 rounded-lg ${isCompact ? 'p-0.5' : isLarge ? 'p-1.5' : 'p-1'}`}>
        {modes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => !isProcessing && onModeChange(mode.id)}
            disabled={isProcessing}
            className={`flex-1 ${isCompact ? 'py-1.5 px-2 text-xs' : isLarge ? 'py-4 px-6 text-base' : 'py-3 px-4 text-sm'} rounded-md font-medium transition-all duration-200 flex items-center justify-center space-x-2 ${
              selectedMode === mode.id
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={isCompact ? 'text-base' : isLarge ? 'text-2xl' : 'text-lg'}>{mode.icon}</span>
            <span>{mode.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
