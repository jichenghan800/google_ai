import React, { useState, useEffect, useCallback } from 'react';
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
import {
  saveHistoryItem,
  loadHistoryItems,
  getHistoryItemById,
  deleteHistoryItem,
  clearHistory,
  updateHistoryHidden,
  HistoryItem,
} from './utils/historyDb.ts';
import webSocketService from './services/websocket.ts';
import { Bars3Icon, ClockIcon, Cog6ToothIcon, XMarkIcon } from '@heroicons/react/24/outline';

const MODE_LABELS: Record<AIMode, string> = {
  generate: '图片生成',
  edit: '图片编辑',
  analyze: '图像分析',
};

const AppContent: React.FC = () => {
  const { sessionData, sessionId, isLoading, error, initializeSession } = useSession();
  const [modeResults, setModeResults] = useState<Record<AIMode, ImageEditResult | null>>({
    generate: null,
    edit: null,
    analyze: null,
  });
  const [suppressAutoRestore, setSuppressAutoRestore] = useState<Record<AIMode, boolean>>({
    generate: false,
    edit: false,
    analyze: false,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [selectedMode, setSelectedMode] = useState<AIMode>('generate');
  const [showSystemPromptModal, setShowSystemPromptModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleProcessComplete = useCallback(
    (result: ImageEditResult) => {
      setModeResults((prev) => ({ ...prev, [selectedMode]: result }));
      setIsProcessing(false);
      setProcessingStatus('success');
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
        (window.requestIdleCallback || window.requestAnimationFrame)(() => {
          saveHistoryItem(item);
        });
        try {
          const key = 'iwf:last-history-id';
          const raw = sessionStorage.getItem(key);
          const map = raw ? JSON.parse(raw) : {};
          map[selectedMode] = result.id;
          sessionStorage.setItem(key, JSON.stringify(map));
        } catch {}
      } catch {}

      setTimeout(() => {
        const el = document.querySelector('[data-scroll-to="result"]');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    },
    [selectedMode],
  );

  const handleProcessStart = useCallback(() => {
    setIsProcessing(true);
    setProcessingStatus('loading');
  }, []);

  const handleProcessError = useCallback((msg: string) => {
    setIsProcessing(false);
    setProcessingStatus('error');
    toast.error(`处理失败: ${msg}`);
  }, []);

  useEffect(() => {
    if (processingStatus === 'success' || processingStatus === 'error') {
      const timer = setTimeout(() => setProcessingStatus('idle'), 2400);
      return () => clearTimeout(timer);
    }
  }, [processingStatus]);

  useEffect(() => {
    if (sessionId && webSocketService.isConnected()) {
      const handleTaskCompleted = (task: any) => {
        if (task.result) {
          handleProcessComplete({
            result: task.result,
            taskId: task.taskId,
            timestamp: task.timestamp || Date.now(),
          });
        }
      };
      webSocketService.onTaskCompleted(handleTaskCompleted);
      return () => {
        webSocketService.off('task_completed', handleTaskCompleted);
      };
    }
  }, [sessionId, handleProcessComplete]);

  const handleClearResult = useCallback(() => {
    setModeResults((prev) => ({ ...prev, [selectedMode]: null }));
    setSuppressAutoRestore((prev) => ({ ...prev, [selectedMode]: true }));
    try {
      const key = 'iwf:last-history-id';
      const raw = sessionStorage.getItem(key);
      const map = raw ? JSON.parse(raw) : {};
      const id = map?.[selectedMode];
      if (id) {
        updateHistoryHidden(id, true);
        setHiddenHistoryIds((prev) => new Set(prev).add(id));
      }
    } catch {}
  }, [selectedMode]);

  const handleModeChange = useCallback(
    (mode: AIMode) => {
      setSelectedMode(mode);
      setIsProcessing(false);
      setSuppressAutoRestore((prev) => ({ ...prev, [mode]: false }));
      setIsSidebarOpen(false);
      setTimeout(() => {
        const el = document.querySelector('[data-scroll-to="workflow"]');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    },
    [],
  );

  const [localHistory, setLocalHistory] = useState<ImageEditResult[]>([]);
  const [hiddenHistoryIds, setHiddenHistoryIds] = useState<Set<string>>(new Set());

  useEffect(() => {
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

  const mergedHistory = React.useMemo(() => {
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
      },
    }));
    const map = new Map<string, ImageEditResult>();
    [...localHistory, ...edits, ...gens].forEach((r) => {
      if (r?.id) map.set(r.id, r);
    });
    return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [sessionData, sessionId, localHistory, hiddenHistoryIds]);

  useEffect(() => {
    (async () => {
      if (modeResults[selectedMode]) return;
      if (suppressAutoRestore[selectedMode]) return;
      try {
        const key = 'iwf:last-history-id';
        const raw = sessionStorage.getItem(key);
        const map = raw ? JSON.parse(raw) : {};
        const wantedId = map?.[selectedMode];
        if (hiddenHistoryIds.has(wantedId)) return;
        if (!wantedId) return;
        const item = await getHistoryItemById(wantedId);
        if (!item || (item as any).hidden) return;
        const mapped: ImageEditResult = {
          id: item.id,
          sessionId: item.sessionId || sessionId || '',
          prompt: item.prompt || '',
          inputImages: (item.inputPreviews || []).map((url) => ({
            originalName: '',
            mimeType: '',
            size: 0,
            dataUrl: url,
          })),
          result: item.result || '',
          resultType: (item.resultType as any) || 'image',
          createdAt: item.createdAt || Date.now(),
          metadata: item.metadata || {},
        };
        setModeResults((prev) => ({ ...prev, [selectedMode]: mapped }));
      } catch {}
    })();
  }, [selectedMode, localHistory, modeResults, sessionId, suppressAutoRestore, hiddenHistoryIds]);

  const [showHistory, setShowHistory] = useState(selectedMode === 'generate');
  const toggleHistory = useCallback(() => setShowHistory((v) => !v), []);

  useEffect(() => {
    if (selectedMode !== 'generate' && showHistory) {
      setShowHistory(false);
    }
  }, [selectedMode, showHistory]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1280) {
        setIsSidebarOpen(false);
      }
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-0 text-neutral-100">
        <div className="panel w-full max-w-sm text-center">
          <LoadingSpinner message="正在唤醒工作台..." size="large" />
          <p className="mt-4 text-sm text-neutral-400">正在初始化多模态服务，请稍候…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-0 text-neutral-100">
        <div className="panel w-full max-w-md space-y-4">
          <ErrorMessage title="会话初始化失败" message={error} onRetry={initializeSession} />
        </div>
      </div>
    );
  }

  const isConnected = webSocketService.isConnected();
  const historyPanelVisible = selectedMode === 'generate' && showHistory;

  return (
    <div className="app-shell">
      {isSidebarOpen && <div className="app-sidebar-overlay xl:hidden" onClick={() => setIsSidebarOpen(false)} />}

      <aside className={`app-sidebar ${isSidebarOpen ? 'mobile-open' : ''}`}>
        <div className="app-sidebar__header">
          <div className="app-sidebar__brand">AI</div>
          <div className="app-sidebar__title">
            <strong>AI 图像工作台</strong>
            <span>Vertex AI · 多模态体验</span>
          </div>
        </div>

        <div className="app-sidebar__section" data-scroll-to="workflow">
          <h4>工作流模式</h4>
          <ModeToggle selectedMode={selectedMode} onModeChange={handleModeChange} isProcessing={isProcessing} />
        </div>

        <div className="app-sidebar__section">
          <h4>快捷操作</h4>
          <button
            type="button"
            className={`nav-pill ${historyPanelVisible ? 'border-brand-400/50 bg-brand-500/15 text-white shadow-brand' : ''}`}
            onClick={() => {
              if (selectedMode !== 'generate') {
                handleModeChange('generate');
              }
              setShowHistory(true);
              setIsSidebarOpen(false);
            }}
          >
            <ClockIcon className="h-5 w-5" />
            <div className="flex flex-col">
              <span>历史记录</span>
              <span className="text-xs text-neutral-400">回顾最近的生成结果</span>
            </div>
          </button>
          <button
            type="button"
            className="nav-pill"
            onClick={() => {
              setShowSystemPromptModal(true);
              setIsSidebarOpen(false);
            }}
          >
            <Cog6ToothIcon className="h-5 w-5" />
            <div className="flex flex-col">
              <span>系统提示词</span>
              <span className="text-xs text-neutral-400">配置全局策略与模板</span>
            </div>
          </button>
        </div>

        <div className="app-sidebar__footer">
          <div
            className={`connection-pill ${
              isConnected ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-200' : 'border-rose-400/50 bg-rose-500/15 text-rose-200'
            }`}
          >
            <span className={`connection-pill__dot ${isConnected ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'}`} />
            <span>{isConnected ? '实时通道 · 正常' : '实时通道 · 断开'}</span>
          </div>
          <div className="space-y-1 text-xs text-neutral-400/80">
            <span className="block font-semibold text-neutral-200/90">会话标识</span>
            <span className="block font-mono text-[11px] text-neutral-500">
              {sessionId || '正在初始化…'}
            </span>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div className="app-header__left">
            <button
              type="button"
              className="icon-button xl:hidden"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="展开导航"
            >
              <Bars3Icon className="h-5 w-5" />
            </button>
            <span className="toolbar-chip hidden md:inline-flex">当前模式 · {MODE_LABELS[selectedMode]}</span>
          </div>
          <div className="app-header__actions">
            <div className="hidden lg:block">
              <div
                className={`connection-pill ${
                  isConnected ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-rose-400/40 bg-rose-500/15 text-rose-200'
                }`}
              >
                <span className={`connection-pill__dot ${isConnected ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'}`} />
                <span>{isConnected ? '连接正常' : '连接断开'}</span>
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary hidden md:inline-flex"
              onClick={() => setShowSystemPromptModal(true)}
            >
              <Cog6ToothIcon className="h-4 w-4" />
              <span>系统提示词</span>
            </button>
            <button
              type="button"
              className="icon-button md:hidden"
              onClick={() => setShowSystemPromptModal(true)}
              aria-label="打开系统提示词"
            >
              <Cog6ToothIcon className="h-5 w-5" />
            </button>
            {selectedMode === 'generate' && (
              <button
                type="button"
                className={`icon-button xl:hidden ${historyPanelVisible ? 'border-brand-400/50 bg-brand-500/15 text-white' : ''}`}
                onClick={toggleHistory}
                aria-label="切换历史记录面板"
                aria-pressed={historyPanelVisible}
              >
                <ClockIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </header>

        <div className="app-main-body">
          <div className="app-workflow" data-scroll-to="workflow">
            <div className="mb-5 xl:hidden">
              <ModeToggle
                layout="horizontal"
                condensed
                selectedMode={selectedMode}
                onModeChange={handleModeChange}
                isProcessing={isProcessing}
              />
            </div>

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
              showModeSwitch={false}
            />
          </div>

          {historyPanelVisible && (
            <>
              <aside className={`app-history-panel ${historyPanelVisible ? 'open' : ''}`}>
                <div className="app-history-panel__header">
                  <div className="app-history-panel__title">
                    <strong>生成历史</strong>
                    <span>最近 {Math.min(mergedHistory.length, 300)} 条任务</span>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setShowHistory(false)}
                    aria-label="关闭历史面板"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                <div className="app-history-scroll">
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
                      try {
                        await clearHistory();
                      } catch {}
                      setLocalHistory([]);
                      setHiddenHistoryIds(new Set(ids));
                      setShowHistory(false);
                      toast.success('已清空历史');
                    }}
                  />
                </div>
              </aside>
              <div className="app-history-overlay xl:hidden" onClick={() => setShowHistory(false)} />
            </>
          )}
        </div>
      </div>

      <SystemPromptModal
        show={showSystemPromptModal}
        onClose={() => setShowSystemPromptModal(false)}
        onSave={(prompts) => {
          console.log('保存提示词:', prompts);
          setShowSystemPromptModal(false);
        }}
      />

      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3800,
          style: {
            background: 'rgba(15, 23, 42, 0.92)',
            color: '#e2e8f0',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            boxShadow: '0 18px 40px -20px rgba(99, 102, 241, 0.45)',
          },
          loading: {
            style: {
              background: 'rgba(22, 163, 74, 0.12)',
              color: '#bbf7d0',
              border: '1px solid rgba(34, 197, 94, 0.35)',
              boxShadow: '0 18px 36px -18px rgba(34, 197, 94, 0.35)',
            },
          },
        }}
      />
    </div>
  );
};

const App: React.FC = () => (
  <SessionProvider>
    <AppContent />
  </SessionProvider>
);

export default App;
