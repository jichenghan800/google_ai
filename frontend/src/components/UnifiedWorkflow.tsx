import React, { useState, useRef, useCallback } from 'react';
import { ImageEditResult, AspectRatio, AspectRatioOption } from '../types/index.ts';

// 宽高比选项配置
const aspectRatioOptions: AspectRatioOption[] = [
  {
    id: '1:1',
    label: '正方形',
    description: '1:1',
    width: 1024,
    height: 1024,
    icon: '◼',
    useCase: 'Center-focused, balanced compositions'
  },
  {
    id: '4:3',
    label: '横屏',
    description: '4:3',
    width: 1024,
    height: 768,
    icon: '▬',
    useCase: 'Horizon-based, scenic layouts'
  },
  {
    id: '3:4',
    label: '竖屏',
    description: '3:4',
    width: 768,
    height: 1024,
    icon: '▮',
    useCase: 'Vertical emphasis, subject-focused'
  },
  {
    id: '16:9',
    label: '宽屏',
    description: '16:9',
    width: 1024,
    height: 576,
    icon: '▭',
    useCase: 'Cinematic, panoramic views'
  },
  {
    id: '9:16',
    label: '竖屏长图',
    description: '9:16',
    width: 576,
    height: 1024,
    icon: '▯',
    useCase: 'Mobile-optimized, story format'
  }
];

// 生成纯色背景图片的工具函数
const generateBackgroundImage = (width: number, height: number, color: string = '#f0f0f0'): Promise<File> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // 绘制纯色背景
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      
      // 可选：添加一些微妙的纹理或渐变
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, 'rgba(255,255,255,0.1)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.05)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
    
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `background_${width}x${height}.png`, {
          type: 'image/png',
          lastModified: Date.now()
        });
        resolve(file);
      }
    }, 'image/png');
  });
};


// Get API base URL (same as api.ts)
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

interface UnifiedWorkflowProps {
  onProcessComplete: (result: ImageEditResult) => void;
  sessionId: string | null;
  isProcessing?: boolean;
  showSystemPromptModal?: boolean;
  onCloseSystemPromptModal?: () => void;
}

