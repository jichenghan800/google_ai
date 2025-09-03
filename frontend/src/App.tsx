import React, { useState, useEffect, useCallback } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { SessionProvider } from './contexts/SessionContext.tsx';
import { useSession } from './contexts/SessionContext.tsx';
import { ModeSelector, AIMode } from './components/ModeSelector.tsx';
import { UnifiedWorkflow } from './components/UnifiedWorkflow.tsx';
import { WorkflowResult } from './components/WorkflowResult.tsx';
import { WorkflowHistory } from './components/WorkflowHistory.tsx';
import { LoadingSpinner } from './components/LoadingSpinner.tsx';
import { ErrorMessage } from './components/ErrorMessage.tsx';
import { ImageEditResult } from './types/index.ts';
import webSocketService from './services/websocket.ts';

const AppContent: React.FC = () => {
  const { sessionData, sessionId, isLoading, error, initializeSession } = useSession();
  const [currentResult, setCurrentResult] = useState<ImageEditResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMode, setSelectedMode] = useState<AIMode>('generate');
  const [showSystemPromptModal, setShowSystemPromptModal] = useState(false);

  // WebSocket 连接管理
  useEffect(() => {
    if (sessionId && webSocketService.isConnected()) {
      console.log('WebSocket connected for session:', sessionId);
    }
  }, [sessionId]);

  const handleProcessComplete = useCallback((result: ImageEditResult) => {
    setCurrentResult(result);
    setIsProcessing(false);
    toast.success('处理完成！');
    
    // 滚动到结果区域
    setTimeout(() => {
      const resultElement = document.querySelector('[data-scroll-to="result"]');
      if (resultElement) {
        resultElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, []);

  const handleNewTask = useCallback(() => {
    setCurrentResult(null);
    setIsProcessing(false);
    
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleClearResult = useCallback(() => {
    setCurrentResult(null);
  }, []);

  const handleModeChange = useCallback((mode: AIMode) => {
    setSelectedMode(mode);
    setCurrentResult(null);
    setIsProcessing(false);
    
    // 滚动到工作区
    setTimeout(() => {
      const workflowElement = document.querySelector('[data-scroll-to="workflow"]');
      if (workflowElement) {
        workflowElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, []);

  const handleProcessStart = useCallback(() => {
    setIsProcessing(true);
    setCurrentResult(null);
    
    // 滚动到处理区域
    setTimeout(() => {
      const processingElement = document.querySelector('[data-scroll-to="processing"]');
      if (processingElement) {
        processingElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner message="初始化会话中..." size="large" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full">
          <ErrorMessage
            title="会话初始化失败"
            message={error}
            onRetry={initializeSession}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* 连接状态指示器 */}
        <div className="fixed top-4 right-4 z-40">
          <div className={`flex items-center space-x-2 px-3 py-2 rounded-full text-sm shadow-lg ${
            webSocketService.isConnected() 
              ? 'bg-green-100 text-green-700 border border-green-200' 
              : 'bg-red-100 text-red-700 border border-red-200'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              webSocketService.isConnected() ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span>{webSocketService.isConnected() ? '已连接' : '连接断开'}</span>
          </div>
        </div>


        {/* 模式选择器 */}
        <ModeSelector
          selectedMode={selectedMode}
          onModeChange={handleModeChange}
          onSystemPromptClick={() => setShowSystemPromptModal(true)}
          isProcessing={isProcessing}
        />

        {/* 主工作流 */}
        <div className="space-y-8" data-scroll-to="workflow">
          {/* 统一输入界面 */}
          <UnifiedWorkflow
            onProcessComplete={handleProcessComplete}
            sessionId={sessionId}
            isProcessing={isProcessing}
            selectedMode={selectedMode}
            currentResult={currentResult}
            onClearResult={handleClearResult}
            showSystemPromptModal={showSystemPromptModal}
            onCloseSystemPromptModal={() => setShowSystemPromptModal(false)}
          />

          {/* 处理中状态 - 这个区域会在 UnifiedWorkflow 中显示 */}
          {isProcessing && (
            <div data-scroll-to="processing"></div>
          )}

          {/* 历史记录 */}
          {sessionData && sessionData.editHistory && sessionData.editHistory.length > 0 && (
            <WorkflowHistory
              editHistory={sessionData.editHistory}
            />
          )}
        </div>

        {/* 页脚 */}
        <div className="text-center mt-16 pt-8 border-t border-gray-200">
          <p className="text-gray-500 text-sm">
            基于 Google Vertex AI Gemini 2.5 Flash Image Preview 构建
          </p>
          <p className="text-gray-400 text-xs mt-1">
            支持图片生成、图片分析、图片编辑的全能 AI 助手
          </p>
        </div>
      </div>
      
      {/* Toast 通知 */}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
        }}
      />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  );
};

export default App;