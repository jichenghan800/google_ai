import React, { useState, useEffect, useCallback } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { SessionProvider } from './contexts/SessionContext.tsx';
import { useSession } from './contexts/SessionContext.tsx';
import { AIMode } from './components/ModeToggle.tsx';
import { IntegratedWorkflow } from './components/IntegratedWorkflow.tsx';
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
  const [footerClickCount, setFooterClickCount] = useState(0);

  const handleFooterClick = useCallback(() => {
    const newCount = footerClickCount + 1;
    setFooterClickCount(newCount);
    
    if (newCount >= 5) {
      setShowSystemPromptModal(true);
      setFooterClickCount(0);
    }
    
    // 3秒后重置计数
    setTimeout(() => {
      setFooterClickCount(0);
    }, 3000);
  }, [footerClickCount]);

  const handleProcessComplete = useCallback((result: ImageEditResult) => {
    setCurrentResult(result);
    setIsProcessing(false);
    toast.dismiss('processing'); // 关闭加载 toast
    toast.success('处理完成！');
    
    // 滚动到结果区域
    setTimeout(() => {
      const resultElement = document.querySelector('[data-scroll-to="result"]');
      if (resultElement) {
        resultElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, []);

  const handleProcessStart = useCallback(() => {
    setIsProcessing(true);
    toast.loading('正在处理中...', { id: 'processing' });
  }, []);

  const handleProcessError = useCallback((error: string) => {
    setIsProcessing(false);
    toast.dismiss('processing'); // 关闭加载 toast
    toast.error(`处理失败: ${error}`);
  }, []);

  // WebSocket 连接管理
  useEffect(() => {
    if (sessionId && webSocketService.isConnected()) {
      console.log('WebSocket connected for session:', sessionId);
      
      // 监听任务完成事件
      const handleTaskCompleted = (task: any) => {
        console.log('🎉 Task completed received:', task);
        if (task.result) {
          console.log('📸 Processing task result:', task.result);
          handleProcessComplete({
            result: task.result,
            taskId: task.taskId,
            timestamp: task.timestamp || Date.now()
          });
        } else {
          console.warn('⚠️ Task completed but no result found:', task);
        }
      };
      
      webSocketService.onTaskCompleted(handleTaskCompleted);
      
      // 清理监听器
      return () => {
        webSocketService.off('task_completed', handleTaskCompleted);
      };
    }
  }, [sessionId, handleProcessComplete]);

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
    <div className="min-h-screen bg-gray-50 4k:min-h-[1000px]">
      <div className="container-responsive py-2 sm:py-3 xl:py-6">
        {/* 连接状态指示器 */}
        <div className="fixed top-2 right-2 sm:top-4 sm:right-4 z-40">
          <div className={`flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-1 sm:py-2 rounded-full text-xs sm:text-sm shadow-lg ${
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


        {/* 主工作流 */}
        <div className="space-y-3 xl:space-y-4" data-scroll-to="workflow">
          {/* 整合的工作流界面 */}
          <IntegratedWorkflow
            onProcessComplete={handleProcessComplete}
            onProcessStart={handleProcessStart}
            onProcessError={handleProcessError}
            sessionId={sessionId}
            isProcessing={isProcessing}
            selectedMode={selectedMode}
            currentResult={currentResult}
            onClearResult={handleClearResult}
            onModeChange={handleModeChange}
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
        <div className="text-center mt-1 sm:mt-2 xl:mt-4 pt-2 sm:pt-3 border-t border-gray-200 mb-4">
          <p 
            className={`text-gray-500 text-xs sm:text-sm cursor-pointer select-none transition-all duration-200 ${
              footerClickCount > 0 ? 'text-blue-600 scale-105' : 'hover:text-gray-700'
            }`}
            onClick={handleFooterClick}
            title={footerClickCount > 0 ? `${footerClickCount}/5 clicks` : undefined}
          >
            基于 Google Vertex AI Gemini 2.5 Flash Image Preview 构建
            {footerClickCount > 0 && (
              <span className="ml-2 text-xs text-blue-500">
                {'●'.repeat(footerClickCount)}
              </span>
            )}
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