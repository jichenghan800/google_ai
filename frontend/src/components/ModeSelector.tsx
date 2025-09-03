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
    title: 'AI创作',
    description: '文字生成图片',
    detailedDescription: '通过自然语言描述生成高质量图像，支持详细场景描述和艺术风格指定。',
    color: 'from-purple-500 to-pink-500'
  },
  {
    id: 'edit',
    icon: '✨',
    title: '智能编辑',
    description: '图片智能修改',
    detailedDescription: '上传现有图像，结合文字指令进行智能编辑，修改元素、调整风格、改变构图。',
    color: 'from-blue-500 to-cyan-500'
  },
  {
    id: 'analyze',
    icon: '🔍',
    title: '图像分析',
    description: '深度内容解读',
    detailedDescription: '全面分析图像内容，识别对象、场景、情感、风格，提供详细描述和改进建议。',
    color: 'from-green-500 to-teal-500'
  },
  {
    id: 'style',
    icon: '🎭',
    title: '风格转换',
    description: '艺术风格变换',
    detailedDescription: '将图像转换为各种艺术风格，如油画、水彩、素描、动漫等视觉表现力。',
    color: 'from-orange-500 to-red-500'
  },
  {
    id: 'iterative',
    icon: '🔄',
    title: '迭代精修',
    description: '多轮优化完善',
    detailedDescription: '通过多次交互对话逐步完善图像，进行细微调整、局部修改直到理想效果。',
    color: 'from-indigo-500 to-purple-500'
  }
];

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  selectedMode,
  onModeChange,
  onSystemPromptClick,
  isProcessing = false
}) => {
  const [hoveredMode, setHoveredMode] = React.useState<AIMode | null>(null);
  return (
    <div className="w-full max-w-6xl mx-auto mb-8">
      {/* 标题 */}
      <div className="text-center mb-8">
        <div className="relative mb-6">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-4">
            AI 图像创作平台
          </h1>
        </div>
        
        <div className="mb-6">
          <p className="text-lg text-gray-600">基于 Nano Banana 的智能图像处理助手</p>
        </div>
      </div>

      {/* 模式选择按钮 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {modeOptions.map((mode) => (
          <button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            onMouseEnter={() => setHoveredMode(mode.id)}
            onMouseLeave={() => setHoveredMode(null)}
            className={`
              group relative overflow-hidden rounded-xl p-4 text-left transition-all duration-300 transform hover:scale-105 h-32 flex flex-col justify-between
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
            <div className="relative z-10 flex flex-col h-full">
              {/* 上半部分：图标和标题 */}
              <div className="flex-shrink-0">
                {/* 图标 */}
                <div className="text-2xl mb-2 transition-transform duration-300 group-hover:scale-110 text-center">
                  {mode.icon}
                </div>

                {/* 标题 */}
                <h3 className={`
                  font-semibold text-base mb-1 transition-colors duration-300 text-center
                  ${selectedMode === mode.id ? 'text-blue-600' : 'text-gray-900 group-hover:text-blue-600'}
                `}>
                  {mode.title}
                </h3>
              </div>

              {/* 下半部分：描述 */}
              <div className="flex-grow flex items-center justify-center">
                <p className="text-sm text-gray-600 leading-relaxed text-center">
                  {mode.description}
                </p>
              </div>

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

      {/* 当前选中模式的详细信息 */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between">
          <div className="flex items-start space-x-3">
            <div className="text-2xl">
              {modeOptions.find(mode => mode.id === (hoveredMode || selectedMode))?.icon}
            </div>
            <div>
              <h4 className="font-semibold text-blue-900">
                {hoveredMode ? '预览模式' : '当前模式'}：{modeOptions.find(mode => mode.id === (hoveredMode || selectedMode))?.title}
              </h4>
              <p className="text-blue-700 text-sm mt-1 leading-relaxed">
                {modeOptions.find(mode => mode.id === (hoveredMode || selectedMode))?.detailedDescription}
              </p>
            </div>
          </div>
          {onSystemPromptClick && (
            <div className="flex items-center">
              <button
                type="button"
                onClick={onSystemPromptClick}
                disabled={isProcessing}
                className="bg-white border-2 border-green-500 text-green-600 hover:bg-green-50 transition-colors px-4 py-2 rounded-lg text-sm flex items-center space-x-2"
                title="配置系统提示词"
              >
                <span>⚙️</span>
                <span>System Prompt</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};