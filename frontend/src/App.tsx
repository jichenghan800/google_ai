import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { Bars3Icon, ClockIcon, CommandLineIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { QuickTemplates } from './components/QuickTemplates.tsx';
import { ASPECT_RATIO_OPTIONS } from './constants/aspectRatios.ts';
import { getModeDisplayLabel } from './constants/modeLabels.ts';
import {
  TemplateInfoBadge,
  TemplateInfoMeta,
  TemplateInfoStatus,
  TemplateContextInfo,
} from './components/TemplateInfoBadge.tsx';

type TemplateBadgeState = {
  status: TemplateInfoStatus;
  template?: TemplateInfoMeta;
  message?: string;
};

const AppContent: React.FC = () => {
  const { sessionData, sessionId, isLoading, error, initializeSession } = useSession();
  const [modeResults, setModeResults] = useState<Record<AIMode, ImageEditResult | null>>({
    generate: null,
    edit: null,
    analyze: null,
  });
  const [selectedRatio, setSelectedRatio] = useState(ASPECT_RATIO_OPTIONS[1]);
  const [suppressAutoRestore, setSuppressAutoRestore] = useState<Record<AIMode, boolean>>({
    generate: false,
    edit: false,
    analyze: false,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [selectedMode, setSelectedMode] = useState<AIMode>('generate');
  const [templateBadgeState, setTemplateBadgeState] = useState<TemplateBadgeState>({ status: 'idle' });
  const [badgeInlineMessage, setBadgeInlineMessage] = useState('');
  const [showSystemPromptModal, setShowSystemPromptModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [historyPlaybackActive, setHistoryPlaybackActive] = useState(false);
  const [historySelectionId, setHistorySelectionId] = useState<string | null>(null);
  const [historySelection, setHistorySelection] = useState<ImageEditResult | null>(null);
  const [historyPromptDraft, setHistoryPromptDraft] = useState<ImageEditResult | null>(null);
  const historyClearRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!badgeInlineMessage || historyPlaybackActive) return;
    const timer = window.setTimeout(() => setBadgeInlineMessage(''), 2600);
    return () => window.clearTimeout(timer);
  }, [badgeInlineMessage, historyPlaybackActive]);
  const [uiTheme, setUiTheme] = useState<string>(() => {
    try {
      return localStorage.getItem('theme') || 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('theme', uiTheme);
    } catch {}
    document.documentElement.classList.toggle('dark', uiTheme === 'dark');
    document.documentElement.setAttribute('data-theme', uiTheme);
  }, [uiTheme]);
  const toggleTheme = useCallback(() => {
    setUiTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const [uiLang, setUiLang] = useState<string>(() => {
    try {
      return localStorage.getItem('lang') || 'zh';
    } catch {
      return 'zh';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('lang', uiLang);
    } catch {}
  }, [uiLang]);
  const toggleLang = useCallback(() => {
    setUiLang((prev) => (prev === 'zh' ? 'en' : 'zh'));
  }, []);

  const buildTemplateMeta = useCallback((pick: any): TemplateInfoMeta => {
    const title =
      pick?.nameZh ||
      pick?.nameEn ||
      pick?.name ||
      '常用方案';
    const body =
      (pick?.display ||
        pick?.contentZh ||
        pick?.english ||
        '')?.toString().trim() || '';
    return {
      title,
      body,
      emoji: pick?.emoji,
    };
  }, []);

  const buildHistoryContext = useCallback((entry: ImageEditResult): TemplateContextInfo => {
    const created = entry.createdAt ? new Date(entry.createdAt) : new Date();
    const metadata = entry.metadata || {};
    const timestamp = created.toLocaleString('zh-CN', { hour12: false });
    const items: TemplateContextInfo['items'] = [
      { label: '时间', value: timestamp },
    ];
    const modeLabel = getModeDisplayLabel(entry.mode || 'generate');
    items.push({ label: '来源', value: modeLabel });
    if (metadata.model) {
      items.push({ label: '模型', value: metadata.model });
    }
    return {
      title: '历史回放',
      accent: 'history',
      items,
    };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TemplateBadgeState>).detail;
      if (!detail) return;
      setTemplateBadgeState((prev) => ({
        status: detail.status,
        template: detail.template || prev.template,
        message: detail.message,
      }));
    };
    window.addEventListener('template:active-info', handler as EventListener);
    return () => window.removeEventListener('template:active-info', handler as EventListener);
  }, []);

  useEffect(() => {
    if (selectedMode !== 'generate') {
      setTemplateBadgeState({ status: 'idle' });
    }
  }, [selectedMode]);

  const exitHistoryPlayback = useCallback(() => {
    setHistoryPlaybackActive(false);
    setHistorySelectionId(null);
    setHistorySelection(null);
    setHistoryPromptDraft(null);
    try {
      const key = 'iwf:last-history-id';
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const map = JSON.parse(raw);
        if (map && typeof map === 'object') {
          delete map[selectedMode];
          sessionStorage.setItem(key, JSON.stringify(map));
        }
      }
    } catch {}
  }, [selectedMode]);

  const handleProcessComplete = useCallback(
    (result: ImageEditResult) => {
      if (historyPlaybackActive) {
        exitHistoryPlayback();
      }
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
    [exitHistoryPlayback, historyPlaybackActive, selectedMode],
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
    if (historyPlaybackActive) {
      exitHistoryPlayback();
      return;
    }
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
  }, [exitHistoryPlayback, historyPlaybackActive, selectedMode]);

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

  const handleHistoryFocus = useCallback(
    (entry: ImageEditResult | null) => {
      if (!entry) {
        exitHistoryPlayback();
        return;
      }
      const normalized: ImageEditResult = {
        ...entry,
        mode: entry.mode || 'generate',
      };
      setHistoryPlaybackActive(true);
      setHistorySelectionId(normalized.id);
      setHistorySelection((prev) => {
        if (
          prev &&
          prev.id === normalized.id &&
          prev.prompt === normalized.prompt &&
          prev.result === normalized.result
        ) {
          return prev;
        }
        return normalized;
      });
      setHistoryPromptDraft(normalized);
      setBadgeInlineMessage('');
      if (selectedMode !== 'generate') {
        handleModeChange('generate');
      }
    },
    [exitHistoryPlayback, handleModeChange, selectedMode],
  );

  const handleHistoryPromptReuse = useCallback(
    (entry: ImageEditResult) => {
      handleHistoryFocus(entry);
    },
    [handleHistoryFocus],
  );

  const handleSidebarTemplatePick = useCallback(
    (pick: any) => {
      if (selectedMode !== 'generate') {
        handleModeChange('generate');
      }
      const meta = buildTemplateMeta(pick);
      setTemplateBadgeState({ status: 'loading', template: meta });
      window.dispatchEvent(new CustomEvent('sidebar:generate-template', { detail: pick }));
    },
    [selectedMode, handleModeChange, buildTemplateMeta],
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
      if (r?.id && !hiddenHistoryIds.has(r.id)) map.set(r.id, r);
    });
    return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [sessionData, sessionId, localHistory, hiddenHistoryIds]);

  useEffect(() => {
    if (!historyPlaybackActive || !historySelectionId) return;
    const updated = mergedHistory.find((item) => item.id === historySelectionId);
    if (updated) {
      setHistorySelection(updated);
    } else {
      exitHistoryPlayback();
    }
  }, [historyPlaybackActive, historySelectionId, mergedHistory, exitHistoryPlayback]);

  const historyContext = useMemo<TemplateContextInfo | null>(
    () => (historyPlaybackActive && historySelection ? buildHistoryContext(historySelection) : null),
    [historyPlaybackActive, historySelection, buildHistoryContext],
  );

  const displayResult = useMemo<ImageEditResult | null>(() => {
    if (selectedMode === 'generate' && historyPlaybackActive && historySelection) {
      return historySelection;
    }
    return modeResults[selectedMode] ?? null;
  }, [selectedMode, historyPlaybackActive, historySelection, modeResults]);


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
    const onResize = () => {
      if (window.innerWidth >= 1280) {
        setIsSidebarOpen(false);
      }
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const showProcessingInBadge = useMemo(() => {
    if (!(selectedMode === 'generate' || selectedMode === 'edit')) return false;
    return processingStatus === 'loading' || processingStatus === 'success' || processingStatus === 'error';
  }, [processingStatus, selectedMode]);

  const processingBadgeStatus = showProcessingInBadge ? processingStatus : 'idle';

  const processingBadgeMessage = useMemo(() => {
    if (!showProcessingInBadge) return '';
    if (processingStatus === 'loading') {
      const verb = selectedMode === 'generate' ? '创作中…' : '编辑中…';
      return `AI 正在${verb}`;
    }
    if (processingStatus === 'success') {
      return '处理完成！';
    }
    if (processingStatus === 'error') {
      return '处理失败，请稍后重试';
    }
    return '';
  }, [processingStatus, selectedMode, showProcessingInBadge]);

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

        <div className="app-sidebar__section app-sidebar__section--quick">
          <div className="sidebar-quick-group">
            <h4>画布选择</h4>
            <div className="sidebar-ratio-row">
              {ASPECT_RATIO_OPTIONS.map((ratio) => (
                <button
                  key={ratio.id}
                  type="button"
                  className={`sidebar-ratio-button ${selectedRatio.id === ratio.id ? 'sidebar-ratio-button--active' : ''} ${selectedMode !== 'generate' ? 'sidebar-ratio-button--inactive' : ''}`}
                  onClick={() => {
                    if (selectedMode !== 'generate') {
                      handleModeChange('generate');
                    }
                    setSelectedRatio(ratio);
                  }}
                  title={ratio.description}
                >
                  <span
                    className={`sidebar-ratio-emoji sidebar-ratio-icon sidebar-ratio-icon--${ratio.id}`}
                    aria-hidden="true"
                  />
                  <span className="sidebar-ratio-label">{ratio.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="sidebar-quick-group">
            <h4>最佳实践</h4>
            {selectedMode === 'generate' ? (
              <div className="sidebar-quick-scroll">
                <QuickTemplates
                  selectedMode="generate"
                  variant="list"
                  dense
                  framed
                  onSelectTemplate={handleSidebarTemplatePick}
                  onManageTemplates={() => {}}
                />
              </div>
            ) : (
              <p className="sidebar-hint text-xs text-neutral-400">
                切换到生成模式以使用预设模板
              </p>
            )}
          </div>
        </div>

        <div className="app-sidebar__footer">
          <div className="sidebar-footer-actions">
            <button
              type="button"
              className="sidebar-footer-button"
              onClick={toggleTheme}
              title={uiTheme === 'dark' ? '切换至浅色模式' : '切换至深色模式'}
            >
              {uiTheme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364l-1.414-1.414M7.05 7.05 5.636 5.636m12.728 0-1.414 1.414M7.05 16.95l-1.414 1.414M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 1 1 8.646 3.646 7 7 0 0 0 20.354 15.354z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className={`sidebar-footer-button ${historyPanelVisible ? 'sidebar-footer-button--active' : ''}`}
              onClick={toggleHistory}
              title="切换历史记录面板"
              aria-pressed={historyPanelVisible}
            >
              <ClockIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="sidebar-footer-button"
              onClick={toggleLang}
              title="切换界面语言"
            >
              <span className="text-xs font-semibold">{uiLang === 'zh' ? '中' : 'En'}</span>
            </button>
            <button
              type="button"
              className="sidebar-footer-button"
              onClick={() => setShowSystemPromptModal(true)}
              title="系统提示词配置"
              aria-label="打开系统提示词"
            >
              <CommandLineIcon className="h-5 w-5" />
            </button>
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
          </div>
          <div className="app-header__center">
            <TemplateInfoBadge
              status={templateBadgeState.status}
              template={templateBadgeState.template}
              message={templateBadgeState.message}
              modeLabel={getModeDisplayLabel(selectedMode)}
              inlineMessage={historyPlaybackActive ? undefined : badgeInlineMessage}
              contextInfo={historyContext}
              processingStatus={historyPlaybackActive ? 'idle' : processingBadgeStatus}
              processingMessage={historyPlaybackActive ? undefined : processingBadgeMessage}
            />
          </div>
          <div className="app-header__actions">
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
              currentResult={displayResult}
              historySelection={historyPlaybackActive ? historySelection : null}
              historyPromptDraft={historyPromptDraft}
              onHistoryPromptDraftConsumed={() => setHistoryPromptDraft(null)}
              onExitHistoryPlayback={exitHistoryPlayback}
              onClearResult={handleClearResult}
              onModeChange={handleModeChange}
              showSystemPromptModal={showSystemPromptModal}
              onCloseSystemPromptModal={() => setShowSystemPromptModal(false)}
              onOpenSystemPromptModal={() => setShowSystemPromptModal(true)}
              onToggleHistory={toggleHistory}
              showModeSwitch={false}
              selectedRatio={selectedRatio}
              onRatioChange={setSelectedRatio}
              ratioOptions={ASPECT_RATIO_OPTIONS}
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => historyClearRef.current?.()}
                      aria-label="清空历史"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setShowHistory(false)}
                    aria-label="关闭历史面板"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                  </div>
                </div>
                <div className="app-history-scroll">
                  <WorkflowHistory
                    editHistory={mergedHistory}
                    activeId={historyPlaybackActive ? historySelectionId : null}
                    onHistoryFocus={handleHistoryFocus}
                    onPromptReuse={handleHistoryPromptReuse}
                    onDeleteItem={async (id) => {
                      try {
                        await deleteHistoryItem(id);
                      } catch {}
                      setLocalHistory((prev) => prev.filter((r) => r.id !== id));
                      setHiddenHistoryIds((prev) => {
                        const next = new Set(prev);
                        next.add(id);
                        return next;
                      });
                      if (historyPlaybackActive && historySelectionId === id) {
                        exitHistoryPlayback();
                      }
                      setBadgeInlineMessage('已删除 1 条历史');
                      // 胶囊已显示提示，无需额外 toast
                    }}
                    onClearAll={async () => {
                      const ids = mergedHistory.map((r) => r.id);
                      try {
                        await clearHistory();
                      } catch {}
                      setLocalHistory([]);
                      setHiddenHistoryIds((prev) => {
                        const next = new Set(prev);
                        ids.forEach((id) => next.add(id));
                        return next;
                      });
                      setShowHistory(false);
                      if (historyPlaybackActive) {
                        exitHistoryPlayback();
                      }
                      setBadgeInlineMessage('已清空历史');
                      // 胶囊已显示提示，无需额外 toast
                    }}
                    onBindClear={(open) => {
                      historyClearRef.current = open;
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
