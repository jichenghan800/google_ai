import axios from 'axios';
import { SessionData, GenerationTask, ApiResponse, ImageGenerationParams, AuthUser, AdminImageSummary, AdminImageRecord } from '../types/index.ts';

type TemplateCategory = 'generate' | 'edit' | 'generate-pro' | 'edit-pro' | string;

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || '';
    // 静默处理模板默认图的 404，不打印红色错误（前端调用会自己兜底）
    const isDefaultImage404 = status === 404 && url.includes('/default-image');
    if (!isDefaultImage404) {
      console.error('API Error:', error);
    }
    if (error.response) {
      throw error.response.data;
    } else if (error.request) {
      throw { success: false, error: 'Network error', message: 'Unable to connect to server' };
    } else {
      throw { success: false, error: 'Unknown error', message: error.message };
    }
  }
);

export const sessionAPI = {
  createSession: async (): Promise<ApiResponse<SessionData>> => {
    return apiClient.post('/sessions/create');
  },

  getSession: async (sessionId: string): Promise<ApiResponse<SessionData>> => {
    return apiClient.get(`/sessions/${sessionId}`);
  },

  updateSettings: async (
    sessionId: string, 
    settings: Partial<ImageGenerationParams>
  ): Promise<ApiResponse<SessionData>> => {
    return apiClient.put(`/sessions/${sessionId}/settings`, settings);
  },

  deleteSession: async (sessionId: string): Promise<ApiResponse> => {
    return apiClient.delete(`/sessions/${sessionId}`);
  },
};

export const generateAPI = {
  generateImage: async (
    sessionId: string, 
    prompt: string, 
    parameters?: ImageGenerationParams
  ): Promise<ApiResponse<GenerationTask>> => {
    return apiClient.post('/generate/image', {
      sessionId,
      prompt,
      parameters,
    });
  },

  getHistory: async (
    sessionId: string, 
    limit = 20, 
    offset = 0
  ): Promise<ApiResponse> => {
    return apiClient.get(`/generate/history/${sessionId}`, {
      params: { limit, offset }
    });
  },

  getQueueStatus: async (sessionId: string): Promise<ApiResponse> => {
    return apiClient.get(`/generate/queue/${sessionId}`);
  },

  cancelTask: async (taskId: string, sessionId: string): Promise<ApiResponse> => {
    return apiClient.delete(`/generate/task/${taskId}`, {
      params: { sessionId }
    });
  },
};

export const templateAPI = {
  getTemplates: async (category?: string): Promise<ApiResponse<any[]>> => {
    const params = category ? `?category=${category}` : '';
    return apiClient.get(`/templates${params}`);
  },
  setDefaultImage: async (id: string, payload: { ratio?: string; resolution?: string; imageUrl?: string; dataUrl?: string; allowOverride?: boolean }): Promise<ApiResponse<any>> => {
    return apiClient.post(`/templates/${id}/default-image`, payload);
  },
  getDefaultImage: async (id: string, params: { ratio?: string; resolution?: string }): Promise<ApiResponse<{ url: string }>> => {
    return apiClient.get(`/templates/${id}/default-image`, { params });
  },
  deleteDefaultImage: async (id: string, params: { ratio?: string; resolution?: string }): Promise<ApiResponse<any>> => {
    return apiClient.delete(`/templates/${id}/default-image`, { params });
  },
  
  // Accept either discrete args or a full payload including bilingual fields
  addTemplate: async (
    nameOrPayload: string | { name: string; content: string; category: TemplateCategory; nameZh?: string; nameEn?: string; contentZh?: string; contentEn?: string; emoji?: string; type?: string; ratio?: string; resolution?: string },
    content?: string,
    category?: TemplateCategory
  ): Promise<ApiResponse<any>> => {
    const payload = typeof nameOrPayload === 'string'
      ? { name: nameOrPayload, content: content || '', category: category || 'edit' }
      : nameOrPayload;
    return apiClient.post('/templates', payload);
  },
  
  updateTemplate: async (
    id: string,
    nameOrPayload: string | { name?: string; content?: string; nameZh?: string; nameEn?: string; contentZh?: string; contentEn?: string; emoji?: string; type?: string; ratio?: string; resolution?: string },
    content?: string
  ): Promise<ApiResponse<any>> => {
    const payload = typeof nameOrPayload === 'string'
      ? { name: nameOrPayload, content: content || '' }
      : nameOrPayload;
    return apiClient.put(`/templates/${id}`, payload);
  },
  
  deleteTemplate: async (id: string): Promise<ApiResponse> => {
    return apiClient.delete(`/templates/${id}`);
  },
  
  reorderTemplates: async (ids: string[], category: TemplateCategory): Promise<ApiResponse<any[]>> => {
    return apiClient.put('/templates/reorder', { ids, category });
  },
};

