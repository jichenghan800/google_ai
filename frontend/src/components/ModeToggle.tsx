import React from 'react';

export type AIMode = 'generate' | 'edit' | 'analyze';

interface ModeToggleProps {
  selectedMode: AIMode;
  onModeChange: (mode: AIMode) => void;
  isProcessing?: boolean;
}

const modes = [
  { id: 'generate' as AIMode, icon: '🎨', label: '图片生成' },
  { id: 'edit' as AIMode, icon: '✨', label: '图片编辑' },
  { id: 'analyze' as AIMode, icon: '🔍', label: '图像分析' }
];

export const ModeToggle: React.FC<ModeToggleProps> = ({
  selectedMode,
  onModeChange,
  isProcessing = false
}) => {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
      <div className="flex bg-gray-100 rounded-lg p-1">
        {modes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => !isProcessing && onModeChange(mode.id)}
            disabled={isProcessing}
            className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all duration-200 flex items-center justify-center space-x-2 ${
              selectedMode === mode.id
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className="text-lg">{mode.icon}</span>
            <span>{mode.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
