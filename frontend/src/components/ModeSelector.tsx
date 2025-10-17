import React from 'react';

export type AIMode = 'generate' | 'edit' | 'analyze' | 'style' | 'iterative';

interface ModeOption {
  id: AIMode;
  icon: string;
  title: string;
  description: string;
  detailedDescription: string;
  color: string;
}

interface ModeSelectorProps {
  selectedMode: AIMode;
  onModeChange: (mode: AIMode) => void;
  onSystemPromptClick?: () => void;
  isProcessing?: boolean;
}

const modeOptions: ModeOption[] = [
  {
    id: 'generate',
    icon: '🎨',
    title: '图像生成',
    description: '文字生成图片',
    detailedDescription: '通过自然语言描述生成高质量图像，支持详细场景描述和艺术风格指定。',
    color: 'from-purple-500 to-pink-500'
  },
  {
    id: 'edit',
    icon: '✨',
    title: '图片编辑',
    description: '图片智能修改',
    detailedDescription: '上传现有图像，结合文字指令进行智能编辑，修改元素、调整风格、改变构图。',
    color: 'from-blue-500 to-cyan-500'
  },
  {
    id: 'analyze',
    icon: '🔍',
    title: '图片分析',
    description: '深度内容解读',
    detailedDescription: '全面分析图像内容，识别对象、场景、情感、风格，提供详细描述和改进建议。',
    color: 'from-green-500 to-teal-500'
  }
];

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  selectedMode,
  onModeChange,
  onSystemPromptClick,
  isProcessing = false
}) => {
  const [hoveredMode, setHoveredMode] = React.useState<AIMode | null>(null);
  const [clickCount, setClickCount] = React.useState(0);
  const clickTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // 处理系统提示词点击
  React.useEffect(() => {
    if (clickCount >= 5 && onSystemPromptClick) {
      onSystemPromptClick();
      setClickCount(0);
    }
  }, [clickCount, onSystemPromptClick]);

  const handleSubtitleClick = () => {
    setClickCount(prev => {
      const newCount = prev + 1;
      
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      
      if (newCount < 5) {
        clickTimeoutRef.current = setTimeout(() => {
          setClickCount(0);
        }, 1000);
      }
      
      return newCount;
    });
  };
  return (
    <div className="w-full max-w-6xl mx-auto mb-4">
      {/* 标题 */}
      <div className="text-center mb-4">
        <div className="relative mb-3">
          <h1 className="text-responsive-title font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
            AI 图像创作平台
          </h1>
        </div>
        
        <div className="mb-4">
          <p 
            className={`text-responsive-subtitle text-gray-600 cursor-pointer select-none transition-all duration-200 ${
              clickCount > 0 ? 'text-blue-600 scale-105' : 'hover:text-gray-800'
            }`}
            onClick={handleSubtitleClick}
            title={clickCount > 0 ? `${clickCount}/5 clicks` : undefined}
          >
            基于 Nano Banana 的智能图像处理助手
            {clickCount > 0 && (
              <span className="ml-2 text-xs text-blue-500">
                {'●'.repeat(clickCount)}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* 模式选择按钮 */}
      <div className="mode-grid-responsive">
        {modeOptions.map((mode) => (
          <button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            onMouseEnter={() => setHoveredMode(mode.id)}
            onMouseLeave={() => setHoveredMode(null)}
            className={`
              group relative overflow-hidden rounded-xl text-left transition-all duration-300 transform hover:scale-105 mode-card-responsive flex flex-col justify-between
              ${selectedMode === mode.id
                ? 'ring-2 ring-blue-500 shadow-xl bg-white'
                : 'bg-white hover:shadow-lg border border-gray-200 hover:border-gray-300'
              }
            `}
          >
            {/* 选中状态的背景渐变 */}
            {selectedMode === mode.id && (
              <div className={`absolute inset-0 bg-gradient-to-br ${mode.color} opacity-5`} />
            )}

            {/* 内容 */}
            <div className="relative z-10 flex flex-col h-full justify-center items-center">
              {/* 图标 */}
              <div className="icon-responsive mb-2 transition-transform duration-300 group-hover:scale-110 text-center">
                {mode.icon}
              </div>

              {/* 标题 */}
              <h3 className={`
                font-semibold text-sm xs:text-base sm:text-lg md:text-xl 2xl:text-2xl transition-colors duration-300 text-center
                ${selectedMode === mode.id ? 'text-blue-600' : 'text-gray-900 group-hover:text-blue-600'}
              `}>
                {mode.title}
              </h3>

              {/* 选中指示器 */}
              {selectedMode === mode.id && (
                <div className="absolute top-3 right-3">
                  <div className="w-2.5 h-2.5 bg-blue-500 rounded-full flex items-center justify-center">
                    <div className="w-1 h-1 bg-white rounded-full"></div>
                  </div>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* 当前选中模式的信息 */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center space-x-3">
          <div className="text-2xl">
            {modeOptions.find(mode => mode.id === (hoveredMode || selectedMode))?.icon}
          </div>
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-blue-900">
              {hoveredMode ? '预览模式' : '当前模式'}：{modeOptions.find(mode => mode.id === (hoveredMode || selectedMode))?.title}
            </span>
            <span className="text-blue-600 text-sm">
              {modeOptions.find(mode => mode.id === (hoveredMode || selectedMode))?.description}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
