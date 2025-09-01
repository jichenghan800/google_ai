import React, { createContext, useContext, ReactNode } from 'react';
import { SessionData, GenerationTask, ImageGenerationParams } from '../types/index.ts';
import { useSessionPersistence } from '../hooks/useSessionPersistence.ts';

interface SessionContextType {
  sessionData: SessionData | null;
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;
  updateSettings: (settings: Partial<ImageGenerationParams>) => Promise<void>;
  addToHistory: (image: any) => void;
  updateQueuedTasks: (tasks: GenerationTask[]) => void;
  cleanup: () => Promise<void>;
  initializeSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

interface SessionProviderProps {
  children: ReactNode;
}

export const SessionProvider: React.FC<SessionProviderProps> = ({ children }) => {
  const sessionPersistence = useSessionPersistence();

  return (
    <SessionContext.Provider value={sessionPersistence}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = (): SessionContextType => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};