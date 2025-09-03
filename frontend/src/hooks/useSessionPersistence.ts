import { useState, useEffect, useCallback } from 'react';
import { SessionData, GenerationTask, ImageGenerationParams } from '../types/index.ts';
import { SessionStorage } from '../utils/sessionStorage.ts';
import { sessionAPI } from '../services/api.ts';
import webSocketService from '../services/websocket.ts';

interface UseSessionPersistenceReturn {
  sessionData: SessionData | null;
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;
  initializeSession: () => Promise<void>;
  updateSettings: (settings: Partial<ImageGenerationParams>) => Promise<void>;
  addToHistory: (image: any) => void;
  updateQueuedTasks: (tasks: GenerationTask[]) => void;
  cleanup: () => Promise<void>;
}

export const useSessionPersistence = (): UseSessionPersistenceReturn => {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const saveToSessionStorage = useCallback((data: SessionData) => {
    SessionStorage.setSessionData(data);
  }, []);

  const initializeSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check if sessionStorage is supported
      if (!SessionStorage.isSupported()) {
        throw new Error('会话存储不受支持，数据将无法保存');
      }

      // Try to get existing session ID
      let currentSessionId = SessionStorage.getSessionId();

      if (currentSessionId) {
        try {
          // Try to restore existing session
          console.log('Attempting to restore session:', currentSessionId);
          const response = await sessionAPI.getSession(currentSessionId);
          
          if (response.success && response.data) {
            setSessionData(response.data);
            setSessionId(currentSessionId);
            SessionStorage.setSessionData(response.data); // 直接调用，不依赖callback
            
            // Connect to WebSocket
            await webSocketService.connect(currentSessionId);
            
            console.log('Session restored successfully');
            return;
          }
        } catch (restoreError) {
          console.warn('Failed to restore session, creating new one:', restoreError);
          SessionStorage.clearAll();
        }
      }

      // Create new session
      console.log('Creating new session');
      const response = await sessionAPI.createSession();
      
      if (response.success && response.data) {
        const newSessionId = response.data.sessionId;
        
        setSessionData(response.data);
        setSessionId(newSessionId);
        SessionStorage.setSessionId(newSessionId);
        SessionStorage.setSessionData(response.data); // 直接调用，不依赖callback
        
        // Connect to WebSocket
        await webSocketService.connect(newSessionId);
        
        console.log('New session created:', newSessionId);
      } else {
        throw new Error(response.error || '创建会话失败');
      }

    } catch (error: any) {
      console.error('Failed to initialize session:', error);
      setError(error.message || '会话初始化失败');
    } finally {
      setIsLoading(false);
    }
  }, []); // 移除saveToSessionStorage依赖

  const updateSettings = useCallback(async (settings: Partial<ImageGenerationParams>) => {
    if (!sessionId || !sessionData) {
      throw new Error('No active session');
    }

    try {
      const response = await sessionAPI.updateSettings(sessionId, settings);
      
      if (response.success && response.data) {
        setSessionData(response.data);
        saveToSessionStorage(response.data);
      } else {
        throw new Error(response.error || '更新设置失败');
      }
    } catch (error: any) {
      console.error('Failed to update settings:', error);
      throw error;
    }
  }, [sessionId, sessionData, saveToSessionStorage]);

  const addToHistory = useCallback((image: any) => {
    console.log('📝 addToHistory called with image:', image);
    
    setSessionData(currentData => {
      if (!currentData) {
        console.log('❌ No current session data, cannot add to history');
        return currentData;
      }

      console.log('📚 Current history length:', currentData.generationHistory.length);
      
      const updatedData = {
        ...currentData,
        generationHistory: [image, ...currentData.generationHistory],
        lastAccessed: Date.now()
      };

      console.log('📚 Updated history length:', updatedData.generationHistory.length);
      console.log('💾 Saving updated data to session storage...');
      
      // Save to session storage
      SessionStorage.setSessionData(updatedData);
      
      return updatedData;
    });
  }, []); // Remove sessionData dependency to avoid stale closure

  const updateQueuedTasks = useCallback((tasks: GenerationTask[]) => {
    setSessionData(currentData => {
      if (!currentData) return currentData;

      const updatedData = {
        ...currentData,
        queuedTasks: tasks,
        lastAccessed: Date.now()
      };

      SessionStorage.setSessionData(updatedData);
      return updatedData;
    });
  }, []);

  const cleanup = useCallback(async () => {
    if (sessionId) {
      try {
        // Disconnect WebSocket
        webSocketService.disconnect();
        
        // Delete session from server
        await sessionAPI.deleteSession(sessionId);
        
        // Clear local storage
        SessionStorage.clearAll();
        
        setSessionData(null);
        setSessionId(null);
        
        console.log('Session cleaned up successfully');
      } catch (error) {
        console.error('Failed to cleanup session:', error);
      }
    }
  }, [sessionId]);

  // Setup beforeunload event to cleanup session when tab/window is closed
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Note: cleanup() is async, but beforeunload handlers must be synchronous
      // We'll handle cleanup without waiting for it to complete
      if (sessionId) {
        webSocketService.disconnect();
        
        // Try to delete session (fire and forget)
        sessionAPI.deleteSession(sessionId).catch(console.error);
        
        // Clear local storage immediately
        SessionStorage.clearAll();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sessionId]);

  // Initialize session on component mount
  useEffect(() => {
    initializeSession();
  }, []); // 移除依赖，只在组件挂载时初始化一次

  return {
    sessionData,
    sessionId,
    isLoading,
    error,
    initializeSession,
    updateSettings,
    addToHistory,
    updateQueuedTasks,
    cleanup,
  };
};