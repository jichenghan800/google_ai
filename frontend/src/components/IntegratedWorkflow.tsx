import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ImageEditResult, AspectRatioOption } from '../types/index.ts';
import { ModeToggle, AIMode } from './ModeToggle.tsx';
import { DynamicInputArea } from './DynamicInputArea.tsx';
import { DraggableFloatingButton } from './DraggableFloatingButton.tsx';
import { DraggableActionButton } from './DraggableActionButton.tsx';
import { QuickTemplates } from './QuickTemplates.tsx';


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

// 工具函数：DataURL转File
const dataURLtoFile = (dataurl: string, filename: string): File => {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
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
  
  // 图片预览模态框状态
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [previewImageTitle, setPreviewImageTitle] = useState('');
  const [previewImageType, setPreviewImageType] = useState<'before' | 'after'>('before');
  
  // 持续编辑模式状态
  const [isContinueEditMode, setIsContinueEditMode] = useState(false);
  const [continueEditPreviews, setContinueEditPreviews] = useState<string[]>([]);
  const [continueEditDimensions, setContinueEditDimensions] = useState<{width:number;height:number}[]>([]);
  const [resultDimensions, setResultDimensions] = useState<{width:number;height:number} | null>(null);
  const [singleImageHeight, setSingleImageHeight] = useState<number | null>(null);
  
  // 继续编辑模式下的新上传图片状态
  const [continueEditFiles, setContinueEditFiles] = useState<File[]>([]);
  const [continueEditFilePreviews, setContinueEditFilePreviews] = useState<string[]>([]);
  
  // 图片预览模态框状态
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    imageUrl: string;
    title: string;
  }>({
    isOpen: false,
    imageUrl: '',
    title: ''
  });
  
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

  // 页面初始化时确定一个稳定的预览最大高度，避免图片加载导致布局跳动
  const [maxPreviewHeight, setMaxPreviewHeight] = useState<number>(420);
  const resultCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = resultCardRef.current;
    if (el) {
      const reserved = 120; // 标题/内边距/底部操作占位
      const h = el.clientHeight || 480;
      setMaxPreviewHeight(Math.max(240, h - reserved));
    } else if (typeof window !== 'undefined') {
      setMaxPreviewHeight(Math.max(240, Math.floor(window.innerHeight * 0.45)));
    }
  }, []);

  // 确保左侧图片尺寸完整：当通过迁移结果或其他途径设置了 imagePreviews 而未设置尺寸时，自动补齐尺寸
  useEffect(() => {
    if (mode !== 'edit') return;
    if (imagePreviews.length === 0) return;
    if (imageDimensions.length === imagePreviews.length) return;

    imagePreviews.forEach((src, idx) => {
      if (!imageDimensions[idx] && src) {
        const img = new Image();
        img.onload = () => {
          setImageDimensions(prev => {
            const next = [...prev];
            next[idx] = { width: img.width, height: img.height };
            return next;
          });
        };
        img.src = src;
      }
    });
  }, [mode, imagePreviews, imageDimensions]);

  // 图片预览方法
  const openImagePreview = useCallback((imageUrl: string, title: string, type: 'before' | 'after') => {
    setPreviewImageUrl(imageUrl);
    setPreviewImageTitle(title);
    setPreviewImageType(type);
    setShowImagePreview(true);
  }, []);

  const closeImagePreview = useCallback(() => {
    setShowImagePreview(false);
  }, []);

  const switchPreviewImage = useCallback(() => {
    if (previewImageType === 'before' && currentResult?.imageUrl) {
      setPreviewImageUrl(currentResult.imageUrl);
      setPreviewImageTitle('修改后');
      setPreviewImageType('after');
    } else if (previewImageType === 'after' && imagePreviews.length > 0) {
      setPreviewImageUrl(imagePreviews[0]);
      setPreviewImageTitle('修改前');
      setPreviewImageType('before');
    }
  }, [previewImageType, currentResult, imagePreviews]);

  // 持续编辑处理
  const handleContinueEditing = useCallback(async () => {
    if (currentResult && currentResult.result) {
      if (isContinueEditMode) {
        // 用户手动退出持续编辑模式
        setContinueEditFiles([]);
        setContinueEditFilePreviews([]);
        setIsContinueEditMode(false);
        console.log('退出继续编辑模式');
      } else {
        // 激活继续编辑模式
        setIsContinueEditMode(true);
        setPrompt('');
        console.log('继续编辑模式已激活');
      }
    }
  }, [isContinueEditMode, currentResult]);

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
    
    // 切换到生成模式时重置所有状态
    if (newMode === 'generate') {
      setUploadedFiles([]);
      setImagePreviews([]);
      setImageDimensions([]);
      // 重置宽高比为默认值（横图）
      const defaultRatio = aspectRatioOptions[1]; // aspectRatioOptions[1] 是横图 1344x768
      setSelectedRatio(defaultRatio);
      console.log('🔄 切换到生成模式，重置宽高比:', {
        from: selectedRatio,
        to: defaultRatio,
        ratioId: defaultRatio.id,
        dimensions: `${defaultRatio.width}x${defaultRatio.height}`
      });
    }
    
    setMode(newMode);
    onModeChange?.(newMode);
  }, [mode, currentResult, onClearResult, onModeChange]);

  // 文件处理
  const handleFiles = useCallback((files: File[]) => {
    const maxFiles = mode === 'edit' ? 2 : 1;
    const currentCount = uploadedFiles.length;
    const remainingSlots = maxFiles - currentCount;
    
    if (remainingSlots <= 0) return;
    
    const validFiles = files.slice(0, remainingSlots).filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) return;

    // 追加到现有文件
    const newUploadedFiles = [...uploadedFiles, ...validFiles];
    setUploadedFiles(newUploadedFiles);
    
    // 生成新的预览
    const newPreviews: string[] = [];
    const newDimensions: {width: number, height: number}[] = [];
    
    validFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        newPreviews[index] = result;
        
        const img = new Image();
        img.onload = () => {
          newDimensions[index] = { width: img.width, height: img.height };
          
          if (newPreviews.length === validFiles.length && newDimensions.length === validFiles.length) {
            // 追加到现有预览
            setImagePreviews(prev => [...prev, ...newPreviews]);
            setImageDimensions(prev => [...prev, ...newDimensions]);
          }
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    });
  }, [mode, uploadedFiles]);

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
      if (isContinueEditMode) {
        // 持续编辑模式：处理右侧区域的新上传文件
        const newFiles = Array.from(files);
        const maxFiles = 2 - continueEditFiles.length;
        const validFiles = newFiles.slice(0, maxFiles).filter(file => file.type.startsWith('image/'));
        
        if (validFiles.length > 0) {
          setContinueEditFiles(prev => [...prev, ...validFiles]);
          
          // 生成预览并记录尺寸
          validFiles.forEach((file) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const dataUrl = ev.target?.result as string;
              setContinueEditFilePreviews(prev => [...prev, dataUrl]);
              const img = new Image();
              img.onload = () => {
                setContinueEditDimensions(prev => [...prev, { width: img.width, height: img.height }]);
              };
              img.src = dataUrl;
            };
            reader.readAsDataURL(file);
          });
        }
      } else {
        // 普通模式：处理左侧区域的文件
        handleFiles(Array.from(files));
      }
    }
  };

  const handleFileRemove = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);
    const newDimensions = imageDimensions.filter((_, i) => i !== index);
    
    setUploadedFiles(newFiles);
    setImagePreviews(newPreviews);
    setImageDimensions(newDimensions);
    
    // 需求更新：在持续编辑下，只要左侧发生“删除”动作就自动退出持续编辑（无论剩余数量）
    if (isContinueEditMode) setIsContinueEditMode(false);
  };

  // 提示词优化功能
  const handleOptimizePrompt = async () => {
    if (!prompt.trim() || !sessionId) return;
    
    setIsPolishing(true);
    try {
      // 检查是否为编辑模式且有图片
      if (mode === 'edit' && (uploadedFiles.length > 0 || isContinueEditMode)) {
        
        // 创建FormData - 关键：正确传递图片
        const formData = new FormData();
        
        // 根据模式添加图片
        if (isContinueEditMode && currentResult) {
          // 继续编辑：将生成结果转为文件
          const resultFile = dataURLtoFile(currentResult.result, 'continue-edit-analysis.png');
          formData.append('images', resultFile);
          
          // 添加新上传的图片
          continueEditFiles.forEach((file) => {
            formData.append('images', file);
          });
        } else {
          // 普通模式：添加所有上传的图片
          uploadedFiles.forEach((file) => {
            formData.append('images', file);
          });
        }
        
        // 添加其他参数
        formData.append('sessionId', sessionId || '');
        formData.append('userInstruction', prompt.trim());
        formData.append('customSystemPrompt', systemPrompt || '');
        
        // 调用智能分析API
        const response = await fetch(`${API_BASE_URL}/edit/intelligent-analysis-editing`, {
          method: 'POST',
          body: formData, // 注意：不设置Content-Type，让浏览器自动设置
        });
        
        const result = await response.json();
        if (result.success) {
          setPrompt(result.data.editPrompt); // 更新提示词
        } else {
          throw new Error(result.error || 'Optimization failed');
        }
        
      } else {
        // 无图片的传统优化流程
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
            promptType: mode === 'edit' ? 'editing' : 'generation'
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success && data.data?.polishedPrompt) {
          setPrompt(data.data.polishedPrompt);
        }
      }
    } catch (error) {
      console.error('提示词优化失败:', error);
      alert(`优化失败: ${error.message}`);
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
        // 智能编辑模式下的图片处理
        if (mode === 'edit') {
          if (isContinueEditMode && currentResult) {
            // 继续编辑模式：使用生成结果作为主图片
            const resultFile = dataURLtoFile(currentResult.result || currentResult.imageUrl, 'continue-edit-source.png');
            formData.append('images', resultFile);
            
            // 如果有新上传的图片，也添加进去
            continueEditFiles.forEach((file, index) => {
              formData.append('images', file);
            });
            
            console.log(`继续编辑模式：使用生成结果作为源图片${continueEditFiles.length > 0 ? ` + ${continueEditFiles.length}张新上传图片` : ''}`);
          } else {
            // 普通编辑模式：使用用户上传的图片
            uploadedFiles.forEach((file, index) => {
              formData.append('images', file);
            });
          }
        } else {
          // 其他模式：添加用户上传的图片
          uploadedFiles.forEach((file, index) => {
            formData.append('images', file);
          });
        }
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
        dimensions: `${selectedRatio.width}x${selectedRatio.height}`,
        selectedRatio: selectedRatio,
        finalPrompt: finalPrompt
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
        
        // 如果是继续编辑模式，需要将上一次的结果移到左侧显示区域
        if (isContinueEditMode && currentResult) {
          try {
            // 将上一次的结果转换为File对象并设置为上传的文件
            const previousResultFile = dataURLtoFile(currentResult.result || currentResult.imageUrl, 'previous-result.png');
            const previewUrl = URL.createObjectURL(previousResultFile);
            
            setUploadedFiles([previousResultFile]);
            setImagePreviews([previewUrl]);
            
            console.log('继续编辑完成：上一次结果已移至左侧原图区域');
          } catch (error) {
            console.warn('移动上一次结果到左侧失败:', error);
          }

          // 关键：清空右侧继续编辑的临时图片，只保留新的结果图
          setContinueEditFiles([]);
          setContinueEditFilePreviews([]);
          setContinueEditDimensions([]);
        }
        
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
      <div className={`grid grid-cols-1 gap-4 xl:gap-6 items-stretch ${
        mode === 'generate' 
          ? 'lg:grid-cols-5' // 生成模式：1:4 比例
          : 'lg:grid-cols-2' // 编辑/分析模式：1:1 比例
      }`}>
        {/* 左侧：动态输入区域 */}
        <div className={`min-h-[480px] xl:min-h-[520px] 2xl:min-h-[700px] 3xl:min-h-[800px] 4k:min-h-[600px] ultrawide:min-h-[700px] ${
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
            onClearAll={() => {
              // 清理所有预览URL以避免内存泄漏
              imagePreviews.forEach(preview => {
                if (preview && preview.startsWith('blob:')) {
                  URL.revokeObjectURL(preview);
                }
              });
              
              setUploadedFiles([]);
              setImagePreviews([]);
              // 不自动清空提示词，让用户手动控制
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
              
              // 清除所有时也应该退出持续编辑模式
              setIsContinueEditMode(false);
              setContinueEditFiles([]);
              setContinueEditFilePreviews([]);
            }}
            dragActive={dragActive}
            onDragHandlers={dragHandlers}
            fileInputRef={fileInputRef}
            onFileInputChange={handleFileInputChange}
            isSubmitting={isProcessing}
            isProcessing={isProcessing}
            onImagePreview={openImagePreview}
            maxPreviewHeight={maxPreviewHeight}
            highlight={mode === 'edit' && !isContinueEditMode && imagePreviews.length > 0 && !!currentResult}
          />
        </div>
        
        {/* 右侧：结果展示 */}
        <div className={`min-h-[480px] xl:min-h-[520px] 2xl:min-h-[700px] 3xl:min-h-[800px] 4k:min-h-[600px] ultrawide:min-h-[700px] ${
          mode === 'generate' ? 'lg:col-span-4' : 'lg:col-span-1'
        }`}>
          {mode === 'edit' && (imagePreviews.length > 0 || isContinueEditMode || !!currentResult) ? (
            // 编辑模式：显示修改后区域
            <div ref={resultCardRef} className={`border-2 border-dashed rounded-lg overflow-hidden bg-gray-50 flex-1 flex flex-col min-h-[480px] ${
              isContinueEditMode ? 'border-orange-400' : 'border-gray-200'
            }`}>
              {/* 标题区域 */}
              <div className="p-4">
                <div className="text-center">
                  <h5 className="text-sm font-medium text-gray-600">
                    {isContinueEditMode ? '修改中...' : '修改后'}
                  </h5>
                </div>
              </div>
              
              {currentResult ? (
                <>
                  {/* 图片显示区域（统一双图并列风格） */}
                  <div className="flex-1 px-4 pb-2">
                    {isContinueEditMode && continueEditFilePreviews.length > 0 ? (
                      <div className={`grid gap-2 ${(() => {
                        const total = 1 + continueEditFilePreviews.length;
                        if (total === 2 && resultDimensions && continueEditDimensions.length >= 1) {
                          const bothLandscape = resultDimensions.width > resultDimensions.height &&
                            continueEditDimensions[0].width > continueEditDimensions[0].height;
                          return bothLandscape ? 'grid-cols-1' : 'grid-cols-2';
                        }
                        return total === 1 ? 'grid-cols-1' : 'grid-cols-2';
                      })()}`}>
                        {/* 第一项：当前结果 */}
                        <div className="relative group" onClick={() => openImagePreview(currentResult.result || currentResult.imageUrl, '修改后', 'after')} title="点击预览结果图片">
                          <div
                            className="w-full overflow-hidden bg-gray-100 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-center"
                          >
                            {currentResult.resultType === 'image' ? (
                              <img
                                id="result-image"
                                src={currentResult.result || currentResult.imageUrl}
                                alt="生成的图片"
                                className="w-full h-auto object-contain hover:scale-105 transition-transform duration-200"
                                style={{ maxHeight: `${maxPreviewHeight}px` }}
                              onLoad={(e) => {
                                const img = e.currentTarget;
                                setResultDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                              }}
                              />
                            ) : (
                              <div className="p-6 min-h-[200px] flex items-center justify-center">
                                <div className="text-gray-700 text-sm whitespace-pre-wrap text-center max-w-full">
                                  {currentResult.result}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="absolute top-2 left-2 bg-blue-500/80 text-white text-xs px-2 py-1 rounded pointer-events-none">
                            {currentResult.resultType === 'image' ? '当前结果' : 'AI回复'}
                          </div>
                          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded pointer-events-none">
                            生成完成 • {new Date(currentResult.createdAt || Date.now()).toLocaleTimeString()}
                          </div>
                        </div>

                        {/* 后续项：新上传图片 */}
                        {continueEditFilePreviews.map((preview, index) => (
                          <div key={index} className="relative group">
                            <div
                              className="w-full overflow-hidden bg-gray-100 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-center"
                              onClick={() => openImagePreview(preview, '新上传图片', 'before')}
                              title="点击预览新上传图片"
                            >
                              <img
                                src={preview}
                                alt={`新上传 ${index + 1}`}
                                className="w-full h-auto object-contain hover:scale-105 transition-transform duration-200"
                                style={{ maxHeight: `${maxPreviewHeight}px` }}
                              />
                            </div>
                            <button
                              onClick={() => {
                                setContinueEditFiles(prev => prev.filter((_, i) => i !== index));
                                setContinueEditFilePreviews(prev => prev.filter((_, i) => i !== index));
                              }}
                              className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600 shadow-lg"
                              title="删除图片"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                            <div className="absolute top-2 left-2 bg-orange-500/80 text-white text-xs px-2 py-1 rounded pointer-events-none">
                              新上传
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                          <div className="relative" onClick={() => openImagePreview(currentResult.result || currentResult.imageUrl, '修改后', 'after')} title="点击预览结果图片">
                            <div
                          className="w-full overflow-hidden bg-gray-100 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-center"
                          >
                          {currentResult.resultType === 'image' ? (
                            <img
                              id="result-image"
                              src={currentResult.result || currentResult.imageUrl}
                              alt="生成的图片"
                              className="w-full h-auto object-contain hover:scale-105 transition-transform duration-200"
                              style={{ maxHeight: `${maxPreviewHeight}px` }}
                            />
                          ) : (
                            <div className="p-6 min-h-[200px] flex items-center justify-center">
                              <div className="text-gray-700 text-sm whitespace-pre-wrap text-center max-w-full">
                                {currentResult.result}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="absolute top-2 left-2 bg-blue-500/80 text-white text-xs px-2 py-1 rounded pointer-events-none">
                          {currentResult.resultType === 'image' ? '点击预览结果' : 'AI回复'}
                        </div>
                        <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded pointer-events-none">
                          生成完成 • {new Date(currentResult.createdAt || Date.now()).toLocaleTimeString()}
                        </div>
                      </div>
                    )}
                  </div>
                
                  {/* 操作按钮区域 */}
                  <div className="p-4 flex justify-between items-center border-t">
                    <div className="flex space-x-4">
                      {/* 上传按钮 */}
                      <button
                        type="button"
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                          isContinueEditMode 
                            ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                        onClick={() => isContinueEditMode && fileInputRef.current?.click()}
                        disabled={!isContinueEditMode || isProcessing}
                        title={!isContinueEditMode ? "请先开启持续编辑" : "上传新图片参与编辑"}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      
                      {/* 下载按钮 */}
                      {(currentResult.resultType === 'image' || currentResult.imageUrl) && (
                        <a
                          href={currentResult.result || currentResult.imageUrl}
                          download="generated-image.png"
                          className="w-10 h-10 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors"
                          title="下载图片"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          </svg>
                        </a>
                      )}
                    </div>
                    
                    {/* 持续编辑开关 */}
                    <button
                      onClick={handleContinueEditing}
                      className="flex items-center space-x-3 flex-shrink-0"
                      title={isContinueEditMode ? '点击退出持续编辑模式' : '点击进入持续编辑模式'}
                    >
                      <div className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 ${
                        isContinueEditMode ? 'bg-orange-500' : 'bg-gray-300'
                      }`}>
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
                          isContinueEditMode ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </div>
                      <span className="text-base font-medium text-gray-700">
                        持续编辑
                      </span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-8">
                  {isProcessing ? (
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                      <p className="text-gray-500 text-sm">AI正在处理中...</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-gray-400 mb-4">
                        <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="text-gray-500 text-sm">
                        等待生成结果
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : currentResult ? (
            // 其他模式：原有的结果显示
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
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-lg min-h-[480px] flex flex-col items-center justify-center text-center p-8">
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
          <div className="flex items-center flex-wrap gap-2">
            <label className="block text-sm font-medium text-gray-700">
            {mode === 'generate' ? '描述你想生成的图片' : 
             mode === 'edit' ? '描述你想要的修改' : '分析要求（可选）'}
            </label>
            {/* 编辑模式：同一行展示图片编辑快捷Prompt */}
            {mode === 'edit' && (
              <QuickTemplates
                selectedMode={mode}
                compact
                onSelectTemplate={(content) => setPrompt(content)}
                onManageTemplates={() => {}}
              />
            )}
          </div>
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
      
      {/* 图片预览模态框 */}
      {showImagePreview && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50" onClick={closeImagePreview}>
          <div className="relative max-w-full max-h-full p-4" onClick={(e) => e.stopPropagation()}>
            <div className="relative">
              <img
                src={previewImageUrl}
                alt={previewImageTitle}
                className="max-w-full max-h-screen object-contain"
                style={{ maxWidth: '90vw', maxHeight: '90vh' }}
              />
              
              {/* 关闭按钮 */}
              <button
                onClick={closeImagePreview}
                className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
                title="关闭预览"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              {/* 标题 */}
              <div className="absolute top-4 left-4 bg-black/50 text-white px-3 py-1 rounded">
                {previewImageTitle}
              </div>
              
              {/* 左右切换箭头 - 只在有两张图片时显示 */}
              {imagePreviews.length > 0 && currentResult && (
                <>
                  {/* 左箭头 - 切换到修改前 */}
                  {previewImageType === 'after' && (
                    <button
                      onClick={switchPreviewImage}
                      className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 text-white p-3 rounded-full hover:bg-black/70 transition-colors"
                      title="查看修改前"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  )}
                  
                  {/* 右箭头 - 切换到修改后 */}
                  {previewImageType === 'before' && (
                    <button
                      onClick={switchPreviewImage}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 text-white p-3 rounded-full hover:bg-black/70 transition-colors"
                      title="查看修改后"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}
                </>
              )}
              
              {/* 下载按钮 */}
              <a
                href={previewImageUrl}
                download={`${previewImageTitle}.png`}
                className="absolute bottom-4 right-4 bg-black/50 text-white px-4 py-2 rounded hover:bg-black/70 transition-colors flex items-center space-x-2"
                title="下载图片"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>下载</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
