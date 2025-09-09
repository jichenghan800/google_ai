import React, { useState, useRef, useCallback } from 'react';
import { ImageEditResult, AspectRatioOption } from '../types/index.ts';
import { ModeToggle, AIMode } from './ModeToggle.tsx';
import { DynamicInputArea } from './DynamicInputArea.tsx';
import { DraggableFloatingButton } from './DraggableFloatingButton.tsx';
import { DraggableActionButton } from './DraggableActionButton.tsx';

// 宽高比选项配置
const aspectRatioOptions: AspectRatioOption[] = [
  {
    id: '1024x1024',
    label: '方图',
    description: '1024×1024',
    width: 1024,
    height: 1024,
    icon: '⬜',
    useCase: 'Square format'
  },
  {
    id: '1344x768',
    label: '横图',
    description: '1344×768',
    width: 1344,
    height: 768,
    icon: '📱',
    useCase: 'Landscape format'
  },
  {
    id: '768x1344',
    label: '竖图',
    description: '768×1344',
    width: 768,
    height: 1344,
    icon: '📱',
    useCase: 'Portrait format'
  }
];

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

interface IntegratedWorkflowProps {
  onProcessComplete: (result: ImageEditResult) => void;
  sessionId: string | null;
  isProcessing?: boolean;
  selectedMode?: AIMode;
  currentResult?: ImageEditResult | null;
  onClearResult?: () => void;
  onModeChange?: (mode: AIMode) => void;
  showSystemPromptModal?: boolean;
  onCloseSystemPromptModal?: () => void;
  onProcessStart?: () => void;
  onProcessError?: (error: string) => void;
}

// 工具函数：URL转File
const urlToFile = async (url: string, filename: string): Promise<File> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type });
};

