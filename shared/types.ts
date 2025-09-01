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
  aspectRatio?: string;
  style?: string;
  quality?: 'draft' | 'standard' | 'high';
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
  currentSettings: ImageGenerationParams;
  queuedTasks: GenerationTask[];
  createdAt: number;
  lastAccessed: number;
}

export interface WebSocketMessage {
  type: 'task_update' | 'session_restored' | 'error';
  data: any;
  sessionId: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}