export const systemPromptAPI = {
  getDefaults: async (): Promise<ApiResponse<any>> => {
    return apiClient.get('/system-prompts/defaults');
  },
};

export const recognitionAPI = {
  getSettings: async (): Promise<ApiResponse<{ customRecognitionPrompt: string; recognitionScenarios: Array<{ name: string; content: string }> }>> => {
    return apiClient.get('/recognition/settings');
  },
  updateSettings: async (
    payload: { customRecognitionPrompt: string; recognitionScenarios: Array<{ name: string; content: string } | string> }
  ): Promise<ApiResponse<{ customRecognitionPrompt: string; recognitionScenarios: Array<{ name: string; content: string }> }>> => {
    return apiClient.put('/recognition/settings', payload);
  }
};

export const uiAPI = {
  getSettings: async (): Promise<ApiResponse<{ systemPromptTabsOrder: string[]; generationTemplateFillerSystemPrompt?: string }>> => {
    return apiClient.get('/ui/settings');
  },
  updateSettings: async (settings: { systemPromptTabsOrder: string[]; generationTemplateFillerSystemPrompt?: string }): Promise<ApiResponse<{ systemPromptTabsOrder: string[]; generationTemplateFillerSystemPrompt?: string }>> => {
    return apiClient.put('/ui/settings', settings);
  }
};

// System prompts (persisted cross-browsers)
export const systemPromptsAPI = {
  get: async (): Promise<ApiResponse<{ generation?: string; editing?: string; analysis?: string }>> => {
    // backend returns { success, data } via axios interceptor -> .data
    return apiClient.get('/auth/system-prompts');
  },
  save: async (password: string, prompts: { generation?: string; editing?: string; analysis?: string }): Promise<ApiResponse> => {
    return apiClient.post('/auth/system-prompts', { password, prompts });
  }
};

export const authAPI = {
  getConfig: async (): Promise<ApiResponse<{ emailAuthEnabled: boolean; allowedEmailSuffixes: string[] }>> => {
    return apiClient.get('/auth/config');
  },
  requestLink: async (email: string, redirectUrl?: string): Promise<ApiResponse<{ sent: boolean; expiresAt: string; previewLink?: string }>> => {
    return apiClient.post('/auth/request-link', { email, redirectUrl });
  },
  callback: async (token: string): Promise<ApiResponse<{ token: string; user: AuthUser }>> => {
    return apiClient.post('/auth/callback', { token });
  },
  me: async (): Promise<ApiResponse<{ emailAuthEnabled: boolean; user: AuthUser }>> => {
    return apiClient.get('/auth/me');
  },
  logout: async (): Promise<ApiResponse> => {
    return apiClient.post('/auth/logout');
  }
};

export const adminAPI = {
  getSummary: async (): Promise<ApiResponse<AdminImageSummary>> => {
    return apiClient.get('/admin/image-summary');
  },
  getImageStats: async (params: {
    userEmail?: string;
    kind?: string;
    resolution?: string;
    aspectRatio?: string;
    start?: string;
    end?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<{ items: AdminImageRecord[]; total: number; limit: number; offset: number }>> => {
    return apiClient.get('/admin/image-stats', { params });
  },
  updateUserTier: async (userId: string, tier: string): Promise<ApiResponse<AuthUser>> => {
    return apiClient.post(`/admin/users/${userId}/tier`, { tier });
  },
  getUsers: async (params: { email?: string; limit?: number; offset?: number }): Promise<ApiResponse<{ items: import('../types').AdminUserWithStats[]; total: number; limit: number; offset: number }>> => {
    return apiClient.get('/admin/users', { params });
  },
  updateUserAccess: async (userId: string, payload: { role?: string; tier?: string }): Promise<ApiResponse<AuthUser>> => {
    return apiClient.post(`/admin/users/${userId}/access`, payload);
  }
};

export default apiClient;