export const IntegratedWorkflow: React.FC<IntegratedWorkflowProps> = ({
  onProcessComplete,
  sessionId,
  isProcessing = false,
  selectedMode = 'generate',
  currentResult,
  onClearResult,
  onModeChange,
  showSystemPromptModal = false,
  onCloseSystemPromptModal,
  onProcessStart,
  onProcessError
}) => {
  // 状态管理
  const [mode, setMode] = useState<AIMode>(selectedMode);
  const [selectedRatio, setSelectedRatio] = useState<AspectRatioOption>(aspectRatioOptions[1]); // 默认选择横图
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number}[]>([]);
  const [prompt, setPrompt] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  
  // 错误结果显示状态
  const [errorResult, setErrorResult] = useState<{
    type: 'policy_violation' | 'general_error';
    title: string;
    message: string;
    details?: string;
    originalResponse?: string;
    timestamp: number;
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 模式切换处理
  const handleModeChange = useCallback(async (newMode: AIMode) => {
    const previousMode = mode;
    
    // 从生成模式切换到编辑模式时的自动迁移
    if (previousMode === 'generate' && newMode === 'edit' && currentResult?.imageUrl) {
      try {
        const file = await urlToFile(currentResult.imageUrl, 'generated-image.png');
        setUploadedFiles([file]);
        setImagePreviews([currentResult.imageUrl]);
        
        // 清空右侧结果
        onClearResult?.();
        
        console.log('已自动加载生成的图片到编辑模式');
      } catch (error) {
        console.error('图片迁移失败:', error);
      }
    }
    
    // 切换到其他模式时清空上传的文件
    if (newMode === 'generate') {
      setUploadedFiles([]);
      setImagePreviews([]);
      setImageDimensions([]);
    }
    
    setMode(newMode);
    onModeChange?.(newMode);
  }, [mode, currentResult, onClearResult, onModeChange]);

  // 文件处理
  const handleFiles = useCallback((files: File[]) => {
    const maxFiles = mode === 'edit' ? 2 : 1;
    const validFiles = files.slice(0, maxFiles).filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) return;

    setUploadedFiles(validFiles);
    
    // 生成预览
    const previews: string[] = [];
    const dimensions: {width: number, height: number}[] = [];
    
    validFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        previews[index] = result;
        
        const img = new Image();
        img.onload = () => {
          dimensions[index] = { width: img.width, height: img.height };
          
          if (previews.length === validFiles.length && dimensions.length === validFiles.length) {
            setImagePreviews([...previews]);
            setImageDimensions([...dimensions]);
          }
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    });
  }, [mode]);

  // 拖拽处理
  const dragHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      handleFiles(Array.from(files));
    }
  };

  const handleFileRemove = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);
    const newDimensions = imageDimensions.filter((_, i) => i !== index);
    
    setUploadedFiles(newFiles);
    setImagePreviews(newPreviews);
    setImageDimensions(newDimensions);
  };

  // 提示词优化功能
  const handleOptimizePrompt = async () => {
    if (!prompt.trim() || !sessionId) return;
    
    setIsPolishing(true);
    try {
      // 使用用户自定义的system prompt，如果没有则使用默认的
      const currentSystemPrompt = systemPrompt || (mode === 'generate' 
        ? `你是一位专业的AI图像生成提示词优化专家，专门为Gemini 2.5 Flash Image Preview优化文生图提示词。

## 优化模板结构
1. 主体描述：清晰描述主要对象或人物
2. 环境场景：详细的背景和环境设定
3. 视觉风格：艺术风格、色彩搭配、光影效果
4. 构图细节：角度、景深、焦点
5. 情感氛围：整体感觉和情绪表达

## 优化要求
1. 将简单描述转化为叙事性场景
2. 增加视觉细节和感官描述
3. 使用专业摄影和艺术术语
4. 保持描述的连贯性和逻辑性
5. 突出视觉冲击力和美感
6. 确保描述适合AI理解和执行
7. 用中文输出优化后的提示词
8. 不要包含任何尺寸、分辨率或宽高比信息

请将输入转化为专业的、叙事驱动的提示词，遵循Gemini最佳实践。专注于场景描述和视觉叙事。只返回优化后的提示词，不要解释。`
        : `你是一位专业的AI图片编辑提示词优化专家，擅长为Gemini 2.5 Flash Image Preview生成精确的图片编辑指令。

请基于图片编辑最佳实践，优化用户的编辑指令，使其更加精确和专业。

## 优化重点
1. 明确编辑目标和范围
2. 保持原图的核心特征
3. 使用精确的编辑术语
4. 考虑视觉和谐性
5. 提供具体的修改指导

请优化编辑指令，使其更加专业和精确。只返回优化后的提示词，用中文输出。`);

      const response = await fetch(`${API_BASE_URL}/edit/polish-prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          originalPrompt: prompt,
          aspectRatio: selectedRatio.id,
          customSystemPrompt: currentSystemPrompt,
          promptType: selectedMode === 'edit' ? 'editing' : 'generation'
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.data?.polishedPrompt) {
        setPrompt(data.data.polishedPrompt);
      }
    } catch (error) {
      console.error('提示词优化失败:', error);
    } finally {
      setIsPolishing(false);
    }
  };

  // 提交处理 - 使用原来的完整实现
  const handleSubmit = async () => {
    if (!sessionId) {
      alert('会话未初始化，请刷新页面重试');
      return;
    }

    if (!prompt.trim()) {
      alert('请输入提示词');
      return;
    }

    // 智能编辑模式下必须上传图片
    if (mode === 'edit' && uploadedFiles.length === 0) {
      alert('智能编辑模式需要上传至少一张图片');
      return;
    }

    // 通知父组件开始处理
    onProcessStart?.();

    try {
      const formData = new FormData();
      
      // AI创作模式：如果没有上传图片，先生成背景图
      if (mode === 'generate' && uploadedFiles.length === 0) {
        console.log(`🎨 生成背景图片: ${selectedRatio.width}x${selectedRatio.height} (${selectedRatio.label})`);
        
        // 生成对应宽高比的背景图片
        const canvas = document.createElement('canvas');
        canvas.width = selectedRatio.width;
        canvas.height = selectedRatio.height;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          // 创建渐变背景
          const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
          gradient.addColorStop(0, '#f8f9fa');
          gradient.addColorStop(1, '#e9ecef');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        // 等待 blob 生成完成
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, 'image/png');
        });
        
        if (blob) {
          const backgroundImage = new File([blob], 'background.png', { type: 'image/png' });
          formData.append('images', backgroundImage);
          
          // 校验生成的背景图尺寸
          console.log(`✅ 背景图片已生成:`, {
            expectedSize: `${selectedRatio.width}x${selectedRatio.height}`,
            actualCanvasSize: `${canvas.width}x${canvas.height}`,
            fileSize: `${(blob.size / 1024).toFixed(2)}KB`,
            aspectRatio: selectedRatio.id,
            label: selectedRatio.label
          });
        }
      } else {
        // 添加用户上传的图片
        uploadedFiles.forEach((file, index) => {
          formData.append('images', file);
        });
      }
      
      formData.append('sessionId', sessionId);
      
      // 根据画布选择自动追加 --ar 参数到提示词
      const aspectRatioMap = {
        '1024x1024': '1:1',
        '1344x768': '16:9', 
        '768x1344': '9:16'
      };
      const aspectRatioParam = `--ar ${aspectRatioMap[selectedRatio.id]}`;
      const finalPrompt = `${prompt.trim()} ${aspectRatioParam}`;
      
      formData.append('prompt', finalPrompt);
      console.log('Final prompt with aspect ratio:', finalPrompt);
      
      // 添加分辨率参数
      formData.append('aspectRatio', selectedRatio.id);
      formData.append('width', selectedRatio.width.toString());
      formData.append('height', selectedRatio.height.toString());
      
      // 添加分析功能控制参数 - 智能编辑模式下默认启用
      formData.append('enableAnalysis', (mode === 'edit' && uploadedFiles.length > 0).toString());

      console.log('Submitting request to /edit/edit-images:', {
        mode,
        hasImages: uploadedFiles.length > 0 || (mode === 'generate'),
        aspectRatio: selectedRatio.id,
        dimensions: `${selectedRatio.width}x${selectedRatio.height}`
      });

      const response = await fetch(`${API_BASE_URL}/edit/edit-images`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      if (result.success) {
        console.log('✅ Processing completed:', result.data);
        onProcessComplete(result.data);
      } else {
        throw new Error(result.message || 'Processing failed');
      }
      
    } catch (error) {
      console.error('处理失败:', error);
      const errorMessage = error instanceof Error ? error.message : '处理失败';
      
      // 检查是否是内容政策违规错误
      if (errorMessage.includes('Content policy violation')) {
        setErrorResult({
          type: 'policy_violation',
          title: '内容政策违规',
          message: '上传的图片或编辑指令不符合AI安全政策要求',
          details: '可能原因：\n• 图片包含敏感内容\n• 编辑指令涉及不当内容\n• 图片质量或格式问题\n\n建议：\n• 更换其他图片\n• 修改编辑指令\n• 检查图片是否清晰可识别',
          originalResponse: errorMessage,
          timestamp: Date.now()
        });
        
        // 清除当前结果，让错误信息显示在结果区域
        onClearResult?.();
      }
      // 检查是否是敏感词被拒绝的情况
      else if (errorMessage.includes("Sorry, I'm unable to help you with that.")) {
        setErrorResult({
          type: 'policy_violation',
          title: '内容被拒绝',
          message: '提示词包含敏感信息被AI拒绝',
          details: '建议：\n• 调整提示词内容\n• 避免使用可能被视为敏感的词汇\n• 尝试更换描述方式',
          originalResponse: errorMessage,
          timestamp: Date.now()
        });
        
        onClearResult?.();
      } else {
        // 其他错误显示在结果区域
        setErrorResult({
          type: 'general_error',
          title: 'AI处理失败',
          message: '图片生成过程中发生错误',
          details: '可能原因：\n• 网络连接问题\n• 服务器暂时不可用\n• 请求超时\n\n建议：\n• 检查网络连接\n• 稍后重试\n• 尝试简化提示词',
          originalResponse: errorMessage,
          timestamp: Date.now()
        });
        
        onClearResult?.();
      }
      
      onProcessError?.(errorMessage);
    }
  };

  return (
    <div className="space-y-4 xl:space-y-6">
      {/* 模式切换 */}
      <ModeToggle
        selectedMode={mode}
        onModeChange={handleModeChange}
        isProcessing={isProcessing}
      />
      
      {/* 上半部分：输入区域和结果展示 */}
      <div className={`grid grid-cols-1 gap-4 xl:gap-6 ${
        mode === 'generate' 
          ? 'lg:grid-cols-5' // 生成模式：1:4 比例
          : 'lg:grid-cols-2' // 编辑/分析模式：1:1 比例
      }`}>
        {/* 左侧：动态输入区域 */}
        <div className={`min-h-[400px] xl:min-h-[500px] 2xl:min-h-[700px] 3xl:min-h-[800px] 4k:min-h-[600px] ultrawide:min-h-[700px] ${
          mode === 'generate' ? 'lg:col-span-1' : 'lg:col-span-1'
        }`}>
          <DynamicInputArea
            mode={mode}
            selectedRatio={selectedRatio}
            onRatioChange={setSelectedRatio}
            aspectRatioOptions={aspectRatioOptions}
            uploadedFiles={uploadedFiles}
            imagePreviews={imagePreviews}
            onFilesUploaded={handleFiles}
            onFileRemove={handleFileRemove}
            dragActive={dragActive}
            onDragHandlers={dragHandlers}
            fileInputRef={fileInputRef}
            onFileInputChange={handleFileInputChange}
          />
        </div>
        
        {/* 右侧：结果展示 */}
        <div className={`min-h-[400px] xl:min-h-[500px] 2xl:min-h-[700px] 3xl:min-h-[800px] 4k:min-h-[600px] ultrawide:min-h-[700px] ${
          mode === 'generate' ? 'lg:col-span-4' : 'lg:col-span-1'
        }`}>
          {currentResult ? (
            <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
              {/* 图片展示区域 */}
              <div className="flex-1 p-4 flex items-center justify-center min-h-0 max-h-[500px] ultrawide:max-h-[400px] 4k:max-h-[600px] overflow-hidden">
                {(currentResult.imageUrl || currentResult.result) && (
                  <img
                    src={currentResult.imageUrl || currentResult.result}
                    alt="处理结果"
                    className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
                  />
                )}
              </div>
            </div>
          ) : errorResult ? (
            // 错误结果显示
            <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
              <div className="flex-1 p-6 flex items-center justify-center">
                <div className="text-center space-y-4 max-w-md">
                  {/* 错误图标 */}
                  <div className="text-red-400 mb-4">
                    <svg className="mx-auto h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z"
                      />
                    </svg>
                  </div>
                  
                  {/* 错误标题 */}
                  <div>
                    <h3 className="text-lg font-medium text-red-800 mb-2">
                      ⚠️ {errorResult.title}
                    </h3>
                    <p className="text-red-700 text-sm mb-4">
                      {errorResult.message}
                    </p>
                  </div>
                  
                  {/* 错误详情 */}
                  {errorResult.details && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left">
                      <div className="text-sm text-red-800 whitespace-pre-line">
                        {errorResult.details}
                      </div>
                    </div>
                  )}
                  
                  {/* AI原始回复 */}
                  {errorResult.originalResponse && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-left">
                      <div className="text-xs text-gray-600 mb-2 font-medium">AI原始回复：</div>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap">
                        {errorResult.originalResponse}
                      </div>
                    </div>
                  )}
                  
                  {/* 清除错误按钮 */}
                  <button
                    onClick={() => setErrorResult(null)}
                    className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm"
                  >
                    清除错误信息
                  </button>
                  
                  {/* 时间戳 */}
                  <div className="text-xs text-gray-500">
                    失败时间：{new Date(errorResult.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-lg h-full flex flex-col items-center justify-center text-center p-8">
              <div className="mb-6">
                <div className="text-6xl xl:text-7xl 2xl:text-8xl 3xl:text-9xl mb-4 opacity-60">
                  {mode === 'generate' ? '🎨' : mode === 'edit' ? '✨' : '🔍'}
                </div>
                <h3 className="text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl font-medium text-gray-700 mb-2">
                  {mode === 'generate' ? '创作画布' : mode === 'edit' ? '编辑预览' : '分析结果'}
                </h3>
                <p className="text-sm xl:text-base 2xl:text-lg 3xl:text-xl text-gray-500 max-w-md">
                  {mode === 'generate' 
                    ? '输入创意提示词，AI将为您生成精美的图片作品' 
                    : mode === 'edit' 
                    ? '上传图片并描述编辑需求，AI将智能处理您的图片'
                    : '上传图片进行智能分析，获取详细的内容描述'
                  }
                </p>
              </div>
              
              <div className="flex items-center space-x-4 text-xs xl:text-sm 2xl:text-base text-gray-400">
                <div className="flex items-center space-x-1">
                  <span>⚡</span>
                  <span>快速生成</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span>🎯</span>
                  <span>精准控制</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span>✨</span>
                  <span>专业品质</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* 下半部分：提示词输入区域（横向全宽） */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 xl:p-6">
        <div className="flex items-center justify-between mb-2 xl:mb-3">
          <label className="block text-sm font-medium text-gray-700">
            {mode === 'generate' ? '描述你想生成的图片' : 
             mode === 'edit' ? '描述你想要的修改' : '分析要求（可选）'}
          </label>
          <button
            onClick={handleOptimizePrompt}
            disabled={!prompt.trim() || isPolishing || isProcessing}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors px-3 py-1.5 rounded text-xs flex items-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPolishing ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                <span>优化中...</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>优化提示词</span>
              </>
            )}
          </button>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            mode === 'generate' ? '例如：一只可爱的小猫在花园里玩耍，阳光明媚，油画风格' :
            mode === 'edit' ? '例如：将背景改为海滩，增加夕阳效果' : 
            '例如：分析图片中的主要元素和构图特点'
          }
          className="w-full h-32 xl:h-36 2xl:h-40 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm xl:text-base"
          disabled={isProcessing}
        />
      </div>
      
      {/* 可拖动的浮动生成按钮 */}
      <DraggableFloatingButton
        storageKey={`generate-button-position-${mode}`}
        className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300"
      >
        <DraggableActionButton
          onClick={handleSubmit}
          disabled={isProcessing || !prompt.trim() || (mode !== 'generate' && uploadedFiles.length === 0)}
          className={`backdrop-blur-md border-2 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center space-x-2 sm:space-x-3 px-4 sm:px-8 py-2 sm:py-3 text-sm sm:text-base rounded-2xl font-semibold ring-2 whitespace-nowrap ${
            isProcessing
              ? 'bg-gradient-to-r from-blue-500/80 to-purple-500/80 border-blue-400/60 text-white ring-blue-200/60 cursor-wait'
              : !prompt.trim() || (mode !== 'generate' && uploadedFiles.length === 0)
              ? 'bg-white/40 border-gray-300/50 text-gray-500 cursor-not-allowed ring-blue-200/60'
              : 'bg-white/60 border-blue-400/60 text-blue-600 hover:bg-white/80 hover:border-blue-500/80 hover:text-blue-700 ring-blue-200/60 hover:ring-blue-300/80'
          }`}
          style={{
            textShadow: isProcessing ? '0 1px 2px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.2)',
            backdropFilter: 'blur(12px)',
            boxShadow: isProcessing 
              ? '0 8px 32px rgba(59, 130, 246, 0.4), 0 0 20px rgba(147, 51, 234, 0.3)'
              : !prompt.trim() || (mode !== 'generate' && uploadedFiles.length === 0)
              ? '0 4px 16px rgba(0,0,0,0.1)'
              : '0 8px 32px rgba(59, 130, 246, 0.25)',
          }}
          icon={isProcessing ? (
            <div className="relative">
              <span className="text-xl animate-pulse">⚡</span>
              <div className="absolute inset-0 animate-ping">
                <span className="text-xl opacity-75">✨</span>
              </div>
            </div>
          ) : (
            <span className="text-xl">✨</span>
          )}
        >
          {isProcessing ? (
            <>
              <div className="flex items-center space-x-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <div className="flex items-center">
                  <span className="animate-pulse">AI正在</span>
                  <span className="ml-1">
                    {mode === 'generate' ? '创作中' : mode === 'edit' ? '编辑中' : '分析中'}
                  </span>
                  <span className="animate-bounce ml-1">...</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <span className="hidden xs:inline">
                {mode === 'generate' ? '生成图片' : mode === 'edit' ? '编辑图片' : '分析图片'}
              </span>
              <span className="xs:hidden">
                {mode === 'generate' ? '生成' : mode === 'edit' ? '编辑' : '分析'}
              </span>
            </>
          )}
        </DraggableActionButton>
      </DraggableFloatingButton>
      
      {/* 系统提示词模态框 */}
      {showSystemPromptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">系统提示词设置</h3>
              <button
                onClick={onCloseSystemPromptModal}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  图片生成系统提示词
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="输入系统提示词..."
                  className="w-full h-64 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={onCloseSystemPromptModal}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    console.log('保存系统提示词:', systemPrompt);
                    onCloseSystemPromptModal?.();
                  }}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
