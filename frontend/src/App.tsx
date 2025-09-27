import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { SessionProvider } from './contexts/SessionContext.tsx';
import { useSession } from './contexts/SessionContext.tsx';
import { AIMode, ModeToggle } from './components/ModeToggle.tsx';
import { IntegratedWorkflow } from './components/IntegratedWorkflow.tsx';
import { WorkflowHistory } from './components/WorkflowHistory.tsx';
import { LoadingSpinner } from './components/LoadingSpinner.tsx';
import { ErrorMessage } from './components/ErrorMessage.tsx';
import { SystemPromptModal } from './components/SystemPromptModal.tsx';
import { ImageEditResult, GeneratedImage } from './types/index.ts';
import { saveHistoryItem, loadHistoryItems, getHistoryItemById, deleteHistoryItem, clearHistory, updateHistoryHidden, HistoryItem } from './utils/historyDb.ts';
import webSocketService from './services/websocket.ts';

const AppContent: React.FC = () => {
  const { sessionData, sessionId, isLoading, error, initializeSession } = useSession();
  const [modeResults, setModeResults] = useState<Record<AIMode, ImageEditResult | null>>({ generate: null, edit: null, analyze: null });
  // 抑制“在当前模块自动回填最近结果”的标记（用户手动删除后生效；切换模块时自动清除）
  const [suppressAutoRestore, setSuppressAutoRestore] = useState<Record<AIMode, boolean>>({ generate: false, edit: false, analyze: false });
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [selectedMode, setSelectedMode] = useState<AIMode>('generate');
  const [showSystemPromptModal, setShowSystemPromptModal] = useState(false);
  // 恢复页脚 5 次点击打开 System Prompt 的彩蛋
  const [footerClickCount, setFooterClickCount] = useState(0);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleFooterClick = useCallback(() => {
    setFooterClickCount(prev => {
      const newCount = prev + 1;
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      if (newCount >= 5) { setShowSystemPromptModal(true); return 0; }
      clickTimeoutRef.current = setTimeout(() => setFooterClickCount(0), 1000);
      return newCount;
    });
  }, []);

  const handleProcessComplete = useCallback((result: ImageEditResult) => {
    setModeResults(prev => ({ ...prev, [selectedMode]: result }));
    setIsProcessing(false);
    setProcessingStatus('success');
    // 本地镜像到 IndexedDB（刷新不丢）
    try {
      const item: HistoryItem = {
        id: result.id,
        createdAt: result.createdAt || Date.now(),
        sessionId: result.sessionId,
        prompt: result.prompt,
        result: result.result,
        resultType: result.resultType,
        metadata: result.metadata,
        mode: selectedMode,
        inputPreviews: Array.isArray(result.inputImages)
          ? result.inputImages.map((img: any) => img?.dataUrl).filter(Boolean)
          : [],
      };
      // 尽快异步写入：让 UI 无阻塞
      (window.requestIdleCallback || window.requestAnimationFrame)(() => { saveHistoryItem(item); });
      // 更新每模块最后一条指针
      try {
        const key = 'iwf:last-history-id';
        const raw = sessionStorage.getItem(key);
        const map = raw ? JSON.parse(raw) : {};
        map[selectedMode] = result.id;
        sessionStorage.setItem(key, JSON.stringify(map));
      } catch {}
    } catch {}
    
    // 滚动到结果区域
    setTimeout(() => {
      const resultElement = document.querySelector('[data-scroll-to="result"]');
      if (resultElement) {
        resultElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, [selectedMode]);

  const handleProcessStart = useCallback(() => {
    setIsProcessing(true);
    setProcessingStatus('loading');
  }, []);

  const handleProcessError = useCallback((error: string) => {
    setIsProcessing(false);
    setProcessingStatus('error');
    toast.error(`处理失败: ${error}`);
  }, []);

  useEffect(() => {
    if (processingStatus === 'success' || processingStatus === 'error') {
      const timeout = setTimeout(() => {
        setProcessingStatus('idle');
      }, 2400);
      return () => clearTimeout(timeout);
    }
  }, [processingStatus]);

  // WebSocket 连接管理
  useEffect(() => {
    if (sessionId && webSocketService.isConnected()) {
      console.log('WebSocket connected for session:', sessionId);
      
      // 监听任务完成事件
      const handleTaskCompleted = (task: any) => {
        console.log('🎉 Task completed received:', { taskId: task?.taskId, hasResult: !!task?.result });
        if (task.result) {
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
    setModeResults(prev => ({ ...prev, [selectedMode]: null }));
    // 手动删除：本模块在当前会话内不自动回填最近结果，直到切换离开再回来
    setSuppressAutoRestore(prev => ({ ...prev, [selectedMode]: true }));
    // 标记最近一条为隐藏（用于跨切换不回填）
    try {
      const key = 'iwf:last-history-id';
      const raw = sessionStorage.getItem(key);
      const map = raw ? JSON.parse(raw) : {};
      const id = map?.[selectedMode];
      if (id) {
        updateHistoryHidden(id, true);
        setHiddenHistoryIds(prev => new Set(prev).add(id));
      }
    } catch {}
  }, [selectedMode]);

  const handleModeChange = useCallback((mode: AIMode) => {
    setSelectedMode(mode);
    setIsProcessing(false);
    // 进入目标模块时，允许自动回填最近结果
    setSuppressAutoRestore(prev => ({ ...prev, [mode]: false }));
    
    // 滚动到工作区
    setTimeout(() => {
      const workflowElement = document.querySelector('[data-scroll-to="workflow"]');
      if (workflowElement) {
        workflowElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, []);

  // Loading state
  // 合并历史：将 generationHistory 映射为展示所需结构，与 editHistory 合并后按时间倒序
  const [localHistory, setLocalHistory] = useState<ImageEditResult[]>([]);
  const [hiddenHistoryIds, setHiddenHistoryIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    // 页面挂载时加载 IndexedDB 历史，合并展示
    (async () => {
      const items = await loadHistoryItems(300);
      const mapped: ImageEditResult[] = items.map((it) => ({
        id: it.id,
        sessionId: it.sessionId || sessionId || '',
        prompt: it.prompt || '',
        inputImages: [],
        result: it.result || '',
        resultType: (it.resultType as any) || 'image',
        createdAt: it.createdAt || Date.now(),
        metadata: it.metadata || {},
      }));
      setLocalHistory(mapped);
    })();
  }, [sessionId]);

  const mergedHistory: ImageEditResult[] = React.useMemo(() => {
    const edits: ImageEditResult[] = sessionData?.editHistory || [];
    const gensRaw: GeneratedImage[] = sessionData?.generationHistory || [];
    const gens: ImageEditResult[] = gensRaw.map((g) => ({
      id: g.id,
      sessionId: sessionId || '',
      prompt: g.prompt || '',
      inputImages: [],
      result: g.imageUrl,
      resultType: 'image',
      createdAt: g.createdAt,
      metadata: {
        prompt: g.prompt || '',
        inputImageCount: 0,
        model: 'image-generation',
        timestamp: new Date(g.createdAt).toISOString(),
        hasText: false,
        hasImage: true,
      }
    }));
    // 去重：以 id 为基准
    const map = new Map<string, ImageEditResult>();
    [...localHistory, ...edits, ...gens].forEach((r) => { if (r?.id) map.set(r.id, r); });
    const all = Array.from(map.values());
    return all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [sessionData, sessionId, localHistory, hiddenHistoryIds]);

  // 初始化/切换模块时，尝试从本地历史恢复当前模块的最后结果
  useEffect(() => {
    (async () => {
      if (modeResults[selectedMode]) return;
      // 若用户在当前模块刚手动删除，则不回填
      if (suppressAutoRestore[selectedMode]) return;
      try {
        const key = 'iwf:last-history-id';
        const raw = sessionStorage.getItem(key);
        const map = raw ? JSON.parse(raw) : {};
      const wantedId = map?.[selectedMode];
      if (hiddenHistoryIds.has(wantedId)) return; // 用户手动隐藏的最后一条，不回填
        if (!wantedId) return;
        const item = await getHistoryItemById(wantedId);
        // 关键：若本地记录被标记 hidden（或已删除），则不恢复
        if (!item || (item as any).hidden) return;
        const mapped: ImageEditResult = {
          id: item.id,
          sessionId: item.sessionId || sessionId || '',
          prompt: item.prompt || '',
          inputImages: (item.inputPreviews || []).map((url) => ({ originalName: '', mimeType: '', size: 0, dataUrl: url })),
          result: item.result || '',
          resultType: (item.resultType as any) || 'image',
          createdAt: item.createdAt || Date.now(),
          metadata: item.metadata || {},
        };
        setModeResults(prev => ({ ...prev, [selectedMode]: mapped }));
      } catch {}
    })();
  }, [selectedMode, localHistory, modeResults, sessionId, suppressAutoRestore]);

  // 历史显示开关（默认隐藏）
  const [showHistory, setShowHistory] = useState(false);
  const toggleHistory = useCallback(() => setShowHistory(v => !v), []);

  // 离开“图片生成”模块时自动隐藏历史记录面板
  useEffect(() => {
    if (selectedMode !== 'generate' && showHistory) {
      setShowHistory(false);
    }
  }, [selectedMode, showHistory]);

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

        {/* 主工作流（页面整体滚动） */}
        <div className="space-y-3 xl:space-y-4" data-scroll-to="workflow">
          {/* Debug removed to avoid noisy console */}
          {/* 整合的工作流界面 */}
          <IntegratedWorkflow
            onProcessComplete={handleProcessComplete}
            onProcessStart={handleProcessStart}
            onProcessError={handleProcessError}
            sessionId={sessionId}
            isProcessing={isProcessing}
            processingStatus={processingStatus}
            selectedMode={selectedMode}
            currentResult={modeResults[selectedMode]}
            onClearResult={handleClearResult}
            onModeChange={handleModeChange}
            showSystemPromptModal={showSystemPromptModal}
            onCloseSystemPromptModal={() => setShowSystemPromptModal(false)}
            onOpenSystemPromptModal={() => setShowSystemPromptModal(true)}
            onToggleHistory={toggleHistory}
          />

          {/* 处理中状态 - 这个区域会在 UnifiedWorkflow 中显示 */}
          {isProcessing && (
            <div data-scroll-to="processing"></div>
          )}

          {/* 历史记录：仅在图片生成模块显示 */}
          {selectedMode === 'generate' && showHistory && mergedHistory.length > 0 && (
            <WorkflowHistory 
              editHistory={mergedHistory}
              onDeleteItem={async (id) => {
                try {
                  await deleteHistoryItem(id);
                } catch {}
                setLocalHistory((prev) => prev.filter((r) => r.id !== id));
                setHiddenHistoryIds((prev) => new Set(prev).add(id));
                toast.success('已删除 1 条历史');
              }}
              onClearAll={async () => {
                const ids = mergedHistory.map((r) => r.id);
                try { await clearHistory(); } catch {}
                setLocalHistory([]);
                setHiddenHistoryIds(new Set(ids));
                toast.success('已清空历史');
              }}
            />
          )}
        </div>

        {/* 页脚（不滚动区域） - 恢复文案与彩蛋 */}
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
              <span className="ml-2 text-xs text-blue-500">{'●'.repeat(footerClickCount)}</span>
            )}
          </p>
        </div>
      </div>
      
      {/* 系统提示词模态框 */}
      <SystemPromptModal
        show={showSystemPromptModal}
        onClose={() => setShowSystemPromptModal(false)}
        onSave={(prompts) => {
          console.log('保存提示词:', prompts);
          // TODO: 实现保存逻辑
          setShowSystemPromptModal(false);
        }}
      />
      
      {/* Toast 通知 */}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          // 统一“正在处理中”样式为绿色系，贴合编辑/生成的状态提示
          loading: {
            style: {
              background: '#ecfdf5', // emerald-50
              color: '#065f46',      // emerald-800
              border: '1px solid #34d399', // emerald-400
              boxShadow: '0 4px 16px rgba(16, 185, 129, 0.15)'
            },
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
