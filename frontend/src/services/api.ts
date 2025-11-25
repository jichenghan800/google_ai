import axios from 'axios';
import { SessionData, GenerationTask, ApiResponse, ImageGenerationParams } from '../types/index.ts';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error);
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
  
  // Accept either discrete args or a full payload including bilingual fields
  addTemplate: async (
    nameOrPayload: string | { name: string; content: string; category: 'generate' | 'edit'; nameZh?: string; nameEn?: string; contentZh?: string; contentEn?: string; emoji?: string },
    content?: string,
    category?: 'generate' | 'edit'
  ): Promise<ApiResponse<any>> => {
    const payload = typeof nameOrPayload === 'string'
      ? { name: nameOrPayload, content: content || '', category: category || 'edit' }
      : nameOrPayload;
    return apiClient.post('/templates', payload);
  },
  
  updateTemplate: async (
    id: string,
    nameOrPayload: string | { name?: string; content?: string; nameZh?: string; nameEn?: string; contentZh?: string; contentEn?: string; emoji?: string },
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
  
  reorderTemplates: async (ids: string[], category: 'generate' | 'edit'): Promise<ApiResponse<any[]>> => {
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

export default apiClient;
