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
  imageSize?: string;
  style?: string;
  quality?: 'draft' | 'standard' | 'high';
}

// 宽高比相关类型
export type AspectRatio =
  | '1:1'
  | '3:2'
  | '2:3'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9';

export interface AspectRatioOption {
  id: AspectRatio;
  label: string;
  labelZh?: string;
  labelEn?: string;
  description: string;
  icon?: string;
  useCase: string;
}

export interface ResolutionOption {
  id: string;
  label: string;
  labelZh?: string;
  labelEn?: string;
  description: string;
  longEdge: number;
}

export type UserRole = 'user' | 'admin';
export type UserTier = 'user' | 'vip' | 'svip' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  role?: UserRole;
  tier?: UserTier;
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
  mode?: 'generate' | 'edit' | 'analyze';
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

// Admin analytics
export interface AdminImageRecord {
  id: string;
  kind: 'generate' | 'edit' | string;
  prompt: string;
  model?: string | null;
  s3_url?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  display_name?: string | null;
  user_role?: UserRole;
  user_tier?: UserTier;
  created_at: string;
  resolution?: string | null;
  aspect_ratio?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface AdminImageSummary {
  byKind: Array<{ kind: string | null; count: string }>;
  byResolution: Array<{ resolution: string | null; count: string }>;
  byAspectRatio: Array<{ aspect_ratio: string | null; count: string }>;
  latest: AdminImageRecord[];
}

export interface AdminUserWithStats {
  id: string;
  email: string;
  displayName?: string | null;
  role: UserRole;
  tier: UserTier;
  totalImages: number;
  generateCount: number;
  editCount: number;
  lastCreatedAt?: string | null;
}