export const UnifiedWorkflow: React.FC<UnifiedWorkflowProps> = ({
  onProcessComplete,
  sessionId,
  isProcessing = false,
  showSystemPromptModal = false,
  onCloseSystemPromptModal
}) => {
  const [prompt, setPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState(''); // 保存原始提示词
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>('1:1');
  const [isPolishing, setIsPolishing] = useState(false);
  const [customSystemPrompt, setCustomSystemPrompt] = useState('');
  // 初始化默认系统提示词
  React.useEffect(() => {
    if (!customSystemPrompt) {
      const defaultSystemPrompt = `你是一个专业的AI图像生成提示词优化师，专门优化Gemini 2.5 Flash (Nano Banana)的提示词。你的专长是将简单描述转化为叙事性、连贯的场景描述，充分利用模型的深度语言理解能力。

基本原则：描述场景，不要只列举关键词。创造流畅的、描述性的段落来讲述故事，而不是不连贯的词汇。

Gemini模板结构：
"一个[风格][镜头类型]的[主题]，[动作/表情]，设置在[环境]中。场景由[光照描述]照亮，创造了[情绪]氛围。使用[相机/镜头细节]拍摄，强调[关键纹理和细节]。"

优化要求：
1. 将任何关键词列表转化为连贯的叙述性描述
2. 保持用户的原始意图，同时添加上下文丰富性
3. 使用专业的摄影和艺术术语
4. 根据宽高比应用特定的构图指导
5. 创造有大气深度的光照和情绪描述
6. 包含技术相机规格以获得逼真效果
7. 强调纹理、细节和视觉叙事元素
8. 用中文输出优化后的提示词

请将输入转化为专业的、叙事驱动的提示词，遵循Gemini最佳实践。专注于场景描述和视觉叙事。只返回优化后的提示词，不要解释。`;
      setCustomSystemPrompt(defaultSystemPrompt);
    }
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 拖拽处理
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      handleFiles(Array.from(files));
    }
  };

  const handleFiles = (files: File[]) => {
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        alert(`文件 ${file.name} 不是图片格式`);
        return false;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        alert(`文件 ${file.name} 超过10MB限制`);
        return false;
      }
      
      return true;
    });

    if (validFiles.length === 0) return;

    // 追加新文件到现有文件列表，最多2个
    setUploadedFiles(prevFiles => {
      const combinedFiles = [...prevFiles, ...validFiles];
      const limitedFiles = combinedFiles.slice(0, 2);
      
      if (combinedFiles.length > 2) {
        alert(`最多只能上传2张图片，已保留前${limitedFiles.length}张`);
      }
      
      return limitedFiles;
    });

    // 生成新图片的预览
    const newPreviews: string[] = [];
    const promises = validFiles.map((file, index) => {
      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            newPreviews[index] = e.target.result as string;
            resolve();
          }
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(promises).then(() => {
      setImagePreviews(prevPreviews => {
        const combinedPreviews = [...prevPreviews, ...newPreviews];
        return combinedPreviews.slice(0, 2);
      });
    });
  };

  const removeImage = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);
    
    setUploadedFiles(newFiles);
    setImagePreviews(newPreviews);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearAll = () => {
    setUploadedFiles([]);
    setImagePreviews([]);
    // 不自动清空提示词和原始提示词，让用户手动控制
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 清空提示词区域
  const clearPrompts = () => {
    setPrompt('');
    setOriginalPrompt('');
  };

  // AI润色提示词功能
  const handlePolishPrompt = async () => {
    if (!prompt.trim()) {
      alert('请先输入提示词');
      return;
    }

    // 保存原始提示词
    if (!originalPrompt) {
      setOriginalPrompt(prompt.trim());
    }

    setIsPolishing(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/edit/polish-prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionId,
          originalPrompt: prompt.trim(),
          aspectRatio: selectedAspectRatio,
          customSystemPrompt: customSystemPrompt
        }),
      });

      const result = await response.json();

      if (result.success) {
        setPrompt(result.data.polishedPrompt);
      } else {
        throw new Error(result.error || '润色失败');
      }

    } catch (error: any) {
      console.error('润色失败:', error);
      alert(`润色失败: ${error.message}`);
    } finally {
      setIsPolishing(false);
    }
  };

  const handleSubmit = async () => {
    if (!sessionId) {
      alert('会话未初始化，请刷新页面重试');
      return;
    }

    if (!prompt.trim()) {
      alert('请输入提示词');
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      
      // 获取选中的宽高比选项
      const selectedOption = aspectRatioOptions.find(option => option.id === selectedAspectRatio);
      if (!selectedOption) {
        throw new Error('未选择有效的宽高比');
      }
      
      // 如果没有用户上传的图片，生成对应比例的背景图片
      if (uploadedFiles.length === 0) {
        console.log(`生成背景图片: ${selectedOption.width}x${selectedOption.height}`);
        const backgroundImage = await generateBackgroundImage(
          selectedOption.width, 
          selectedOption.height,
          '#f8f9fa' // 浅灰色背景
        );
        formData.append('images', backgroundImage);
      }
      
      // 添加用户上传的图片
      uploadedFiles.forEach((file, index) => {
        formData.append('images', file);
      });
      
      formData.append('sessionId', sessionId);
      // 自动添加宽高比格式提示以提高生成准确性
      const enhancedPrompt = prompt.trim() + `. The image should be in a ${selectedAspectRatio} format.`;
      formData.append('prompt', enhancedPrompt);
      
      // 添加原始提示词
      if (originalPrompt) {
        formData.append('originalPrompt', originalPrompt);
      }
      
      // 添加分辨率参数
      formData.append('aspectRatio', selectedAspectRatio);
      formData.append('width', selectedOption.width.toString());
      formData.append('height', selectedOption.height.toString());

      const response = await fetch(`${API_BASE_URL}/edit/edit-images`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        onProcessComplete(result.data);
        
        // 只清除图片，保留提示词
        setUploadedFiles([]);
        setImagePreviews([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        throw new Error(result.error || '处理失败');
      }

    } catch (error: any) {
      console.error('处理失败:', error);
      
      // 检查是否是敏感词被拒绝的情况
      if (error.message && error.message.includes("Sorry, I'm unable to help you with that.")) {
        alert(`处理失败: ${error.message}\n\n💡 提示：这通常意味着提示词包含敏感信息被Google拒绝，请尝试调整提示词内容，避免使用可能被视为敏感的词汇。`);
      } else {
        alert(`处理失败: ${error.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 判断当前任务类型
  const getTaskType = () => {
    if (uploadedFiles.length > 0 && prompt.trim()) {
      return { type: 'edit', label: '图片编辑', icon: '🎨', description: '基于上传的图片和提示词进行编辑' };
    } else if (uploadedFiles.length > 0) {
      return { type: 'analyze', label: '图片分析', icon: '🔍', description: '分析上传的图片内容' };
    } else if (prompt.trim()) {
      return { type: 'generate', label: '图片生成', icon: '✨', description: '根据提示词生成图片' };
    }
    return { type: 'none', label: '等待输入', icon: '💭', description: '请输入提示词开始处理' };
  };

  const taskInfo = getTaskType();

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* 工作流程 */}
      <div className="card p-8">
        {/* 步骤1: 选择图片比例 */}
        <div className="mb-8">
          <div className="flex items-center mb-3">
            <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-2">
              1
            </div>
            <h3 className="text-lg font-medium text-gray-700">选择图片比例</h3>
          </div>
          <div className="grid grid-cols-5 gap-2 mb-3">
            {aspectRatioOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedAspectRatio(option.id)}
                disabled={isSubmitting || isProcessing}
                className={`
                  relative px-3 py-4 rounded border-2 transition-all duration-200 flex items-center justify-center
                  ${selectedAspectRatio === option.id
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }
                  ${isSubmitting || isProcessing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                `}
              >
                {/* 选中指示器 */}
                {selectedAspectRatio === option.id && (
                  <div className="absolute top-2 right-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                  </div>
                )}

                {/* 图标+名称整体居中，向左微调 */}
                <div className="flex items-center space-x-3 -ml-2">
                  {/* 图标 */}
                  <div className="text-2xl">{option.icon}</div>

                  {/* 名称和比例 */}
                  <div className="flex flex-col text-center">
                    <div className="text-sm font-medium text-gray-900 leading-tight">
                      {option.label}
                    </div>
                    <div className="text-sm text-gray-600 leading-tight">
                      {option.description}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          
          {/* 当前选择信息 - 简化单行显示 */}
          <div className="text-center text-sm text-gray-500 mt-2">
            已选择：{aspectRatioOptions.find(opt => opt.id === selectedAspectRatio)?.label} 
            ({aspectRatioOptions.find(opt => opt.id === selectedAspectRatio)?.width} × {aspectRatioOptions.find(opt => opt.id === selectedAspectRatio)?.height}px) - 
            {aspectRatioOptions.find(opt => opt.id === selectedAspectRatio)?.useCase}
          </div>
        </div>

        {/* 步骤2: 输入提示词 */}
        <div className="mb-8">
          <div className="flex items-center mb-3">
            <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-2">
              2
            </div>
            <h3 className="text-lg font-medium text-gray-700">输入提示词</h3>
          </div>
          <div className="space-y-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="详细描述您想要生成的图像，例如：&#10;一只可爱的橘猫坐在樱花树下，阳光透过花瓣洒下，水彩画风格"
              className="input-field h-32 resize-none w-full"
              disabled={isSubmitting || isProcessing}
              maxLength={1000}
            />
            <div className="flex justify-between items-center">
              <div className="text-xs text-gray-500">
                {prompt.length}/1000
              </div>
              <div className="flex items-center space-x-2">
                {/* 显示原始提示词还原按钮 */}
                {originalPrompt && originalPrompt !== prompt && (
                  <button
                    type="button"
                    onClick={() => setPrompt(originalPrompt)}
                    disabled={isSubmitting || isProcessing}
                    className="btn-secondary text-sm flex items-center space-x-1"
                    title="恢复到原始提示词"
                  >
                    <span>↩️</span>
                    <span>还原</span>
                  </button>
                )}
                
                {/* 清空提示词按钮 */}
                {(prompt || originalPrompt) && (
                  <button
                    type="button"
                    onClick={clearPrompts}
                    disabled={isSubmitting || isProcessing}
                    className="btn-secondary text-sm flex items-center space-x-1"
                    title="清空提示词区域"
                  >
                    <span>🗑️</span>
                    <span>清空</span>
                  </button>
                )}
                
                {/* AI润色按钮 */}
                <button
                  type="button"
                  onClick={handlePolishPrompt}
                  disabled={!prompt.trim() || isPolishing || isSubmitting || isProcessing}
                  className="bg-white border-2 border-blue-500 text-blue-600 hover:bg-blue-50 transition-colors px-4 py-2 rounded-lg text-sm flex items-center space-x-2"
                >
                  {isPolishing ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                      </svg>
                      <span>润色中...</span>
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      <span>优化提示词</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 步骤3: 可选图片上传 - 暂时隐藏，为智能编辑功能保留 */}
        {false && (
        <div className="mb-8">
          <div className="flex items-center mb-3">
            <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-2">
              3
            </div>
            <h3 className="text-lg font-medium text-gray-700">图片上传 (可选)</h3>
          </div>
          <div className="mb-3 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              💡 <strong>提示：</strong>如果不上传图片，系统会自动生成对应比例的背景图与提示词混合。
              上传图片可以基于现有图片进行编辑和改造。
            </p>
          </div>
          
          {imagePreviews.length === 0 ? (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 ${
                dragActive
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="text-gray-400 mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <p className="text-lg font-medium text-gray-600 mb-2">
                拖拽图片到这里或点击上传
              </p>
              <p className="text-sm text-gray-500 mb-4">
                支持 JPG, PNG, GIF, WebP 等格式，最大 10MB，最多2张
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting || isProcessing}
              >
                选择图片
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                multiple
                max={2}
                onChange={handleFileInput}
              />
            </div>
          ) : (
            <div>
              {/* 图片预览网格 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-4">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative group">
                    <div className="aspect-square w-full overflow-hidden rounded-lg border-2 border-gray-200 bg-gray-100 flex items-center justify-center">
                      <img
                        src={preview}
                        alt={`预览图片 ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600"
                      disabled={isSubmitting || isProcessing}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1 py-0.5 rounded">
                      {uploadedFiles[index]?.name.substring(0, 8)}...
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-center space-x-2">
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting || isProcessing || imagePreviews.length >= 2}
                >
                  {imagePreviews.length >= 2 ? '已达上限' : '添加更多'}
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={clearAll}
                  disabled={isSubmitting || isProcessing}
                >
                  清除所有
                </button>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                multiple
                max={2}
                onChange={handleFileInput}
              />
            </div>
          )}
        </div>
        )}

        {/* 生成图片按钮 */}
        <div className="text-center mt-6">
          <button
            onClick={handleSubmit}
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-md hover:shadow-lg flex items-center space-x-2 px-6 py-2.5 text-base mx-auto rounded-full"
            disabled={isSubmitting || isProcessing || !prompt.trim()}
          >
            {isSubmitting || isProcessing ? (
              <>
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
                <span>Nano Banana 生成中...</span>
              </>
            ) : (
              <>
                <span className="text-xl">🎨</span>
                <span>开始生成图片</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 处理中状态 */}
      {(isSubmitting || isProcessing) && (
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <div className="w-6 h-6 bg-yellow-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-2">
              ⏳
            </div>
            <h2 className="text-xl font-semibold text-gray-800">AI 处理中</h2>
          </div>
          
          <div className="text-center py-8">
            <div className="inline-flex items-center space-x-3 text-primary-600">
              <svg className="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24">
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
              <div>
                <p className="text-lg font-medium">正在使用 Nano Banana 处理</p>
                <p className="text-sm text-gray-600">这可能需要几秒钟到几分钟的时间</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 系统提示词模态框 */}
      {showSystemPromptModal && onCloseSystemPromptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">自定义 System Prompt</h3>
              <button
                onClick={onCloseSystemPromptModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-3">
                自定义系统提示词，用于指导AI如何优化您的提示词。当前系统会用中文输出优化后的提示词。
              </p>
              <textarea
                value={customSystemPrompt}
                onChange={(e) => setCustomSystemPrompt(e.target.value)}
                placeholder="输入您的系统提示词..."
                className="w-full h-64 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
            
            <div className="flex justify-between items-center">
              <button
                onClick={() => {
                  // 重置为默认系统提示词
                  const defaultSystemPrompt = `你是一个专业的AI图像生成提示词优化师，专门优化Gemini 2.5 Flash (Nano Banana)的提示词。你的专长是将简单描述转化为叙事性、连贯的场景描述，充分利用模型的深度语言理解能力。

基本原则：描述场景，不要只列举关键词。创造流畅的、描述性的段落来讲述故事，而不是不连贯的词汇。

Gemini模板结构：
"一个[风格][镜头类型]的[主题]，[动作/表情]，设置在[环境]中。场景由[光照描述]照亮，创造了[情绪]氛围。使用[相机/镜头细节]拍摄，强调[关键纹理和细节]。"

优化要求：
1. 将任何关键词列表转化为连贯的叙述性描述
2. 保持用户的原始意图，同时添加上下文丰富性
3. 使用专业的摄影和艺术术语
4. 根据宽高比应用特定的构图指导
5. 创造有大气深度的光照和情绪描述
6. 包含技术相机规格以获得逼真效果
7. 强调纹理、细节和视觉叙事元素
8. 用中文输出优化后的提示词

请将输入转化为专业的、叙事驱动的提示词，遵循Gemini最佳实践。专注于场景描述和视觉叙事。只返回优化后的提示词，不要解释。`;
                  setCustomSystemPrompt(defaultSystemPrompt);
                }}
                className="btn-secondary text-sm"
              >
                重置为默认
              </button>
              
              <div className="flex space-x-2">
                <button
                  onClick={onCloseSystemPromptModal}
                  className="btn-secondary"
                >
                  取消
                </button>
                <button
                  onClick={onCloseSystemPromptModal}
                  className="btn-primary"
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