export interface GeneratedImage {
  id: string;
  prompt: string;
  imageUrl: string;
  parameters: ImageGenerationParams;
  createdAt: number;
  status: 'completed' | 'failed';
}

export interface ImageGenerationParams {
  width?: number;
  height?: number;
  aspectRatio?: AspectRatio;
  style?: string;
  quality?: 'draft' | 'standard' | 'high';
}

// 宽高比相关类型
export type AspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

export interface AspectRatioOption {
  id: AspectRatio;
  label: string;
  description: string;
  width: number;
  height: number;
  icon: string;
  useCase: string;
}


export interface GenerationTask {
  taskId: string;
  sessionId: string;
  prompt: string;
  parameters: ImageGenerationParams;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: GeneratedImage;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionData {
  sessionId: string;
  generationHistory: GeneratedImage[];
  editHistory: ImageEditResult[]; // 新增编辑历史
  currentSettings: ImageGenerationParams;
  queuedTasks: GenerationTask[];
  createdAt: number;
  lastAccessed: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface QueueStatus {
  queueLength: number;
  processing: number;
  isProcessing: boolean;
}

// 新增图片分析相关类型
export interface ImageAnalysisResult {
  id: string;
  sessionId: string;
  analysis: string;
  prompt: string;
  imageInfo: {
    originalName: string;
    mimeType: string;
    size: number;
  };
  imagePreview?: string; // 前端添加的预览URL
  createdAt: number;
  metadata?: {
    model: string;
    timestamp: string;
    imageSize: number;
    mimeType: string;
  };
}

export interface BatchAnalysisResult {
  results: Array<{
    index: number;
    success: boolean;
    analysis?: string;
    error?: string;
    imageInfo: {
      originalName: string;
      mimeType: string;
      size: number;
    };
    metadata?: any;
  }>;
  totalImages: number;
  successCount: number;
  failureCount: number;
}

// 新增图片编辑相关类型
export interface ImageEditResult {
  id: string;
  sessionId: string;
  prompt: string;
  inputImages: {
    originalName: string;
    mimeType: string;
    size: number;
    dataUrl?: string; // 图片的 base64 数据URL，用于显示原图
  }[];
  result: string; // 文本结果或图片的 data URL
  resultType: 'text' | 'image';
  createdAt: number;
  metadata?: {
    prompt: string;
    inputImageCount: number;
    model: string;
    timestamp: string;
    hasText: boolean;
    hasImage: boolean;
  };
}