import React, { useState, useRef, useCallback, useMemo } from 'react';
import { ImageEditResult, AspectRatio, AspectRatioOption } from '../types/index.ts';
import { QuickTemplates } from './QuickTemplates.tsx';
import { PromptTemplates } from './PromptTemplates.tsx';
import { PasswordModal } from './PasswordModal.tsx';
import { DraggableFloatingButton } from './DraggableFloatingButton.tsx';
import { DraggableActionButton } from './DraggableActionButton.tsx';

// 宽高比选项配置
const aspectRatioOptions: AspectRatioOption[] = [
  {
    id: '1:1',
    label: '方形',
    description: '1:1',
    width: 1024,
    height: 1024,
    icon: '📷',
    useCase: 'Center-focused, balanced compositions'
  },
  {
    id: '4:3',
    label: '横屏',
    description: '4:3',
    width: 1024,
    height: 768,
    icon: '🖥️',
    useCase: 'Horizon-based, scenic layouts'
  },
  {
    id: '3:4',
    label: '竖屏',
    description: '3:4',
    width: 768,
    height: 1024,
    icon: '📱',
    useCase: 'Vertical emphasis, subject-focused'
  },
  {
    id: '16:9',
    label: '宽屏',
    description: '16:9',
    width: 1024,
    height: 576,
    icon: '💻',
    useCase: 'Cinematic, panoramic views'
  },
  {
    id: '9:16',
    label: '竖屏',
    description: '9:16',
    width: 576,
    height: 1024,
    icon: '📱',
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
  selectedMode?: string; // 添加选中的模式
  currentResult?: ImageEditResult | null; // 添加当前结果
  onClearResult?: () => void; // 添加清除结果的回调
  onModeChange?: (mode: string) => void; // 添加模式切换回调
  showSystemPromptModal?: boolean; // 来自父组件的模态框状态
  onCloseSystemPromptModal?: () => void; // 关闭模态框的回调
}

export const UnifiedWorkflow: React.FC<UnifiedWorkflowProps> = ({
  onProcessComplete,
  sessionId,
  isProcessing = false,
  selectedMode = 'generate', // 默认为生成模式
  currentResult = null, // 添加当前结果
  onClearResult, // 添加清除结果的回调
  onModeChange, // 添加模式切换回调
  showSystemPromptModal = false, // 来自父组件的模态框状态
  onCloseSystemPromptModal // 关闭模态框的回调
}) => {
  const [prompt, setPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState(''); // 保存原始提示词
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number}[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>('9:16');
  const [detectedAspectRatio, setDetectedAspectRatio] = useState<AspectRatio>('1:1'); // 检测到的图片实际宽高比
  const [isPolishing, setIsPolishing] = useState(false);
  const [customSystemPrompt, setCustomSystemPrompt] = useState('');
  
  // 计算图片布局类名
  const gridLayoutClass = useMemo(() => {
    if (imagePreviews.length === 1) return 'grid-cols-1';
    if (imagePreviews.length === 2) {
      // 检查是否两张都是横图
      const bothLandscape = imageDimensions.length === 2 && 
        imageDimensions[0].width > imageDimensions[0].height && 
        imageDimensions[1].width > imageDimensions[1].height;
      return bothLandscape ? 'grid-cols-1' : 'grid-cols-2';
    }
    if (imagePreviews.length === 3) return 'grid-cols-2';
    return 'grid-cols-2';
  }, [imagePreviews.length, imageDimensions]);
  
  // 新增系统提示词管理状态
  const [customGenerationPrompt, setCustomGenerationPrompt] = useState('');
  const [customEditingPrompt, setCustomEditingPrompt] = useState('');
  const [customAnalysisPrompt, setCustomAnalysisPrompt] = useState(''); // 新增智能分析提示词
  const [modalActiveMode, setModalActiveMode] = useState<'generate' | 'edit' | 'analysis' | 'templates'>(selectedMode === 'edit' ? 'edit' : 'generate'); // 扩展模式选项
  const [showSavePasswordModal, setShowSavePasswordModal] = useState(false); // 保存时的密码验证模态框
  
  // 新增状态用于图片分析功能
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [showAnalysisDetails, setShowAnalysisDetails] = useState(false);
  
  // 图片预览模态框状态
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [previewImageTitle, setPreviewImageTitle] = useState('');
  const [previewImageType, setPreviewImageType] = useState<'before' | 'after'>('before'); // 新增：标识当前预览的图片类型
  
  // 保存原始图片引用，防止在编辑过程中被修改
  const [originalImageRef, setOriginalImageRef] = useState<string>('');
  
  // 错误结果显示状态
  const [errorResult, setErrorResult] = useState<{
    type: 'policy_violation' | 'general_error';
    title: string;
    message: string;
    details?: string;
    originalResponse?: string; // 添加原始回复字段
    timestamp: number;
  } | null>(null);
  
  // 继续编辑模式状态
  const [isContinueEditMode, setIsContinueEditMode] = useState(() => {
    console.log('UnifiedWorkflow组件初始化，持续编辑状态:', false);
    return false;
  });
  
  // 继续编辑模式下的新上传图片状态
  const [continueEditFiles, setContinueEditFiles] = useState<File[]>([]);
  const [continueEditPreviews, setContinueEditPreviews] = useState<string[]>([]);
  const [continueEditDimensions, setContinueEditDimensions] = useState<{width: number, height: number}[]>([]);
  
  // 记录单图时的容器高度
  const [singleImageHeight, setSingleImageHeight] = useState<number | null>(null);
  
  // 计算图片的最大高度，确保不超出容器
  const calculateMaxImageHeight = useCallback(() => {
    const screenHeight = window.innerHeight;
    const headerHeight = 120; // 增加头部高度估算
    const promptHeight = 250; // 增加提示词输入区域高度估算
    const buttonHeight = 100; // 增加按钮区域高度估算
    const padding = 100; // 增加容器内边距和缓冲
    const buffer = 50; // 额外缓冲空间
    
    return Math.max(200, screenHeight - headerHeight - promptHeight - buttonHeight - padding - buffer);
  }, []);
  
  // 计算继续编辑模式的网格布局类名
  const continueEditGridClass = useMemo(() => {
    const totalImages = 1 + continueEditPreviews.length; // 生成结果 + 新上传图片
    
    if (totalImages === 2) {
      // 检查是否都是横图（宽度 > 高度）
      const isLandscape = (width: number, height: number) => width > height;
      
      // 获取当前结果的宽高比
      const currentResultIsLandscape = currentResult && 
        isLandscape(currentResult.width || 1024, currentResult.height || 1024);
      
      // 检查新上传图片是否都是横图
      const allNewImagesLandscape = continueEditDimensions.every(dim => 
        isLandscape(dim.width, dim.height)
      );
      
      // 只有都是横图时才纵向排列
      if (currentResultIsLandscape && allNewImagesLandscape) {
        return 'grid-cols-1';
      }
      return 'grid-cols-2'; // 其他情况横向并列
    }
    
    switch (totalImages) {
      case 1:
        return 'grid-cols-1';
      case 3:
        return 'grid-cols-2'; // 3张图：第一张占2列，后两张各占1列
      case 4:
        return 'grid-cols-2';
      case 5:
        return 'grid-cols-3'; // 5张图：使用3列布局
      default:
        return 'grid-cols-2';
    }
  }, [continueEditPreviews.length, continueEditDimensions, currentResult]);
  // 初始化默认系统提示词
  React.useEffect(() => {
    // 从后端加载系统提示词
    const loadSystemPrompts = async () => {
      try {
        const response = await fetch('/api/auth/system-prompts');
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            const prompts = result.data;
            if (prompts.generation) setCustomGenerationPrompt(prompts.generation);
            if (prompts.editing) setCustomEditingPrompt(prompts.editing);
            if (prompts.analysis) setCustomAnalysisPrompt(prompts.analysis);
            return; // 如果成功加载，直接返回
          }
        }
      } catch (error) {
        console.error('Failed to load system prompts:', error);
      }
      
      // 如果加载失败或没有数据，使用默认值
      initializeDefaultPrompts();
    };

    const initializeDefaultPrompts = () => {
      // 初始化文生图系统提示词
    if (!customGenerationPrompt) {
      const defaultGenerationPrompt = `你是一位专业的AI图像生成提示词优化专家，专门为Gemini 2.5 Flash Image Preview优化文生图提示词。

## 核心原则
**描述场景，而不是罗列关键词**。模型的核心优势是深度语言理解，叙述性的描述段落几乎总能产生比零散关键词更好、更连贯的图像。

## 优化模板结构
"一个[风格] [拍摄类型] 展现[主体]，[动作/表情]，置身于[环境]中。场景由[光照描述]照明，营造出[情绪]氛围。使用[相机/镜头细节]拍摄，强调[关键纹理和细节]。图像应为[宽高比]格式。"

## 优化要求
1. 将任何关键词列表转换为连贯的叙事描述
2. 保持用户原始意图的同时增加上下文丰富性
3. 使用专业摄影和艺术术语
4. 应用宽高比特定的构图指导
5. 通过光照和情绪描述创造大气深度  
6. 包含技术相机规格以获得逼真效果
7. 强调纹理、细节和视觉叙事元素
8. 用中文输出优化后的提示词

请将输入转化为专业的、叙事驱动的提示词，遵循Gemini最佳实践。专注于场景描述和视觉叙事。只返回优化后的提示词，不要解释。`;
      setCustomGenerationPrompt(defaultGenerationPrompt);
    }

    // 初始化图片编辑系统提示词
    if (!customEditingPrompt) {
      const defaultEditingPrompt = `你是一位专业的AI图片编辑提示词优化专家，擅长为Gemini 2.5 Flash Image Preview生成精确的图片编辑指令。

请基于图片编辑最佳实践，优化用户的编辑指令，使其更加精确和专业。

## 优化重点
1. **明确编辑指令**：清晰指定要添加/删除/修改的具体元素
2. **保持一致性**：强调保留原图的重要特征和风格
3. **局部编辑**：专注于指定区域的修改，避免影响其他部分
4. **自然融合**：确保新增或修改的元素与原图环境协调
5. **技术精度**：使用专业的编辑术语和指导

请优化编辑指令，使其更加专业和精确。只返回优化后的提示词，用中文输出。`;
      setCustomEditingPrompt(defaultEditingPrompt);
    }
    
    // 初始化智能分析编辑系统提示词
    if (!customAnalysisPrompt) {
      const defaultAnalysisPrompt = `Role and Goal:
You are an expert prompt engineer. Your task is to analyze user-provided image(s) and a corresponding editing instruction. Based on this analysis, you will generate a new, detailed, and optimized prompt for the 'gemini-2.5-flash-image-preview' model. Your output MUST be ONLY the generated prompt text, with no additional explanations.

Core Instructions:

**1. For Single Image Editing:**
- Frame the task as a direct edit on the provided image.
- Start with phrases like "Using the provided image..." or "On the provided image...".
- Example for changing a part: "Using the provided image of the living room, change ONLY the blue sofa to be a vintage, brown leather chesterfield sofa. Keep the rest of the room, including the pillows and lighting, unchanged."

**2. For Multi-Image Editing (IMPORTANT):**
- First, identify the **main/target image** (the one being edited) and the **source/reference image** (the one providing the element/style).
- **NEVER** start the prompt with "Create a new composite image" unless the goal is to merge two scenes into a completely new one (e.g., putting a cat on a beach).
- **For Replacement/Swapping (like the user's case):** Frame the task as an **in-place edit** on the target image.
  - **Correct Example Structure:** "Using the second image (the woman), replace the existing clothes with the [detailed description of clothes] from the first image. The new clothing must be realistically adapted to her body, perfectly matching her posture and body contours. It is crucial to preserve the entire background, the woman's face, hair, and body from the second image. The lighting and shadows on the new clothes must seamlessly integrate with the lighting conditions of the second image."

General Requirements:
- Be specific and descriptive. Analyze the image(s) to add details about lighting, texture, and perspective to make the edit blend naturally.
- When modifying parts, explicitly state what should be kept unchanged to ensure high-fidelity edits. This is critical.
- Always respond in Chinese (中文) to match the user interface language.`;
      setCustomAnalysisPrompt(defaultAnalysisPrompt);
    }
    
    // 保持原有的通用系统提示词初始化（用于兼容）
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
    };

    loadSystemPrompts();
  }, []);

  // 当selectedMode改变时，更新modalActiveMode
  React.useEffect(() => {
    setModalActiveMode(selectedMode === 'edit' ? 'edit' : 'generate');
  }, [selectedMode]);

  // 键盘事件监听器 - 支持ESC键关闭图片预览
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showImagePreview) {
        closeImagePreview();
      }
    };

    if (showImagePreview) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showImagePreview]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 检测图片实际宽高比的函数
  const detectImageAspectRatio = (file: File): Promise<AspectRatio> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const ratio = img.naturalWidth / img.naturalHeight;
        
        // 根据比例匹配最接近的预设宽高比
        if (Math.abs(ratio - 1) < 0.1) {
          resolve('1:1');
        } else if (Math.abs(ratio - (4/3)) < 0.1) {
          resolve('4:3');
        } else if (Math.abs(ratio - (3/4)) < 0.1) {
          resolve('3:4');
        } else if (Math.abs(ratio - (16/9)) < 0.1) {
          resolve('16:9');
        } else if (Math.abs(ratio - (9/16)) < 0.1) {
          resolve('9:16');
        } else {
          // 如果不匹配任何预设比例，选择最接近的
          if (ratio > 1.5) {
            resolve('16:9'); // 宽屏
          } else if (ratio > 1.2) {
            resolve('4:3'); // 横屏
          } else if (ratio > 0.8) {
            resolve('1:1'); // 正方形
          } else if (ratio > 0.6) {
            resolve('3:4'); // 竖屏
          } else {
            resolve('9:16'); // 竖屏长图
          }
        }
      };
      img.src = URL.createObjectURL(file);
    });
  };

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
    console.log('handleFileInput 被调用');
    const files = e.target.files;
    if (files) {
      console.log('文件数量:', files.length);
      console.log('dataset.leftSide 值:', e.target.dataset.leftSide);
      // 检查是否有特殊标记来判断是左侧上传
      const isLeftSideUpload = e.target.dataset.leftSide === 'true';
      console.log('是否左侧上传:', isLeftSideUpload);
      
      // 清除标记，避免影响下次上传
      delete e.target.dataset.leftSide;
      
      handleFiles(Array.from(files), isLeftSideUpload);
    }
  };

  // 左侧上传处理函数
  const handleLeftSideUpload = () => {
    console.log('handleLeftSideUpload 被调用');
    if (fileInputRef.current) {
      // 设置标记表示这是左侧上传
      fileInputRef.current.dataset.leftSide = 'true';
      console.log('设置左侧标记并点击文件输入');
      fileInputRef.current.click();
    }
  };

  const handleFiles = (files: File[], isLeftSideUpload: boolean = false) => {
    console.log('handleFiles 被调用, isLeftSideUpload:', isLeftSideUpload, 'files:', files.length);
    
    // 简化的左侧上传逻辑
    if (isLeftSideUpload && files.length > 0) {
      const validFiles = files.filter(file => file.type.startsWith('image/'));
      if (validFiles.length === 0) return;
      
      const promises = validFiles.map(file => {
        return new Promise<{preview: string, file: File, dimensions: {width: number, height: number}}>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              const img = new Image();
              img.onload = () => {
                resolve({
                  preview: e.target.result as string,
                  file: file,
                  dimensions: { width: img.width, height: img.height }
                });
              };
              img.src = e.target.result as string;
            }
          };
          reader.readAsDataURL(file);
        });
      });
      
      Promise.all(promises).then(results => {
        const maxFiles = 2;
        setImagePreviews(prev => {
          const combined = [...prev, ...results.map(r => r.preview)];
          return combined.slice(0, maxFiles);
        });
        setUploadedFiles(prev => {
          const combined = [...prev, ...results.map(r => r.file)];
          return combined.slice(0, maxFiles);
        });
        setImageDimensions(prev => {
          const combined = [...prev, ...results.map(r => r.dimensions)];
          return combined.slice(0, maxFiles);
        });
        
        // 设置第一张图片为原始引用
        if (results.length > 0) {
          setOriginalImageRef(results[0].preview);
        }
        
        // 左侧上传时退出持续编辑模式
        if (isContinueEditMode) {
          setIsContinueEditMode(false);
          console.log('左侧上传图片，退出持续编辑模式');
        }
      });
      return;
    }
    
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

    console.log('有效文件数量:', validFiles.length, '左侧上传:', isLeftSideUpload, '继续编辑模式:', isContinueEditMode);

    // 如果是左侧上传，使用普通上传逻辑（替换左侧图片）
    if (isLeftSideUpload) {
      console.log('进入左侧上传逻辑');
      // 普通模式：原有逻辑
      const maxFiles = 2;
      
      setUploadedFiles(prevFiles => {
        // 如果是左侧上传，直接替换而不是累加
        const baseFiles = isLeftSideUpload ? [] : prevFiles;
        const combinedFiles = [...baseFiles, ...validFiles];
        const limitedFiles = combinedFiles.slice(0, maxFiles);
        
        if (combinedFiles.length > maxFiles) {
          alert(`最多只能上传${maxFiles}张图片，已保留前${limitedFiles.length}张`);
        }
        
        return limitedFiles;
      });

      // 生成新图片的预览
      const newPreviews: string[] = [];
      const newDimensions: {width: number, height: number}[] = [];
      const promises = validFiles.map((file, index) => {
        return new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              const img = new Image();
              img.onload = () => {
                newPreviews[index] = e.target.result as string;
                newDimensions[index] = { width: img.width, height: img.height };
                resolve();
              };
              img.src = e.target.result as string;
            }
          };
          reader.readAsDataURL(file);
        });
      });

      Promise.all(promises).then(() => {
        setContinueEditPreviews(prevPreviews => {
          const combinedPreviews = [...prevPreviews, ...newPreviews];
          return combinedPreviews.slice(0, 4);
        });
        setContinueEditDimensions(prevDimensions => {
          const combinedDimensions = [...prevDimensions, ...newDimensions];
          return combinedDimensions.slice(0, 4);
        });
      });
    } else if (isContinueEditMode) {
      // 右侧继续编辑模式：添加到专门的继续编辑文件状态
      console.log('进入右侧继续编辑上传逻辑');
      setContinueEditFiles(prevFiles => {
        const combinedFiles = [...prevFiles, ...validFiles];
        const limitedFiles = combinedFiles.slice(0, 4);
        
        if (combinedFiles.length > 4) {
          alert(`继续编辑模式最多上传4张新图片，已保留前${limitedFiles.length}张`);
        }
        
        return limitedFiles;
      });

      // 生成继续编辑图片的预览
      const newPreviews: string[] = [];
      const newDimensions: {width: number, height: number}[] = [];
      const promises = validFiles.map((file, index) => {
        return new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              const img = new Image();
              img.onload = () => {
                newPreviews[index] = e.target.result as string;
                newDimensions[index] = { width: img.width, height: img.height };
                resolve();
              };
              img.src = e.target.result as string;
            }
          };
          reader.readAsDataURL(file);
        });
      });

      Promise.all(promises).then(() => {
        setContinueEditPreviews(prevPreviews => {
          const combinedPreviews = [...prevPreviews, ...newPreviews];
          return combinedPreviews.slice(0, 4);
        });
        setContinueEditDimensions(prevDimensions => {
          const combinedDimensions = [...prevDimensions, ...newDimensions];
          return combinedDimensions.slice(0, 4);
        });
      });
    } else {
      // 普通模式：原有逻辑
      const maxFiles = 2;
      
      setUploadedFiles(prevFiles => {
        const combinedFiles = [...prevFiles, ...validFiles];
        const limitedFiles = combinedFiles.slice(0, maxFiles);
        
        if (combinedFiles.length > maxFiles) {
          alert(`最多只能上传${maxFiles}张图片，已保留前${limitedFiles.length}张`);
        }
        
        return limitedFiles;
      });

      // 生成新图片的预览
      const newPreviews: string[] = [];
      const newDimensions: {width: number, height: number}[] = [];
      const promises = validFiles.map((file, index) => {
        return new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              const img = new Image();
              img.onload = () => {
                newPreviews[index] = e.target.result as string;
                newDimensions[index] = { width: img.width, height: img.height };
                resolve();
              };
              img.src = e.target.result as string;
            }
          };
          reader.readAsDataURL(file);
        });
      });

      Promise.all(promises).then(() => {
        console.log('Promise.all 完成, newPreviews:', newPreviews.length);
        setImagePreviews(prevPreviews => {
          // 如果是左侧上传，直接替换而不是累加
          const basePreviews = isLeftSideUpload ? [] : prevPreviews;
          const combinedPreviews = [...basePreviews, ...newPreviews];
          const finalPreviews = combinedPreviews.slice(0, maxFiles);
          
          console.log('设置图片预览, finalPreviews:', finalPreviews.length);
          
          // 保存第一张图片作为原始图片引用（用于预览切换）
          if (finalPreviews.length > 0) {
            setOriginalImageRef(finalPreviews[0]);
          }
          
          return finalPreviews;
        });
        setImageDimensions(prevDimensions => {
          // 如果是左侧上传，直接替换而不是累加
          const baseDimensions = isLeftSideUpload ? [] : prevDimensions;
          const combinedDimensions = [...baseDimensions, ...newDimensions];
          return combinedDimensions.slice(0, maxFiles);
        });
        
        // 图片上传完成后触发滚动到页面底部
        setTimeout(() => {
          window.scrollTo({ 
            top: document.body.scrollHeight, 
            behavior: 'smooth' 
          });
        }, 100);
        
        // 只有在用户主动上传图片时才退出持续编辑模式（不是程序自动移动图片）
        // 通过检查是否是用户操作来判断
        if (isContinueEditMode && selectedMode === 'edit' && validFiles.length > 0) {
          // 检查是否是用户主动上传的文件（文件名不是 'previous-result.png'）
          const isUserUpload = validFiles.some(file => file.name !== 'previous-result.png');
          if (isUserUpload) {
            setIsContinueEditMode(false);
            console.log('用户重新上传图片，退出持续编辑模式');
          }
        }
      });

      // 检测第一个图片的宽高比（在智能编辑模式下使用）
      if (validFiles.length > 0) {
        detectImageAspectRatio(validFiles[0]).then(detectedRatio => {
          setDetectedAspectRatio(detectedRatio);
          console.log(`检测到图片宽高比: ${detectedRatio}`);
        });
      }
    }
  };

  const removeImage = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);
    const newDimensions = imageDimensions.filter((_, i) => i !== index);
    
    // 清理被移除的预览URL以避免内存泄漏
    if (imagePreviews[index] && imagePreviews[index].startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviews[index]);
    }
    
    // 如果移除的是第一张图片（原始图片引用），需要更新引用
    if (index === 0 && originalImageRef === imagePreviews[index]) {
      setOriginalImageRef(newPreviews.length > 0 ? newPreviews[0] : '');
    }
    
    setUploadedFiles(newFiles);
    setImagePreviews(newPreviews);
    setImageDimensions(newDimensions);
    
    // 删除左侧图片时退出持续编辑模式
    if (isContinueEditMode) {
      setIsContinueEditMode(false);
      console.log('删除左侧图片，退出持续编辑模式');
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearAll = () => {
    // 清理所有预览URL以避免内存泄漏
    imagePreviews.forEach(preview => {
      if (preview && preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview);
      }
    });
    
    setUploadedFiles([]);
    setImagePreviews([]);
    setImageDimensions([]);
    setOriginalImageRef(''); // 清除原始图片引用
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

  // 将DataURL转换为File对象的辅助函数
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

  // 继续编辑功能：切换继续编辑模式
  const handleContinueEditing = async () => {
    console.log('点击持续编辑按钮，当前状态:', isContinueEditMode);
    if (currentResult && currentResult.result) {
      if (isContinueEditMode) {
        // 如果已经在继续编辑模式，则退出该模式
        setIsContinueEditMode(false);
        console.log('退出继续编辑模式');
      } else {
        // 激活继续编辑模式，清空之前的继续编辑图片
        setIsContinueEditMode(true);
        setContinueEditFiles([]);
        setContinueEditPreviews([]);
        setContinueEditDimensions([]);
        console.log('继续编辑模式已激活：将使用生成结果作为编辑源图片');
      }
    }
  };

  // 打开图片预览模态框
  const openImagePreview = (imageUrl: string, title: string, type: 'before' | 'after' = 'before') => {
    setPreviewImageUrl(imageUrl);
    setPreviewImageTitle(title);
    setPreviewImageType(type);
    setShowImagePreview(true);
  };

  // 关闭图片预览模态框
  const closeImagePreview = () => {
    setShowImagePreview(false);
    setPreviewImageUrl('');
    setPreviewImageTitle('');
    setPreviewImageType('before');
  };

  // 切换预览图片
  const switchPreviewImage = () => {
    if (previewImageType === 'before' && currentResult) {
      // 从修改前切换到修改后
      setPreviewImageUrl(currentResult.result);
      setPreviewImageTitle(isContinueEditMode ? '修改中...' : '修改后');
      setPreviewImageType('after');
    } else if (previewImageType === 'after' && originalImageRef) {
      // 从修改后切换到修改前 - 使用保存的原始图片引用
      setPreviewImageUrl(originalImageRef);
      setPreviewImageTitle('修改前');
      setPreviewImageType('before');
    }
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

    // 清除当前结果，避免使用旧的生成结果
    // 但在持续编辑模式下不清除，因为用户正在编辑当前结果
    if (onClearResult && !isContinueEditMode) {
      onClearResult();
    }

    setIsPolishing(true);
    setIsAnalyzing(false);
    setAnalysisStatus('');
    
    try {
      // 如果是智能编辑模式且有上传图片或处于继续编辑模式，使用新的一次调用API
      if (selectedMode === 'edit' && (uploadedFiles.length > 0 || isContinueEditMode)) {
        setIsAnalyzing(true);
        setAnalysisStatus(`🧠 智能分析中...`);
        
        try {
          // 创建FormData进行智能分析编辑
          const formData = new FormData();
          // 根据模式发送对应的图片
          if (isContinueEditMode && currentResult) {
            // 继续编辑模式：发送右侧修改中的所有图片（生成结果+新上传图片）
            const resultFile = dataURLtoFile(currentResult.result, 'continue-edit-analysis.png');
            formData.append('images', resultFile);
            
            // 同时发送新上传的图片
            continueEditFiles.forEach((file, index) => {
              formData.append('images', file);
            });
            
            console.log(`继续编辑模式智能分析：使用生成结果 + ${continueEditFiles.length}张新上传图片`);
          } else {
            // 普通模式：发送所有上传的图片
            uploadedFiles.forEach((file, index) => {
              formData.append('images', file);
            });
          }
          formData.append('sessionId', sessionId || '');
          formData.append('userInstruction', prompt.trim());
          formData.append('customSystemPrompt', customAnalysisPrompt); // 发送自定义系统提示词
          
          const response = await fetch(`${API_BASE_URL}/edit/intelligent-analysis-editing`, {
            method: 'POST',
            body: formData,
          });
          
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data?.editPrompt) {
              setPrompt(result.data.editPrompt);
              setAnalysisStatus('✅ 智能分析完成！');
              // 2秒后清除状态
              setTimeout(() => {
                setAnalysisStatus('');
                setIsAnalyzing(false);
              }, 2000);
            } else {
              throw new Error('智能分析编辑API返回数据无效');
            }
          } else {
            throw new Error(`智能分析编辑API失败: ${response.status}`);
          }
          
          setIsPolishing(false);
          return; // 成功完成，直接返回
          
        } catch (intelligentError) {
          console.warn('智能分析编辑失败:', intelligentError);
          
          // 检查是否为内容政策违规
          if (intelligentError.message && intelligentError.message.includes('Content policy violation')) {
            // 将错误信息保存到状态中，在生成结果区域显示
            setErrorResult({
              type: 'policy_violation',
              title: '智能分析失败 - 内容政策违规',
              message: '图片或编辑指令不符合AI安全政策要求',
              details: '可能原因：\n• 图片包含敏感内容\n• 编辑指令涉及不当内容\n• 图片质量或格式问题\n\n建议：\n• 更换其他图片\n• 修改编辑指令\n• 检查图片是否清晰可识别',
              timestamp: Date.now()
            });
            
            // 清除当前结果，让错误信息显示在结果区域
            // 但在持续编辑模式下不清除，因为用户正在编辑当前结果
            if (onClearResult && !isContinueEditMode) {
              onClearResult();
            }
            
            setAnalysisStatus('❌ 内容不符合安全政策');
            // 立即清除分析状态，不要延迟
            setIsAnalyzing(false);
            setTimeout(() => {
              setAnalysisStatus('');
            }, 3000);
            setIsPolishing(false);
            return; // 不再继续降级处理
          }
          
          setAnalysisStatus('🔄 切换到系统优化...');
        }
      }

      // 传统优化流程（用于AI创作模式或智能分析失败时的降级）
      // 根据当前模式选择对应的系统提示词
      // 根据当前模式选择对应的系统提示词
      const currentSystemPrompt = selectedMode === 'edit' ? customEditingPrompt : customGenerationPrompt;
      
      // 构建优化请求
      const optimizePayload = {
        sessionId: sessionId,
        originalPrompt: prompt.trim(),
        aspectRatio: selectedMode === 'edit' ? detectedAspectRatio : selectedAspectRatio, // 编辑模式使用检测到的宽高比
        customSystemPrompt: currentSystemPrompt,
        promptType: selectedMode === 'edit' ? 'editing' : 'generation'
      };
      
      console.log('🚀 发送传统优化请求:', {
        promptType: optimizePayload.promptType,
        mode: selectedMode
      });
      
      const response = await fetch(`${API_BASE_URL}/edit/polish-prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(optimizePayload),
      });

      const result = await response.json();

      if (result.success) {
        setPrompt(result.data.polishedPrompt);
        console.log('✅ 传统提示词优化完成:', {
          originalLength: prompt.trim().length,
          optimizedLength: result.data.polishedPrompt.length
        });
        
        if (selectedMode === 'edit') {
          setAnalysisStatus('✅ 优化完成！');
          setTimeout(() => {
            setAnalysisStatus('');
          }, 2000);
          // 立即清除分析状态，不要延迟
          setIsAnalyzing(false);
        }
      } else {
        throw new Error(result.error || '润色失败');
      }

    } catch (error: any) {
      console.error('润色失败:', error);
      alert(`润色失败: ${error.message}`);
      setAnalysisStatus('');
      setIsAnalyzing(false);
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

    // 智能编辑模式下必须上传图片或处于继续编辑模式
    if (selectedMode === 'edit' && uploadedFiles.length === 0 && !isContinueEditMode) {
      alert('智能编辑模式需要上传至少一张图片或点击继续编辑');
      return;
    }

    setIsSubmitting(true);
    setIsAnalyzing(false);
    setAnalysisStatus('');

    try {
      // 如果是智能编辑模式，显示简化的状态
      if (selectedMode === 'edit' && uploadedFiles.length > 0) {
        setIsAnalyzing(true);
        setAnalysisStatus('🎨 智能编辑处理中...');
      }

      const formData = new FormData();
      
      // 获取选中的宽高比选项
      const actualAspectRatio = selectedMode === 'edit' ? detectedAspectRatio : selectedAspectRatio; // 编辑模式使用检测到的宽高比
      const selectedOption = aspectRatioOptions.find(option => option.id === actualAspectRatio);
      if (!selectedOption) {
        throw new Error('未选择有效的宽高比');
      }
      
      // 智能编辑模式下的图片处理
      if (selectedMode === 'edit') {
        if (isContinueEditMode && currentResult) {
          // 继续编辑模式：使用生成结果作为主图片
          const resultFile = dataURLtoFile(currentResult.result, 'continue-edit-source.png');
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
        // AI创作模式：如果没有用户上传的图片，生成对应比例的背景图片
        if (uploadedFiles.length === 0) {
          console.log(`生成背景图片: ${selectedOption.width}x${selectedOption.height}`);
          const backgroundImage = await generateBackgroundImage(
            selectedOption.width, 
            selectedOption.height,
            '#f8f9fa' // 浅灰色背景
          );
          formData.append('images', backgroundImage);
        } else {
          // 添加用户上传的图片
          uploadedFiles.forEach((file, index) => {
            formData.append('images', file);
          });
        }
      }
      
      formData.append('sessionId', sessionId);
      
      // 智能编辑模式和AI创作模式使用不同的提示词处理
      if (selectedMode === 'edit') {
        // 智能编辑模式：直接使用用户提示词
        formData.append('prompt', prompt.trim());
      } else {
        // AI创作模式：自动添加宽高比格式提示以提高生成准确性
        const enhancedPrompt = prompt.trim() + `. The image should be in a ${selectedAspectRatio} format.`;
        formData.append('prompt', enhancedPrompt);
      }
      
      // 添加原始提示词
      if (originalPrompt) {
        formData.append('originalPrompt', originalPrompt);
      }
      
      // 添加分辨率参数
      formData.append('aspectRatio', actualAspectRatio);
      formData.append('width', selectedOption.width.toString());
      formData.append('height', selectedOption.height.toString());
      
      // 添加分析功能控制参数 - 智能编辑模式下默认启用
      formData.append('enableAnalysis', (selectedMode === 'edit' && uploadedFiles.length > 0).toString());


      const response = await fetch(`${API_BASE_URL}/edit/edit-images`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      // 检查HTTP状态码和响应内容
      if (!response.ok) {
        // HTTP错误状态码，检查是否是政策违规
        if (result.policyViolation) {
          setErrorResult({
            type: 'policy_violation',
            title: '内容被AI拒绝',
            message: result.message || 'AI模型拒绝处理此请求，可能涉及敏感内容',
            details: result.details || '建议：\n• 调整提示词内容\n• 避免使用可能被视为敏感的词汇\n• 尝试更换描述方式\n• 检查上传图片是否包含敏感内容',
            originalResponse: result.originalResponse || result.error,
            timestamp: Date.now()
          });
          
          // 持续编辑模式下，将右侧图片移到左侧
          if (isContinueEditMode && currentResult) {
            try {
              const previousResultFile = dataURLtoFile(currentResult.result, 'previous-result.png');
              const previewUrl = URL.createObjectURL(previousResultFile);
              
              setUploadedFiles([previousResultFile]);
              setImagePreviews([previewUrl]);
              setOriginalImageRef(previewUrl);
              
              console.log('AI拒绝处理，持续编辑模式：上一次结果已移至左侧');
              
              // 退出持续编辑模式，让橙色框移到左侧
              setIsContinueEditMode(false);
              console.log('AI拒绝后退出持续编辑模式');
            } catch (error) {
              console.warn('移动上一次结果到左侧失败:', error);
            }
          }
          
          // 清除当前结果，让错误信息显示
          if (onClearResult) {
            onClearResult();
          }
          
          return;
        } else {
          // 其他HTTP错误
          throw new Error(result.message || result.error || `HTTP ${response.status}: ${response.statusText}`);
        }
      }

      if (result.success) {
        // 检查是否是文本结果且包含Gemini拒绝回复
        if (result.data.resultType === 'text' && 
            (result.data.result.includes("Sorry, I'm unable to help you with that") ||
             result.data.result.includes("I can't help with that") ||
             result.data.result.includes("I'm not able to help with that") ||
             result.data.result.includes("Sorry, I can't help with that"))) {
          
          // 将Gemini拒绝回复转为错误显示
          setErrorResult({
            type: 'policy_violation',
            title: '内容被AI拒绝',
            message: 'AI模型拒绝处理此请求，可能涉及敏感内容',
            details: '建议：\n• 调整提示词内容\n• 避免使用可能被视为敏感的词汇\n• 尝试更换描述方式\n• 检查上传图片是否包含敏感内容',
            originalResponse: result.data.result, // 保存原始回复
            timestamp: Date.now()
          });
          
          // 持续编辑模式下，将右侧图片移到左侧
          if (isContinueEditMode && currentResult) {
            try {
              const previousResultFile = dataURLtoFile(currentResult.result, 'previous-result.png');
              const previewUrl = URL.createObjectURL(previousResultFile);
              
              setUploadedFiles([previousResultFile]);
              setImagePreviews([previewUrl]);
              setOriginalImageRef(previewUrl);
              
              console.log('AI拒绝处理，持续编辑模式：上一次结果已移至左侧');
              
              // 退出持续编辑模式，让橙色框移到左侧
              setIsContinueEditMode(false);
              console.log('AI拒绝后退出持续编辑模式');
            } catch (error) {
              console.warn('移动上一次结果到左侧失败:', error);
            }
          }
          
          // 清除当前结果，让错误信息显示
          if (onClearResult) {
            onClearResult();
          }
          
          return; // 不继续处理为正常结果
        }
        
        // 如果是继续编辑模式，将上一次的结果移到左侧显示区域
        if (isContinueEditMode && currentResult) {
          try {
            // 将上一次的结果转换为File对象并设置为上传的文件
            const previousResultFile = dataURLtoFile(currentResult.result, 'previous-result.png');
            const previewUrl = URL.createObjectURL(previousResultFile);
            
            setUploadedFiles([previousResultFile]);
            setImagePreviews([previewUrl]);
            setOriginalImageRef(previewUrl); // 设置原始图片引用
            
            console.log('持续编辑完成：上一次结果已移至左侧原图区域');
            
            // 将右侧的继续编辑图片移到左侧
            if (continueEditFiles.length > 0) {
              setUploadedFiles(prev => [...prev, ...continueEditFiles].slice(0, 2));
              setImagePreviews(prev => [...prev, ...continueEditPreviews].slice(0, 2));
              setImageDimensions(prev => [...prev, ...continueEditDimensions].slice(0, 2));
              console.log('右侧继续编辑图片已移至左侧');
            }
            
            // 清理右侧的继续编辑图片（但保留生成结果）
            setContinueEditFiles([]);
            setContinueEditPreviews([]);
            setContinueEditDimensions([]);
            console.log('清理右侧继续编辑图片，保留生成结果');
          } catch (error) {
            console.warn('移动上一次结果到左侧失败:', error);
          }
        }
        
        onProcessComplete(result.data);
        
        console.log('生成完成后，持续编辑状态:', isContinueEditMode);
        
        // 智能编辑模式：在非继续编辑模式下保留上传的图片和提示词
        // AI创作模式：清除所有内容  
        if (selectedMode === 'edit' && !isContinueEditMode) {
          // 保留图片和提示词，支持对同一张图片用同样或不同的指令多次编辑
          console.log('智能编辑完成：保留图片和提示词，支持继续编辑');
        } else if (selectedMode === 'generate') {
          // AI创作模式：清除图片和提示词
          setUploadedFiles([]);
          setImagePreviews([]);
          setOriginalImageRef(''); // 清除原始图片引用
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      } else {
        // 这种情况不应该发生，因为HTTP错误已经在上面处理了
        throw new Error(result.error || '未知错误');
      }

    } catch (error: any) {
      console.error('处理失败:', error);
      
      // 检查是否是内容政策违规错误
      if (error.message && error.message.includes('Content policy violation')) {
        // 将错误信息保存到状态中，在生成结果区域显示
        setErrorResult({
          type: 'policy_violation',
          title: '内容政策违规',
          message: '上传的图片或编辑指令不符合AI安全政策要求',
          details: '可能原因：\n• 图片包含敏感内容\n• 编辑指令涉及不当内容\n• 图片质量或格式问题\n\n建议：\n• 更换其他图片\n• 修改编辑指令\n• 检查图片是否清晰可识别',
          timestamp: Date.now()
        });
        
        // 清除当前结果，让错误信息显示在结果区域
        if (onClearResult) {
          onClearResult();
        }
      }
      // 检查是否是敏感词被拒绝的情况
      else if (error.message && error.message.includes("Sorry, I'm unable to help you with that.")) {
        setErrorResult({
          type: 'policy_violation',
          title: '内容被拒绝',
          message: '提示词包含敏感信息被AI拒绝',
          details: '建议：\n• 调整提示词内容\n• 避免使用可能被视为敏感的词汇\n• 尝试更换描述方式',
          timestamp: Date.now()
        });
        
        if (onClearResult) {
          onClearResult();
        }
      } else {
        // 其他错误仍然使用alert显示
        alert(`处理失败: ${error.message}`);
      }
    } finally {
      setIsSubmitting(false);
      setIsAnalyzing(false);
      setAnalysisStatus('');
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
    <div className="max-w-6xl mx-auto space-y-4">
      {/* 工作流程 */}
      <div className="card px-8 pt-8 pb-4" ref={(el) => {
        // 生成完成后滚动到页面底部，方便后续编辑
        if (el && currentResult && !isProcessing) {
          setTimeout(() => {
            window.scrollTo({ 
              top: document.body.scrollHeight, 
              behavior: 'smooth' 
            });
          }, 100);
        }
      }}>
        
        {/* 测试文本 - 如果看到这个说明代码生效了 */}
        <div style={{backgroundColor: 'red', color: 'white', padding: '20px', fontSize: '24px', textAlign: 'center', margin: '10px 0'}}>
          🔴 测试：如果你看到这个红色区域，说明代码已更新！
        </div>
        
        {/* 图片操作按钮 - 顶部显示，所有模式都可用 */}
        <div className="mb-6 flex justify-center space-x-4 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
          <button
            type="button"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg transition-colors flex items-center space-x-3 disabled:bg-gray-400 shadow-lg font-bold text-lg"
            onClick={handleLeftSideUpload}
            disabled={isSubmitting || isProcessing}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span>📤 上传图片</span>
          </button>
          <button
            type="button"
            className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-lg transition-colors flex items-center space-x-3 disabled:bg-gray-400 shadow-lg font-bold text-lg"
            onClick={clearAll}
            disabled={isSubmitting || isProcessing || uploadedFiles.length === 0}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>🗑️ 清空图片</span>
          </button>
        </div>

        {/* 步骤1: 图片工作区 - 智能编辑模式下显示 */}
        {selectedMode === 'edit' && (
        <div className="mb-8">
          
          {/* 图片工作区 - 左右布局 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 items-stretch">
            {/* 左侧：原图区域 */}
            <div className="space-y-3">
              
              {imagePreviews.length === 0 ? (
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center bg-gray-50 image-preview-responsive flex flex-col">
                  <div
                    className={`flex-1 flex flex-col justify-center transition-colors duration-200 rounded-lg ${
                      dragActive
                        ? 'bg-primary-50'
                        : 'hover:bg-gray-100'
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
                    上传原图
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    拖拽图片到这里或点击上传<br/>
                    支持 JPG, PNG, GIF, WebP 等格式，最大 10MB
                  </p>
                  <div className="flex justify-center space-x-3">
                    <button
                      type="button"
                      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                      onClick={handleLeftSideUpload}
                      disabled={isSubmitting || isProcessing}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span>上传</span>
                    </button>
                    <button
                      type="button"
                      className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                      onClick={clearAll}
                      disabled={isSubmitting || isProcessing || uploadedFiles.length === 0}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>清空</span>
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
                </div>
              ) : (
                <div className={`border-2 border-dashed rounded-lg overflow-hidden bg-gray-50 image-preview-responsive flex flex-col ${
                  currentResult && !isContinueEditMode ? 'border-orange-400' : 'border-gray-200'
                }`}>
                  <div className="p-4 space-y-4">
                    <div className="text-center">
                      <h5 className="text-sm font-medium text-gray-600">修改前</h5>
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden">
                  {/* 原图预览 - 多张图片共享预览区域 */}
                  <div className="h-full">
                    {/* 继续编辑模式下显示新上传的图片，否则显示原始上传的图片 */}
                    {(isContinueEditMode && imagePreviews.length > 0) || (!isContinueEditMode && imagePreviews.length > 0) ? (
                      <div className={`grid gap-2 ${gridLayoutClass} h-full`}>
                        {imagePreviews.map((preview, index) => (
                          <div key={index} className={`relative group ${
                            imagePreviews.length === 3 && index === 2 ? 'col-span-2' : ''
                          }`}>
                            <div 
                              className="w-full h-full overflow-hidden bg-gray-100 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-center"
                              onClick={() => openImagePreview(index === 0 && originalImageRef ? originalImageRef : preview, '修改前', 'before')}
                              
                            >
                              <img
                                src={preview}
                                alt={`原图 ${index + 1}`}
                                className="original-image max-w-full max-h-full object-contain hover:scale-105 transition-transform duration-200"
                              />
                              />
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeImage(index);
                              }}
                              className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600 shadow-lg"
                              disabled={isSubmitting || isProcessing}
                              title="删除图片"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                            <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                              {uploadedFiles[index]?.name.substring(0, 15)}...
                            </div>
                            <div className="absolute top-2 left-2 bg-blue-500/80 text-white text-xs px-2 py-1 rounded">
                              {isContinueEditMode ? '新上传' : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* 继续编辑模式下没有新上传图片时的提示 */
                      isContinueEditMode ? (
                        <div className="border-2 border-dashed border-orange-200 rounded-lg p-6 text-center bg-orange-50">
                          <div className="text-orange-400 mb-4">
                            <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                          </div>
                          <p className="text-orange-600 text-sm">
                            继续编辑模式已激活<br/>
                            可上传新图片参与编辑
                          </p>
                        </div>
                      ) : null
                    )}
                  </div>
                  
                  {/* 操作按钮 */}
                  <div className="p-4 flex justify-center space-x-3">
                    <button
                      type="button"
                      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 disabled:bg-gray-300"
                      onClick={handleLeftSideUpload}
                      disabled={isSubmitting || isProcessing || imagePreviews.length >= (isContinueEditMode ? 4 : 2)}
                      title={imagePreviews.length >= (isContinueEditMode ? 4 : 2) ? '已达上限' : '添加更多'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span>上传</span>
                    </button>
                    <button
                      type="button"
                      className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 disabled:bg-gray-300"
                      onClick={clearAll}
                      disabled={isSubmitting || isProcessing}
                      title="清除所有"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>清空</span>
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
                </div>
              )}
              
              {/* 操作按钮 - 始终显示 */}
              <div className="flex justify-center space-x-3 mt-4 p-4 bg-white rounded-lg shadow-md border">
                <button
                  type="button"
                  className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg transition-colors flex items-center space-x-2 disabled:bg-gray-300 shadow-lg font-medium"
                  onClick={handleLeftSideUpload}
                  disabled={isSubmitting || isProcessing}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span>上传图片</span>
                </button>
                <button
                  type="button"
                  className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg transition-colors flex items-center space-x-2 disabled:bg-gray-300 shadow-lg font-medium"
                  onClick={clearAll}
                  disabled={isSubmitting || isProcessing || uploadedFiles.length === 0}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>清空图片</span>
                </button>
              </div>
            </div>

            {/* 右侧：生成图片区域 */}
            <div className="space-y-3 flex flex-col">
              
              <div className={`border-2 border-dashed rounded-lg overflow-hidden bg-gray-50 flex-1 flex flex-col relative ${
                isContinueEditMode ? 'border-orange-400' : 'border-gray-200'
              }`}>
                {currentResult ? (
                  <>
                    <div className="p-4">
                      <div className="text-center">
                        <h5 className="text-sm font-medium text-gray-600">{isContinueEditMode ? '修改中...' : '修改后'}</h5>
                      </div>
                    </div>
                    {/* 继续编辑模式下显示生成结果+新上传图片，否则只显示生成结果 */}
                    {isContinueEditMode ? (
                      <>
                        {/* 继续编辑模式：显示生成结果和新上传的图片 */}
                        <div 
                          className={`grid gap-2 ${continueEditGridClass} flex-1`}
                          style={{
                            height: (1 + continueEditPreviews.length) > 1 && singleImageHeight ? `${singleImageHeight}px` : 'auto'
                          }}
                        >
                        {/* 显示生成结果 */}
                        <div className={`relative group ${
                          (1 + continueEditPreviews.length) === 3 && continueEditPreviews.length === 2 ? 'col-span-2' : ''
                        }`}>
                          <div 
                            className="w-full overflow-hidden bg-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => openImagePreview(currentResult.result, '修改中...', 'after')}
                            title="点击预览生成结果"
                            ref={(el) => {
                              // 当只有单图时，记录容器高度
                              if (el && (1 + continueEditPreviews.length) === 1) {
                                setTimeout(() => {
                                  const height = el.offsetHeight;
                                  if (height > 0) {
                                    setSingleImageHeight(height);
                                  }
                                }, 100);
                              }
                            }}
                            style={{
                              height: (1 + continueEditPreviews.length) > 1 && singleImageHeight ? `${singleImageHeight}px` : 'auto'
                            }}
                          >
                            {currentResult.resultType === 'image' ? (
                              <img
                                src={currentResult.result}
                                alt="生成结果"
                                className="w-full h-auto object-contain hover:scale-105 transition-transform duration-200"
                                style={{ maxHeight: `${calculateMaxImageHeight()}px` }}
                              />
                            ) : (
                              <div className="p-4 h-full flex items-center justify-center">
                                <div className="text-gray-700 text-sm whitespace-pre-wrap text-center max-h-full overflow-y-auto">
                                  {currentResult.result}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                            生成结果
                          </div>
                          <div className="absolute top-2 left-2 bg-blue-500/80 text-white text-xs px-2 py-1 rounded">
                            当前结果
                          </div>
                        </div>
                        
                        {/* 显示新上传的图片 */}
                        {continueEditPreviews.map((preview, index) => (
                          <div key={index} className={`relative group ${
                            (1 + continueEditPreviews.length) === 3 && index === 0 ? 'col-span-2' : ''
                          }`}>
                            <div 
                              className="w-full aspect-square sm:aspect-auto overflow-hidden bg-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                              onClick={() => openImagePreview(preview, '新上传图片', 'before')}
                              title="点击预览新上传图片"
                              style={{
                                height: singleImageHeight && window.innerWidth >= 640 ? `${singleImageHeight}px` : 'auto'
                              }}
                            >
                              <img
                                src={preview}
                                alt={`新上传图片 ${index + 1}`}
                                className="w-full h-auto object-contain hover:scale-105 transition-transform duration-200"
                                style={{ maxHeight: `${calculateMaxImageHeight()}px` }}
                              />
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                // 删除继续编辑模式下的图片
                                setContinueEditFiles(prev => prev.filter((_, i) => i !== index));
                                setContinueEditPreviews(prev => prev.filter((_, i) => i !== index));
                                setContinueEditDimensions(prev => prev.filter((_, i) => i !== index));
                              }}
                              className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600 shadow-lg"
                              disabled={isSubmitting || isProcessing}
                              title="删除图片"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                            <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                              {continueEditFiles[index]?.name.substring(0, 15)}...
                            </div>
                            <div className="absolute top-2 left-2 bg-orange-500/80 text-white text-xs px-2 py-1 rounded">
                              新上传
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* 继续编辑模式的操作按钮 - 与修改前按钮对齐 */}
                      <div className="p-4 flex justify-between items-center">
                        <div className="flex space-x-4">
                          {/* 上传按钮 - 根据持续编辑状态控制 */}
                          <button
                            type="button"
                            className="bg-orange-500 hover:bg-orange-600 text-white w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                            onClick={() => {
                              if (fileInputRef.current) {
                                // 清除左侧标记
                                fileInputRef.current.dataset.leftSide = 'false';
                                fileInputRef.current.click();
                              }
                            }}
                            disabled={isSubmitting || isProcessing || continueEditPreviews.length >= 4}
                            title={continueEditPreviews.length >= 4 ? "最多上传4张图片" : "上传新图片参与编辑"}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                          
                          {currentResult.resultType === 'image' && (
                            <a
                              href={currentResult.result}
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
                        
                        {/* 持续编辑开关 - 右对齐 */}
                        <button
                          onClick={handleContinueEditing}
                          className="flex items-center space-x-3 flex-shrink-0"
                          title="点击退出持续编辑模式"
                        >
                          {/* iPhone风格开关 */}
                          <div className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 bg-green-500">
                            <span className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 translate-x-6" />
                          </div>
                          <span className="text-base font-medium text-green-600">
                            持续编辑
                          </span>
                        </button>
                      </div>
                      </>
                    ) : (
                      /* 普通模式：只显示生成结果 */
                      <>
                      <div className="relative flex-1">
                        <div 
                          className="w-full overflow-hidden bg-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => openImagePreview(currentResult.result, '修改后', 'after')}
                          
                        >
                          {currentResult.resultType === 'image' ? (
                            <img
                              id="result-image"
                              src={currentResult.result}
                              alt="生成的图片"
                              className="w-full h-auto object-contain hover:scale-105 transition-transform duration-200"
                              style={{ maxHeight: `${calculateMaxImageHeight()}px` }}
                              onLoad={() => {
                                // 结果图片加载完成，不强制同步左侧原图高度，保持原始高宽比
                                console.log('结果图片加载完成');
                              }}
                            />
                          ) : (
                            <div className="p-6 min-h-[200px] flex items-center justify-center">
                              <div className="text-gray-700 text-sm whitespace-pre-wrap text-center max-w-full">
                                {currentResult.result}
                              </div>
                            </div>
                          )}
                          <div className="absolute top-2 left-2 bg-blue-500/80 text-white text-xs px-2 py-1 rounded">
                            {currentResult.resultType === 'image' ? '' : 'AI回复'}
                          </div>
                        </div>
                        <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                          生成完成 • {new Date(currentResult.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                      
                      {/* 普通模式的操作按钮 - 与修改前按钮对齐 */}
                      <div className="p-4 flex justify-between items-center">
                        <div className="flex space-x-4">
                          {currentResult.resultType === 'image' && (
                            <a
                              href={currentResult.result}
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
                        
                        {/* 持续编辑开关 - 右对齐 */}
                        <button
                          onClick={handleContinueEditing}
                          className="flex items-center space-x-3 flex-shrink-0"
                          title="点击进入持续编辑模式"
                        >
                          {/* iPhone风格开关 */}
                          <div className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 bg-gray-300">
                            <span className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 translate-x-1" />
                          </div>
                          <span className="text-base font-medium text-gray-700">
                            持续编辑
                          </span>
                        </button>
                      </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex flex-col justify-center items-center p-8">
                    <div className="text-gray-400 mb-4">
                      <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <p className="text-gray-500 text-sm text-center">
                      生成的图片将在这里显示
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
        )}

        {/* 步骤1: 选择图片比例（仅AI创作模式显示） */}
        {selectedMode !== 'edit' && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-blue-700 flex items-center space-x-2 mb-3">
            <span>📐</span>
            <span>选择图片比例</span>
          </h3>
          <div className="grid grid-cols-5 sm:grid-cols-5 gap-1 sm:gap-3 mb-3">
            {aspectRatioOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedAspectRatio(option.id)}
                disabled={isSubmitting || isProcessing}
                className={`
                  relative px-1 py-2 sm:px-3 sm:py-4 rounded border-2 transition-all duration-200 flex items-center justify-center
                  ${selectedAspectRatio === option.id
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }
                  ${isSubmitting || isProcessing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                `}
              >
                {/* 选中指示器 */}
                {selectedAspectRatio === option.id && (
                  <div className="absolute top-1 right-1 sm:top-2 sm:right-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                  </div>
                )}

                {/* 手机端只显示文字，桌面端显示图标+文字 */}
                <div className="flex flex-col sm:flex-row items-center sm:space-x-3 space-y-0 sm:space-y-0 sm:-ml-2">
                  {/* 图标 - 手机端隐藏 */}
                  <div className="hidden sm:block text-2xl sm:text-4xl">{option.icon}</div>

                  {/* 名称和比例 */}
                  <div className="flex flex-col text-center">
                    <div className="text-xs sm:text-sm font-medium text-gray-900 leading-tight">
                      {option.label}
                    </div>
                    <div className="text-xs sm:text-base text-gray-600 leading-tight">
                      {option.description}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
        )}

        {/* 步骤2: 图片展示区域（仅AI创作模式显示） */}
        {selectedMode !== 'edit' && (currentResult || errorResult) && (
        <div className="mb-6 sm:mb-8 animate-in slide-in-from-top-4 duration-500">
          <div className="border-2 border-dashed border-gray-200 rounded-lg overflow-hidden bg-gray-50 flex flex-col">
            {currentResult ? (
            <div className="flex flex-col justify-center items-center p-8 pb-16 relative">
              <div 
                className={`overflow-hidden bg-white rounded cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedMode === 'generate' && 
                  (selectedAspectRatio === '16:9' || selectedAspectRatio === '4:3')
                    ? 'w-full' // 宽图容器占满宽度
                    : 'w-full max-w-md' // 其他比例限制最大宽度
                }`}
                onClick={() => openImagePreview(currentResult.result, '生成结果', 'after')}
                title="点击查看大图"
              >
                <img
                  src={currentResult.result}
                  alt="生成结果"
                  className="w-full h-auto hover:scale-105 transition-transform duration-200"
                />
              </div>
              
              {/* 按钮放在底部，避免与图片重叠 */}
              <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-0 right-2 sm:right-0 flex justify-between items-center px-2 sm:px-8">
                <a
                  href={currentResult.result}
                  download="generated-image.png"
                  className="w-8 h-8 sm:w-10 sm:h-10 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors"
                  title="下载图片"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </a>
                <button
                  onClick={() => {
                    if (currentResult && currentResult.result) {
                      // 将生成的图片转换为File对象
                      const resultFile = dataURLtoFile(currentResult.result, 'generated-image.png');
                      const previewUrl = URL.createObjectURL(resultFile);
                      
                      // 设置为上传的图片
                      setUploadedFiles([resultFile]);
                      setImagePreviews([previewUrl]);
                      setOriginalImageRef(previewUrl); // 设置原始图片引用
                      
                      // 切换到编辑模式
                      if (onModeChange) {
                        onModeChange('edit');
                      }
                      
                      // 清除当前结果
                      if (onClearResult) {
                        onClearResult();
                      }
                      
                      // 清空提示词
                      setPrompt('');
                    }
                  }}
                  className="bg-white border-2 border-purple-500 text-purple-600 hover:bg-purple-50 transition-colors px-2 py-1 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm flex items-center space-x-1 sm:space-x-2"
                >
                  <span>✏️</span>
                  <span className="hidden xs:inline">继续编辑</span>
                  <span className="xs:hidden">编辑</span>
                </button>
              </div>
            </div>
            ) : errorResult ? (
              // 错误结果显示
              <div className="p-6">
                <div className="text-center space-y-4">
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
                  
                  {/* Gemini原始回复 */}
                  {errorResult.originalResponse && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-left">
                      <div className="text-xs text-gray-600 mb-2 font-medium">AI原始回复：</div>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap">
                        {errorResult.originalResponse}
                      </div>
                    </div>
                  )}
                  
                  {/* 时间戳 */}
                  <div className="text-xs text-gray-500">
                    失败时间：{new Date(errorResult.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        )}

        {/* 步骤3: 输入提示词 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-blue-700 flex items-center space-x-1 sm:space-x-2">
              <span>✍️</span>
              <span className="hidden xs:inline">输入提示词</span>
              <span className="xs:hidden whitespace-nowrap">提示词</span>
            </h3>
            {/* 快捷模板按钮 - 仅在智能编辑模式显示 */}
            {selectedMode === 'edit' && (
              <QuickTemplates
                selectedMode={selectedMode}
                onSelectTemplate={(content) => setPrompt(content)}
                onManageTemplates={() => {}}
              />
            )}
          </div>
          <div className="space-y-3">
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={selectedMode === 'edit' ? 
                  "描述您想要对图片进行的编辑，例如：\n• 添加元素：在图片中添加一只小鸟在树枝上\n• 移除元素：移除背景中的建筑物\n• 修改颜色：将蓝色沙发改为棕色皮质沙发" :
                  "详细描述您想要生成的图像，例如：\n一只可爱的橘猫坐在樱花树下，阳光透过花瓣洒下，水彩画风格"
                }
                className="input-field h-24 sm:h-32 resize-none w-full pb-12 ring-2 ring-blue-100 border-blue-200 shadow-sm focus:ring-blue-300 focus:border-blue-400"
                disabled={isSubmitting || isProcessing}
                maxLength={1000}
              />
              
              {/* 按钮组 - 放在textarea内部右下角 */}
              <div className="absolute bottom-3 right-3 flex items-center space-x-1 sm:space-x-2 flex-wrap">
                {/* 显示原始提示词还原按钮 */}
                {originalPrompt && originalPrompt !== prompt && (
                  <button
                    type="button"
                    onClick={() => setPrompt(originalPrompt)}
                    disabled={isSubmitting || isProcessing}
                    className="bg-white/90 hover:bg-white border border-gray-300 text-gray-600 hover:text-gray-800 transition-colors px-2 py-1 sm:px-3 sm:py-1.5 rounded text-xs sm:text-sm flex items-center space-x-1"
                    title="恢复到原始提示词"
                  >
                    <span>↩️</span>
                    <span className="hidden xs:inline">还原</span>
                  </button>
                )}
                
                {/* 清空提示词按钮 */}
                {(prompt || originalPrompt) && (
                  <button
                    type="button"
                    onClick={clearPrompts}
                    disabled={isSubmitting || isProcessing}
                    className="bg-white/90 hover:bg-white border border-gray-300 text-gray-600 hover:text-gray-800 transition-colors px-2 py-1 sm:px-3 sm:py-1.5 rounded text-xs sm:text-sm flex items-center space-x-1"
                    title="清空提示词区域"
                  >
                    <span>🗑️</span>
                    <span className="hidden xs:inline">清空</span>
                  </button>
                )}
                
                {/* AI润色按钮 */}
                <button
                  type="button"
                  onClick={handlePolishPrompt}
                  disabled={!prompt.trim() || isPolishing || isSubmitting || isProcessing}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors px-3 py-1.5 sm:px-4 sm:py-2 rounded text-xs sm:text-sm flex items-center space-x-1 sm:space-x-1.5"
                >
                  {isPolishing ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                      </svg>
                      <span>{isAnalyzing ? '分析中...' : '润色中...'}</span>
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

            {/* 可拖动的智能编辑按钮 - 仅在智能编辑模式显示 */}
            {selectedMode === 'edit' && (
              <DraggableFloatingButton storageKey="edit-button-position">
                <DraggableActionButton
                  onClick={handleSubmit}
                  disabled={
                    isSubmitting || 
                    isProcessing || 
                    !prompt.trim() || 
                    (uploadedFiles.length === 0 && !isContinueEditMode)
                  }
                  className={`transition-all duration-300 flex items-center space-x-2 sm:space-x-3 px-4 sm:px-8 py-2 sm:py-3 text-sm sm:text-base font-semibold ring-2 whitespace-nowrap ${
                    isSubmitting || isProcessing 
                      ? 'bg-gradient-to-r from-blue-500/80 to-purple-500/80 border-blue-400/60 text-white ring-blue-200/60 cursor-wait'
                      : !prompt.trim() || (uploadedFiles.length === 0 && !isContinueEditMode)
                      ? 'bg-white/40 border-gray-300/50 text-gray-500 cursor-not-allowed ring-blue-200/60'
                      : 'bg-white/60 border-blue-400/60 text-blue-600 hover:bg-white/80 hover:border-blue-500/80 hover:text-blue-700 ring-blue-200/60 hover:ring-blue-300/80'
                  }`}
                  style={{
                    textShadow: isSubmitting || isProcessing ? '0 1px 2px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.2)',
                    backdropFilter: 'blur(12px)',
                    boxShadow: isSubmitting || isProcessing 
                      ? '0 8px 32px rgba(59, 130, 246, 0.4), 0 0 20px rgba(147, 51, 234, 0.3)'
                      : !prompt.trim() || (uploadedFiles.length === 0 && !isContinueEditMode)
                      ? '0 4px 16px rgba(0,0,0,0.1)'
                      : '0 8px 32px rgba(59, 130, 246, 0.25)',
                  }}
                  icon={isSubmitting || isProcessing ? (
                    <div className="relative">
                      <span className="text-xl animate-pulse">⚡</span>
                      <div className="absolute inset-0 animate-ping">
                        <span className="text-xl opacity-75">✨</span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xl">🎨</span>
                  )}
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
                      <div className="flex items-center">
                        <span className="animate-pulse">AI正在</span>
                        <span className="ml-1">
                          {selectedMode === 'generate' ? '创作中' : selectedMode === 'edit' ? '编辑中' : '分析中'}
                        </span>
                        <span className="animate-bounce ml-1">...</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="hidden xs:inline">开始智能编辑</span>
                      <span className="xs:hidden">开始编辑</span>
                    </>
                  )}
                </DraggableActionButton>
              </DraggableFloatingButton>
            )}
          </div>
          
          {/* 简化的分析状态显示 - 只在智能编辑模式且正在处理时显示 */}
        </div>

        {/* 智能分析设置 - 移除独立区域，已整合到提示词优化按钮中 */}

        {/* 可拖动的生成图片按钮 - 仅在AI创作模式显示 */}
        {selectedMode !== 'edit' && (
          <DraggableFloatingButton storageKey="generate-button-position">
            <DraggableActionButton
              onClick={handleSubmit}
              disabled={
                isSubmitting || 
                isProcessing || 
                !prompt.trim()
              }
              className={`backdrop-blur-md border-2 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center space-x-2 sm:space-x-3 px-4 sm:px-8 py-2 sm:py-3 text-sm sm:text-base rounded-2xl font-semibold ring-2 whitespace-nowrap ${
                isSubmitting || isProcessing
                  ? 'bg-white/60 border-blue-400/60 text-blue-600 ring-blue-200/60'
                  : !prompt.trim()
                  ? 'bg-white/40 border-gray-300/50 text-gray-500 cursor-not-allowed ring-blue-200/60'
                  : 'bg-white/60 border-blue-400/60 text-blue-600 hover:bg-white/80 hover:border-blue-500/80 hover:text-blue-700 ring-blue-200/60 hover:ring-blue-300/80'
              }`}
              style={{
                textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                backdropFilter: 'blur(12px)',
                boxShadow: isSubmitting || isProcessing || !prompt.trim()
                  ? '0 4px 16px rgba(0,0,0,0.1)'
                  : '0 8px 32px rgba(59, 130, 246, 0.25)',
              }}
              icon={<span className="text-xl">✨</span>}
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
                  <span>处理中...</span>
                </>
              ) : (
                <>
                  <span className="hidden xs:inline">开始生成图片</span>
                  <span className="xs:hidden">生成</span>
                </>
              )}
            </DraggableActionButton>
          </DraggableFloatingButton>
        )}
      </div>

      {/* 新版系统提示词模态框 - 支持分模块配置 */}
      {showSystemPromptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-8">
          <div className="bg-white rounded-lg p-6 max-w-6xl w-full mx-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">自定义 System Prompt</h3>
              <button
                onClick={() => {
                  if (onCloseSystemPromptModal) {
                    onCloseSystemPromptModal();
                  }
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* 标签页切换 */}
            <div className="mb-6">
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                  <button
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      modalActiveMode === 'generate' 
                        ? 'border-blue-500 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                    onClick={() => setModalActiveMode('generate')}
                  >
                    🎨 AI创作模块 (文生图)
                  </button>
                  <button
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      modalActiveMode === 'analysis' 
                        ? 'border-blue-500 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                    onClick={() => setModalActiveMode('analysis')}
                  >
                    🧠 智能分析编辑模块
                  </button>
                  <button
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      modalActiveMode === 'templates' 
                        ? 'border-blue-500 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                    onClick={() => setModalActiveMode('templates')}
                  >
                    📝 提示词模板
                  </button>
                </nav>
              </div>
            </div>

            {/* 当前模块的系统提示词内容 */}
            {modalActiveMode === 'templates' ? (
              <PromptTemplates
                onSelectTemplate={(content) => {
                  setPrompt(content);
                  if (onCloseSystemPromptModal) {
                    onCloseSystemPromptModal();
                  }
                }}
                filterCategory={selectedMode === 'edit' ? 'edit' : 'generate'}
              />
            ) : (
            <div className="mb-4">
              <div className="mb-3">
                <h4 className="text-md font-medium text-gray-700 mb-2">
                  {modalActiveMode === 'edit' ? '图片编辑系统提示词' : 
                   modalActiveMode === 'analysis' ? '智能分析编辑系统提示词' :
                   '文生图系统提示词'}
                </h4>
                <p className="text-sm text-gray-600 mb-3">
                  {modalActiveMode === 'edit' 
                    ? '用于指导AI如何优化图片编辑指令，确保保持原图特征的同时进行精确编辑。'
                    : modalActiveMode === 'analysis'
                    ? '用于指导AI直接分析图片内容并生成针对gemini-2.5-flash-image-preview的优化编辑指令。'
                    : '用于指导AI如何优化文生图提示词，将简单描述转化为专业的视觉叙事描述。'
                  }
                </p>
              </div>
              
              <textarea
                value={modalActiveMode === 'edit' ? customEditingPrompt : 
                       modalActiveMode === 'analysis' ? customAnalysisPrompt :
                       customGenerationPrompt}
                onChange={(e) => {
                  if (modalActiveMode === 'edit') {
                    setCustomEditingPrompt(e.target.value);
                  } else if (modalActiveMode === 'analysis') {
                    setCustomAnalysisPrompt(e.target.value);
                  } else {
                    setCustomGenerationPrompt(e.target.value);
                  }
                }}
                placeholder={`输入${modalActiveMode === 'edit' ? '图片编辑' : 
                             modalActiveMode === 'analysis' ? '智能分析编辑' :
                             '文生图'}系统提示词...`}
                className="w-full h-96 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
              />
              
              <div className="mt-2 text-xs text-gray-500">
                字符数：{modalActiveMode === 'edit' ? customEditingPrompt.length : 
                        modalActiveMode === 'analysis' ? customAnalysisPrompt.length :
                        customGenerationPrompt.length}
              </div>
            </div>
            )}
            
            {/* 操作按钮 */}
            <div className="flex justify-between items-center">
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    if (modalActiveMode === 'edit') {
                      // 重置图片编辑系统提示词
                      const defaultEditingPrompt = `你是一位专业的AI图片编辑提示词优化专家，擅长为Gemini 2.5 Flash Image Preview生成精确的图片编辑指令。

请基于图片编辑最佳实践，优化用户的编辑指令，使其更加精确和专业。

## 优化重点
1. **明确编辑指令**：清晰指定要添加/删除/修改的具体元素
2. **保持一致性**：强调保留原图的重要特征和风格
3. **局部编辑**：专注于指定区域的修改，避免影响其他部分
4. **自然融合**：确保新增或修改的元素与原图环境协调
5. **技术精度**：使用专业的编辑术语和指导

请优化编辑指令，使其更加专业和精确。只返回优化后的提示词，用中文输出。`;
                      setCustomEditingPrompt(defaultEditingPrompt);
                    } else if (modalActiveMode === 'analysis') {
                      // 重置智能分析编辑系统提示词
                      const defaultAnalysisPrompt = `Role and Goal:
You are an expert prompt engineer. Your task is to analyze user-provided image(s) and a corresponding editing instruction. Based on this analysis, you will generate a new, detailed, and optimized prompt for the 'gemini-2.5-flash-image-preview' model. Your output MUST be ONLY the generated prompt text, with no additional explanations.

Core Instructions:

**1. For Single Image Editing:**
- Frame the task as a direct edit on the provided image.
- Start with phrases like "Using the provided image..." or "On the provided image...".
- Example for changing a part: "Using the provided image of the living room, change ONLY the blue sofa to be a vintage, brown leather chesterfield sofa. Keep the rest of the room, including the pillows and lighting, unchanged."

**2. For Multi-Image Editing (IMPORTANT):**
- First, identify the **main/target image** (the one being edited) and the **source/reference image** (the one providing the element/style).
- **NEVER** start the prompt with "Create a new composite image" unless the goal is to merge two scenes into a completely new one (e.g., putting a cat on a beach).
- **For Replacement/Swapping (like the user's case):** Frame the task as an **in-place edit** on the target image.
  - **Correct Example Structure:** "Using the second image (the woman), replace the existing clothes with the [detailed description of clothes] from the first image. The new clothing must be realistically adapted to her body, perfectly matching her posture and body contours. It is crucial to preserve the entire background, the woman's face, hair, and body from the second image. The lighting and shadows on the new clothes must seamlessly integrate with the lighting conditions of the second image."

General Requirements:
- Be specific and descriptive. Analyze the image(s) to add details about lighting, texture, and perspective to make the edit blend naturally.
- When modifying parts, explicitly state what should be kept unchanged to ensure high-fidelity edits. This is critical.
- Always respond in Chinese (中文) to match the user interface language.`;
                      setCustomAnalysisPrompt(defaultAnalysisPrompt);
                    } else {
                      // 重置文生图系统提示词
                      const defaultGenerationPrompt = `你是一位专业的AI图像生成提示词优化专家，专门为Gemini 2.5 Flash Image Preview优化文生图提示词。

## 核心原则
**描述场景，而不是罗列关键词**。模型的核心优势是深度语言理解，叙述性的描述段落几乎总能产生比零散关键词更好、更连贯的图像。

## 优化模板结构
"一个[风格] [拍摄类型] 展现[主体]，[动作/表情]，置身于[环境]中。场景由[光照描述]照明，营造出[情绪]氛围。使用[相机/镜头细节]拍摄，强调[关键纹理和细节]。图像应为[宽高比]格式。"

## 优化要求
1. 将任何关键词列表转换为连贯的叙事描述
2. 保持用户原始意图的同时增加上下文丰富性
3. 使用专业摄影和艺术术语
4. 应用宽高比特定的构图指导
5. 通过光照和情绪描述创造大气深度  
6. 包含技术相机规格以获得逼真效果
7. 强调纹理、细节和视觉叙事元素
8. 用中文输出优化后的提示词

请将输入转化为专业的、叙事驱动的提示词，遵循Gemini最佳实践。专注于场景描述和视觉叙事。只返回优化后的提示词，不要解释。`;
                      setCustomGenerationPrompt(defaultGenerationPrompt);
                    }
                  }}
                  className="btn-secondary text-sm"
                >
                  重置为默认
                </button>
                
                <button
                  onClick={() => {
                    const content = modalActiveMode === 'edit' ? customEditingPrompt : 
                                   modalActiveMode === 'analysis' ? customAnalysisPrompt :
                                   customGenerationPrompt;
                    navigator.clipboard.writeText(content).then(() => {
                      alert('系统提示词已复制到剪贴板');
                    }).catch(() => {
                      alert('复制失败，请手动选择文本复制');
                    });
                  }}
                  className="btn-secondary text-sm"
                >
                  复制内容
                </button>
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    if (onCloseSystemPromptModal) {
                      onCloseSystemPromptModal();
                    }
                  }}
                  className="btn-secondary"
                >
                  取消
                </button>
                <button
                  onClick={() => setShowSavePasswordModal(true)}
                  className="btn-primary"
                >
                  保存设置
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
              
              {/* 提示信息 */}
              <div className="absolute bottom-4 left-4 bg-black/50 text-white text-sm px-3 py-1 rounded">
                {imagePreviews.length > 0 && currentResult ? '使用左右箭头切换对比 • ' : ''}按 ESC 或点击背景关闭预览
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 保存时的密码验证模态框 */}
      {showSavePasswordModal && (
        <PasswordModal
          title="保存系统提示词"
          description="请输入管理密码以保存修改"
          onSuccess={async (password) => {
            setShowSavePasswordModal(false);
            try {
              const prompts = {
                generation: customGenerationPrompt,
                editing: customEditingPrompt,
                analysis: customAnalysisPrompt
              };

              const response = await fetch('/api/auth/system-prompts', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password, prompts }),
              });

              if (response.ok) {
                alert('系统提示词已保存！');
                if (onCloseSystemPromptModal) {
                  onCloseSystemPromptModal();
                }
              } else {
                alert('保存失败：密码错误或网络问题');
              }
            } catch (error) {
              alert('保存失败：' + error.message);
            }
          }}
          onCancel={() => setShowSavePasswordModal(false)}
        />
      )}
    </div>
  );
};
