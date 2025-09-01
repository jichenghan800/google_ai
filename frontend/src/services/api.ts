import axios from 'axios';
import { SessionData, GenerationTask, ApiResponse, ImageGenerationParams } from '../types/index.ts';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

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

export default apiClient;