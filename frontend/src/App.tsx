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
import { ImageEditResult, GeneratedImage, AuthUser, UserTier } from './types/index.ts';
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
import { RESOLUTION_OPTIONS } from './constants/resolutions.ts';
import { getModeDisplayLabel } from './constants/modeLabels.ts';
import apiClient, { recognitionAPI } from './services/api.ts';
import { authAPI } from './services/api.ts';
import { DEFAULT_RECOGNITION_PROMPT, STORE_RECOGNITION_PROMPT } from './constants/recognitionDefaults.ts';
import {
  TemplateInfoBadge,
  TemplateInfoMeta,
  TemplateInfoStatus,
  TemplateContextInfo,
} from './components/TemplateInfoBadge.tsx';
import { LocaleProvider, useLocale } from './contexts/LocaleContext.tsx';
import { getAllowedResolutionsForTier, normalizeTier as normalizeTierFrontend } from './constants/resolutionAccess.ts';
import { AdminConsole } from './components/AdminConsole.tsx';

type TemplateBadgeState = {
  status: TemplateInfoStatus;
  template?: TemplateInfoMeta;
  message?: string;
};

type ModelToggleKey = 'banana1' | 'banana2';

const BANANA1_MODEL_ID =
  (process.env.REACT_APP_BANANA1_MODEL_ID as string | undefined) ||
  (process.env.BANANA1_MODEL_ID as string | undefined) ||
  'gemini-2.5-flash-image';
const BANANA2_MODEL_ID =
  (process.env.REACT_APP_BANANA2_MODEL_ID as string | undefined) ||
  (process.env.BANANA2_MODEL_ID as string | undefined) ||
  'gemini-3-pro-image-preview';

const MODEL_PRESETS: { key: ModelToggleKey; label: string; modelId: string; hint?: string }[] = [
  { key: 'banana1', label: 'Banana', modelId: BANANA1_MODEL_ID, hint: '2.5 flash image' },
  { key: 'banana2', label: 'BananaPro', modelId: BANANA2_MODEL_ID, hint: '3 pro image' },
];

const computeCanvasSize = (ratio: AspectRatioOption, resolution: { longEdge: number }) => {
  const [w, h] = ratio.id.split(':').map((v) => parseInt(v, 10) || 1);
  const longEdge = resolution.longEdge || 1024;
  if (w >= h) {
    return { width: longEdge, height: Math.round((longEdge * h) / w) };
  }
  return { width: Math.round((longEdge * w) / h), height: longEdge };
};

type AppContentProps = {
  authUser?: AuthUser | null;
  onLogout?: () => Promise<void> | void;
  userAvatar: string;
  onAvatarChange: (val: string) => void;
};

const AppContent: React.FC<AppContentProps> = ({ authUser, onLogout, userAvatar, onAvatarChange }) => {
  const handleAvatarChange = onAvatarChange;
  const { sessionData, sessionId, isLoading, error, initializeSession } = useSession();
  const [modeResults, setModeResults] = useState<Record<AIMode, ImageEditResult | null>>({
    generate: null,
    edit: null,
    analyze: null,
  });
  // 生成模式的比例/分辨率
  const [selectedRatio, setSelectedRatio] = useState(ASPECT_RATIO_OPTIONS[0]);
  const [selectedResolution, setSelectedResolution] = useState(RESOLUTION_OPTIONS[0]);
  // 编辑模式的比例/分辨率（默认跟随输入，不传后端）
  const [editSelectedRatio, setEditSelectedRatio] = useState<AspectRatioOption | null>(null);
  const [editSelectedResolution, setEditSelectedResolution] = useState<ResolutionOption | null>(null);
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
  const [recognitionQuickScenarios, setRecognitionQuickScenarios] = useState<{ label: string; content: string }[]>([]);
  const [modelKey, setModelKey] = useState<ModelToggleKey>(() => {
    try {
      const saved = localStorage.getItem('modelPresetKey') as ModelToggleKey | null;
      if (saved && MODEL_PRESETS.some((m) => m.key === saved)) return saved;
    } catch {}
    return 'banana1';
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const avatarFallback = (authUser?.displayName || authUser?.email || '?').charAt(0).toUpperCase();
  const avatarDisplay = userAvatar || avatarFallback;
  const avatarPalette = ['😀','👩‍💻','🧑‍🚀','🌟','🚀','🎨','☕','🐱','🐶','🐼', avatarFallback];
  const userTier: UserTier = useMemo(() => normalizeTierFrontend(authUser?.tier), [authUser]);
  const allowedResolutionList = useMemo(() => getAllowedResolutionsForTier(userTier), [userTier]);
  const allowedResolutionSet = useMemo(() => new Set(allowedResolutionList), [allowedResolutionList]);
  const isAdmin = (authUser?.role === 'admin') || userTier === 'admin';
  const [showAdminConsole, setShowAdminConsole] = useState(false);

  const activeModel = useMemo(() => MODEL_PRESETS.find((m) => m.key === modelKey) || MODEL_PRESETS[0], [modelKey]);
  const canvasSize = useMemo(
    () => computeCanvasSize(selectedRatio, selectedResolution),
    [selectedRatio, selectedResolution],
  );
  useEffect(() => {
    try {
      localStorage.setItem('modelPresetKey', modelKey);
    } catch {}
  }, [modelKey]);
  useEffect(() => {
    if (modelKey === 'banana1' && selectedResolution.id !== '1K') {
      const fallback = RESOLUTION_OPTIONS.find((r) => r.id === '1K') || RESOLUTION_OPTIONS[0];
      setSelectedResolution(fallback);
    }
  }, [modelKey, selectedResolution.id]);
  useEffect(() => {
    if (!allowedResolutionSet.has(selectedResolution.id)) {
      const fallback = RESOLUTION_OPTIONS.find((r) => allowedResolutionSet.has(r.id)) ||
        RESOLUTION_OPTIONS.find((r) => r.id === '1K') ||
        RESOLUTION_OPTIONS[0];
      setSelectedResolution(fallback);
    }
    if (editSelectedResolution && !allowedResolutionSet.has(editSelectedResolution.id)) {
      const fallbackEdit = RESOLUTION_OPTIONS.find((r) => allowedResolutionSet.has(r.id)) || null;
      setEditSelectedResolution(fallbackEdit);
    }
  }, [allowedResolutionSet, selectedResolution.id, editSelectedResolution?.id]);
  useEffect(() => {
    if (!badgeInlineMessage || historyPlaybackActive) return;
    const timer = window.setTimeout(() => setBadgeInlineMessage(''), 2600);
    return () => window.clearTimeout(timer);
  }, [badgeInlineMessage, historyPlaybackActive]);
  useEffect(() => {
    if (!authUser) setUserMenuOpen(false);
  }, [authUser]);
  const [uiTheme, setUiTheme] = useState<string>(() => {
    try {
      return localStorage.getItem('theme') || 'dark';
    } catch {
      return 'dark';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('theme', uiTheme);
    } catch {}
    const root = document.documentElement;
    root.classList.toggle('dark', uiTheme === 'dark');
    root.classList.toggle('light', uiTheme === 'light');
    root.setAttribute('data-theme', uiTheme);
  }, [uiTheme]);
  const toggleTheme = useCallback(() => {
    setUiTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const { lang, toggleLang, t } = useLocale();
  const isZh = lang === 'zh';
  const loadRecognitionScenarios = useCallback(async () => {
    const merged = new Map<string, { label: string; content: string }>();

    const insert = (label: string, content: string) => {
      const normalizedLabel = (label || '分析场景').trim() || '分析场景';
      const normalizedContent = (content || '').trim();
      if (!normalizedContent) return;
      merged.set(normalizedLabel, { label: normalizedLabel, content: normalizedContent });
    };

    const savedDefaultPrompt = (() => {
      try {
        const val = localStorage.getItem('customRecognitionPrompt');
        return (val && val.trim()) || '';
      } catch {
        return '';
      }
    })();
    insert('默认场景', savedDefaultPrompt || DEFAULT_RECOGNITION_PROMPT);
    insert('门店识别场景', STORE_RECOGNITION_PROMPT);

    try {
      const raw = localStorage.getItem('customRecognitionScenarios');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          arr.forEach((entry: any) => {
            const str = String(entry ?? '').trim();
            if (!str) return;
            const [name, ...rest] = str.split(':');
            const label = (name || '').trim() || '分析场景';
            const content = (rest.length ? rest.join(':') : name || '').trim();
            insert(label, content);
          });
        }
      }
    } catch {
      // ignore malformed local data
    }

    try {
      const resp = await recognitionAPI.getSettings();
      if (resp?.success && resp.data) {
        const { customRecognitionPrompt, recognitionScenarios } = resp.data as any;
        const srvDefault = (typeof customRecognitionPrompt === 'string' && customRecognitionPrompt.trim()) || '';
        if (srvDefault) {
          insert('默认场景', srvDefault);
          try { localStorage.setItem('customRecognitionPrompt', srvDefault); } catch {}
        }
        if (Array.isArray(recognitionScenarios)) {
          const normalized = recognitionScenarios
            .map((item: any) => ({
              label: (item?.name || '').trim() || '分析场景',
              content: String(item?.content || '').trim(),
            }))
            .filter((item) => item.content);
          normalized.forEach((item) => insert(item.label, item.content));
          try {
            const serialized = normalized.map((item) => `${item.label}: ${item.content}`);
            localStorage.setItem('customRecognitionScenarios', JSON.stringify(serialized));
          } catch {}
        }
      }
    } catch (error) {
      console.warn(t('app.recognition.loadError'), error);
    }

    setRecognitionQuickScenarios(Array.from(merged.values()));
  }, [t]);

  useEffect(() => {
    loadRecognitionScenarios().catch((err) => console.warn(t('app.recognition.initError'), err));
    const onUpdate = () => {
      loadRecognitionScenarios().catch((err) => console.warn(t('app.recognition.refreshError'), err));
    };
    window.addEventListener('recognitionScenariosUpdated', onUpdate as EventListener);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('recognitionScenariosUpdated', onUpdate as EventListener);
      window.removeEventListener('storage', onUpdate);
    };
  }, [loadRecognitionScenarios, t]);

  const buildTemplateMeta = useCallback(
    (pick: any): TemplateInfoMeta => {
      const fallbackTitle = t('app.section.shortcuts');
      const title = isZh
        ? pick?.nameZh || pick?.nameEn || pick?.name || fallbackTitle
        : pick?.nameEn || pick?.nameZh || pick?.name || fallbackTitle;
      const bodySource = isZh
        ? pick?.display || pick?.contentZh || pick?.english || ''
        : pick?.contentEn || pick?.english || pick?.content || pick?.display || '';
      const body = bodySource?.toString().trim() || '';
      return {
        title,
        body,
        emoji: pick?.emoji,
      };
    },
    [isZh, t],
  );

  const mapScenarioLabel = useCallback(
    (label: string): string => {
      const trimmed = (label || '').trim();
      if (!trimmed) return trimmed;
      if (trimmed === '默认场景' || trimmed === 'Default Scenario') {
        return isZh ? '默认场景' : 'Default Scenario';
      }
      if (trimmed === '门店识别场景' || trimmed === 'Store Recognition Scenario') {
        return isZh ? '门店识别场景' : 'Store Recognition Scenario';
      }
      if (trimmed === '分析场景' || trimmed === 'Analysis Scenario') {
        return isZh ? '分析场景' : 'Analysis Scenario';
      }
      return trimmed;
    },
    [isZh],
  );

  const buildHistoryContext = useCallback(
    (entry: ImageEditResult): TemplateContextInfo => {
      const created = entry.createdAt ? new Date(entry.createdAt) : new Date();
      const metadata = entry.metadata || {};
      const timestamp = created.toLocaleString(isZh ? 'zh-CN' : 'en-US', { hour12: false });
      const items: TemplateContextInfo['items'] = [
        { label: isZh ? '时间' : 'Time', value: timestamp },
      ];
      const modeLabel = getModeDisplayLabel(entry.mode || 'generate', lang);
      items.push({ label: isZh ? '来源' : 'Source', value: modeLabel });
      if (metadata.model) {
        items.push({ label: isZh ? '模型' : 'Model', value: metadata.model });
      }
      return {
        title: isZh ? '历史回放' : 'History Replay',
        accent: 'history',
        items,
      };
    },
    [isZh, lang],
  );

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

  const handleProcessError = useCallback(
    (msg: string) => {
      setIsProcessing(false);
      setProcessingStatus('error');
      toast.error(t('app.toast.processError', { message: msg }));
    },
    [t],
  );

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

  const applyTemplateSizing = useCallback((pick: any, targetMode: AIMode) => {
    if (modelKey !== 'banana2') return;
    const ratioId = (pick?.ratio ?? '').trim();
    const resId = (pick?.resolution ?? '').trim();
    if (targetMode === 'generate') {
      if (ratioId) {
        const found = ASPECT_RATIO_OPTIONS.find((opt) => opt.id === ratioId);
        if (found) setSelectedRatio(found);
      }
      if (resId) {
        const foundRes = RESOLUTION_OPTIONS.find((opt) => opt.id === resId);
        if (foundRes) setSelectedResolution(foundRes);
      } else if (resId === '') {
        // 不限：保留当前
      }
    } else if (targetMode === 'edit') {
      if (ratioId) {
        const found = ASPECT_RATIO_OPTIONS.find((opt) => opt.id === ratioId) || null;
        setEditSelectedRatio(found);
      } else if (ratioId === '') {
        setEditSelectedRatio(null);
      }
      if (resId) {
        const foundRes = RESOLUTION_OPTIONS.find((opt) => opt.id === resId) || null;
        setEditSelectedResolution(foundRes);
      } else if (resId === '') {
        setEditSelectedResolution(null);
      }
    }
  }, [modelKey]);

  const handleSidebarTemplatePick = useCallback(
    (pick: any) => {
      if (selectedMode !== 'generate') {
        handleModeChange('generate');
      }
      applyTemplateSizing(pick, 'generate');
      const isProTemplate = modelKey === 'banana2' || String(pick?.category || '').includes('pro');
      if (isProTemplate) {
        const badgeTitle = isZh
          ? pick?.nameEn || pick?.name || pick?.nameZh
          : pick?.nameZh || pick?.name || pick?.nameEn;
        const badgeBody = isZh
          ? pick?.contentEn || pick?.english || ''
          : pick?.contentZh || pick?.content || '';
        setTemplateBadgeState({
          status: 'ready',
          template: {
            title: badgeTitle || '',
            body: badgeBody || '',
            emoji: pick?.emoji,
          },
        });
      } else {
        const meta = buildTemplateMeta(pick);
        setTemplateBadgeState({ status: 'loading', template: meta });
      }
      window.dispatchEvent(new CustomEvent('sidebar:generate-template', { detail: pick }));
    },
    [selectedMode, handleModeChange, applyTemplateSizing, isZh, modelKey],
  );

  const handleSidebarEditTemplatePick = useCallback(
    (pick: any) => {
      if (selectedMode !== 'edit') {
        handleModeChange('edit');
      }
      applyTemplateSizing(pick, 'edit');
      const isProTemplate = modelKey === 'banana2' || String(pick?.category || '').includes('pro');
      if (isProTemplate) {
        const badgeTitle = isZh
          ? pick?.nameEn || pick?.name || pick?.nameZh
          : pick?.nameZh || pick?.name || pick?.nameEn;
        const badgeBody = isZh
          ? pick?.contentEn || pick?.english || ''
          : pick?.contentZh || pick?.content || '';
        setTemplateBadgeState({
          status: 'ready',
          template: {
            title: badgeTitle || '',
            body: badgeBody || '',
            emoji: pick?.emoji,
          },
        });
      }
      window.dispatchEvent(new CustomEvent('sidebar:edit-template', { detail: pick }));
    },
    [selectedMode, handleModeChange, applyTemplateSizing, isZh, modelKey],
  );
  const handleSidebarAnalyzeScenarioPick = useCallback(
    (scenario: { label: string; content: string }) => {
      if (selectedMode !== 'analyze') {
        handleModeChange('analyze');
      }
      window.dispatchEvent(new CustomEvent('sidebar:analyze-scenario', { detail: scenario }));
    },
    [selectedMode, handleModeChange],
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

  const [showHistory, setShowHistory] = useState(false);
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
    // 将提示固定在信息胶囊上方，不再依赖弹出 Toast
    if (!showProcessingInBadge) return '';
    if (processingStatus === 'loading') {
      const verb =
        selectedMode === 'generate'
          ? t('app.toast.processing.verb.generate')
            : selectedMode === 'edit'
            ? t('app.toast.processing.verb.edit')
            : t('app.toast.processing.verb.analyze');
      return t('app.toast.processing', { verb });
    }
    if (processingStatus === 'success') {
      return t('app.toast.processing.success');
    }
    if (processingStatus === 'error') {
      return t('app.toast.processing.failure');
    }
    return '';
  }, [processingStatus, selectedMode, showProcessingInBadge, t]);

  if (isLoading) {
    return (
    <div className="flex h-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-primary)]">
        <div className="panel w-full max-w-sm text-center">
          <LoadingSpinner message={t('app.loading.title')} size="large" />
          <p className="mt-4 text-sm text-[var(--text-secondary)]">{t('app.loading.subtitle')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
    <div className="flex h-screen items-center justify中心 bg-[var(--surface-0)] text-[var(--text-primary)]">
        <div className="panel w-full max-w-md space-y-4">
          <ErrorMessage title={t('app.error.title')} message={error} onRetry={initializeSession} />
        </div>
      </div>
    );
  }

  const historyPanelVisible = showHistory;
  const historyDisplayCount = Math.min(mergedHistory.length, 300);
  const historySubtitle = t('app.history.subtitle', { count: historyDisplayCount });

  return (
    <div className="app-shell">
      {isSidebarOpen && <div className="app-sidebar-overlay xl:hidden" onClick={() => setIsSidebarOpen(false)} />}

      <aside className={`app-sidebar ${isSidebarOpen ? 'mobile-open' : ''}`}>
        <div className="app-sidebar__header">
          <div className="app-sidebar__brand">AI</div>
          <div className="app-sidebar__title">
            <strong>{t('app.title')}</strong>
            <div className="mt-1 flex items-center gap-1.5">
              {MODEL_PRESETS.map((m) => {
                const active = m.key === modelKey;
                const baseBtn =
                  'rounded-full px-3 py-1 text-[11px] font-semibold transition-all border border-[var(--border-soft)] bg-transparent text-[var(--text-primary)]/85 hover:translate-y-[-1px] focus-visible:outline-none';
                const stateClass = active
                  ? 'ring-1 ring-[var(--accent)] text-[var(--text-primary)] shadow-[0_10px_30px_-18px_rgba(99,102,241,0.45)]'
                  : 'opacity-90 hover:text-[var(--text-primary)]';
                return (
                  <button
                    key={m.key}
                    type="button"
                    className={`${baseBtn} ${stateClass}`}
                    onClick={() => {
                      setModelKey(m.key);
                      const msg = isZh ? `已切换到 ${m.label}` : `Switched to ${m.label}`;
                      setBadgeInlineMessage(msg);
                    }}
                    title={m.hint || m.label}
                    aria-pressed={active}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="app-sidebar__section" data-scroll-to="workflow">
          <h4>{t('app.section.workflow')}</h4>
          <ModeToggle selectedMode={selectedMode} onModeChange={handleModeChange} isProcessing={isProcessing} />
        </div>

        <div className="app-sidebar__section app-sidebar__section--quick">
          {(selectedMode === 'generate' || selectedMode === 'edit') && (
            <div className="sidebar-quick-group">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-[0.75rem] font-semibold tracking-[0.18em] uppercase text-[var(--text-secondary)] whitespace-nowrap">
                      {isZh ? '图片比例' : 'Aspect ratio'}
                    </span>
                    <select
                      className="flex-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                      value={selectedMode === 'generate' ? selectedRatio.id : editSelectedRatio?.id || ''}
                      onChange={(e) => {
                        if (selectedMode === 'generate') {
                          const next = ASPECT_RATIO_OPTIONS.find((r) => r.id === e.target.value) || ASPECT_RATIO_OPTIONS[0];
                          setSelectedRatio(next);
                        } else {
                          const next = ASPECT_RATIO_OPTIONS.find((r) => r.id === e.target.value) || null;
                          setEditSelectedRatio(next);
                        }
                      }}
                    >
                      {selectedMode === 'edit' && (
                        <option value="">
                          {isZh ? '不限' : 'Auto'}
                        </option>
                      )}
                      {ASPECT_RATIO_OPTIONS.map((ratio) => {
                        const ratioLabel = isZh ? (ratio.labelZh || ratio.label) : (ratio.labelEn || ratio.label);
                        return (
                          <option key={ratio.id} value={ratio.id}>
                            {ratioLabel}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-[0.75rem] font-semibold tracking-[0.18em] uppercase text-[var(--text-secondary)] whitespace-nowrap">
                      {isZh ? '分辨率' : 'Resolution'}
                    </span>
                    <select
                      className="flex-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                      value={selectedMode === 'generate' ? selectedResolution.id : editSelectedResolution?.id || ''}
                      onChange={(e) => {
                        if (selectedMode === 'generate') {
                          const next = RESOLUTION_OPTIONS.find((r) => r.id === e.target.value) || RESOLUTION_OPTIONS[0];
                          setSelectedResolution(next);
                        } else {
                          const next = RESOLUTION_OPTIONS.find((r) => r.id === e.target.value) || null;
                          setEditSelectedResolution(next);
                        }
                      }}
                    >
                      {selectedMode === 'edit' && (
                        <option value="">
                          {isZh ? '不限' : 'Auto'}
                        </option>
                      )}
                      {RESOLUTION_OPTIONS.map((res) => {
                        const label = isZh ? (res.labelZh || res.label) : (res.labelEn || res.label);
                        const tierBlocked = !allowedResolutionSet.has(res.id);
                        const bananaBlocked = selectedMode === 'generate' && modelKey === 'banana1' && res.id !== '1K';
                        const disabled = bananaBlocked || tierBlocked;
                        return (
                          <option
                            key={res.id}
                            value={res.id}
                            disabled={disabled}
                          >
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="text-xs text-[var(--text-secondary)] text-right opacity-80">
                  {selectedMode === 'generate'
                    ? `${isZh ? '参考分辨率' : 'Reference size'}: ${canvasSize.width}x${canvasSize.height}px`
                    : isZh
                      ? '默认跟随输入图片尺寸'
                      : 'Defaults to input image'}
                </div>
              </div>
            </div>
          )}

          <div className="sidebar-quick-group">
            <h4>
              {selectedMode === 'edit'
                ? t('app.quick.editTemplates')
                : selectedMode === 'analyze'
                  ? t('app.quick.analyzeTemplates')
                  : t('app.quick.bestPractices')}
            </h4>
            {selectedMode === 'generate' ? (
              <div className="sidebar-quick-scroll">
                <QuickTemplates
                  selectedMode="generate"
                  modelKey={modelKey}
                  variant="list"
                  dense
                  framed
                  onSelectTemplate={handleSidebarTemplatePick}
                  onManageTemplates={() => {}}
                />
              </div>
            ) : selectedMode === 'edit' ? (
              <div className="sidebar-quick-scroll">
                <QuickTemplates
                  selectedMode="edit"
                  modelKey={modelKey}
                  variant="list"
                  dense
                  framed
                  maxItems={Number.POSITIVE_INFINITY}
                  onSelectTemplate={handleSidebarEditTemplatePick}
                  onManageTemplates={() => {}}
                />
              </div>
            ) : selectedMode === 'analyze' ? (
              <div className="sidebar-quick-scroll">
                {recognitionQuickScenarios.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {recognitionQuickScenarios.slice(0, 12).map((scenario, idx) => {
                      const symbol = idx === 0 ? '⭐' : idx === 1 ? '🏪' : '🔍';
                      const cardClass = [
                        'group relative w-full overflow-hidden rounded-md px-2.5 py-2 text-left transition-all duration-150',
                        'grid grid-cols-[auto,1fr] gap-2 items-center',
                        'bg-transparent hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/45 focus-visible:ring-offset-1 text-[var(--text-primary)]',
                      ].join(' ');
                      const iconClass = [
                        'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold leading-none transition-all duration-200',
                        'bg-emerald-400/15 text-emerald-100 ring-1 ring-emerald-400/35 group-hover:bg-emerald-400/25 group-hover:text-emerald-50',
                      ].join(' ');
                      const displayLabel = mapScenarioLabel(scenario.label);
                      const applyAnalyzeLabelPrefix = isZh ? '应用分析模板' : 'Apply analysis template';
                      const separator = isZh ? '：' : ': ';
                      return (
                        <button
                          key={`${scenario.label}-${idx}`}
                          type="button"
                          className={cardClass}
                          onClick={() => handleSidebarAnalyzeScenarioPick(scenario)}
                          title={scenario.content}
                          aria-label={`${applyAnalyzeLabelPrefix}${separator}${displayLabel}`}
                        >
                          <span className={iconClass}>{symbol}</span>
                          <span className="flex min-w-0 flex-col text-left">
                            <span className="truncate text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--text-primary)]">
                              {displayLabel}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="sidebar-hint text-xs text-[var(--text-secondary)]">
                    {t('app.sidebar.analyze.placeholder')}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="app-sidebar__footer">
          <div className="sidebar-footer-actions">
            <button
              type="button"
              className="sidebar-footer-button"
              onClick={toggleTheme}
              title={uiTheme === 'dark' ? t('app.sidebar.theme.light') : t('app.sidebar.theme.dark')}
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
              title={t('app.sidebar.history.toggle')}
              aria-label={t('app.sidebar.history.toggle')}
              aria-pressed={historyPanelVisible}
            >
              <ClockIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="sidebar-footer-button"
              onClick={toggleLang}
              title={t('app.sidebar.language.toggle')}
              aria-label={t('app.sidebar.language.toggle')}
            >
              <span className="text-xs font-semibold">{isZh ? '中' : 'En'}</span>
            </button>
            <button
              type="button"
              className="sidebar-footer-button"
              onClick={() => setShowSystemPromptModal(true)}
              title={t('app.sidebar.prompt.settings')}
              aria-label={t('app.sidebar.prompt.open')}
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
              aria-label={t('app.sidebar.expand')}
            >
              <Bars3Icon className="h-5 w-5" />
            </button>
          </div>
          <div className="app-header__center">
            <TemplateInfoBadge
              status={templateBadgeState.status}
              template={templateBadgeState.template}
              message={templateBadgeState.message}
              modeLabel={getModeDisplayLabel(selectedMode, lang)}
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
                className={`icon-button xl:hidden ${historyPanelVisible ? 'border-[var(--accent)]/45 bg-[var(--accent-soft)] text-[var(--text-primary)]' : ''}`}
                onClick={toggleHistory}
                aria-label={t('app.sidebar.history.toggle')}
                aria-pressed={historyPanelVisible}
              >
                <ClockIcon className="h-5 w-5" />
              </button>
            )}
            {authUser && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full border border-[var(--border-soft,#334155)] bg-[var(--surface-1,#111827)] px-1.5 py-1 text-sm text-[var(--text-primary,#e2e8f0)] shadow-sm hover:border-[var(--accent,#8b5cf6)]/50"
                  aria-label={isZh ? '用户菜单' : 'User menu'}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent,#8b5cf6)] text-base font-bold text-white">
                    {avatarDisplay}
                  </span>
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-[var(--border-soft,#334155)] bg-[var(--surface-1,#111827)] p-3 shadow-xl">
                  <div className="rounded-md bg-[var(--surface-0,#0f172a)] px-3 py-2 mb-2">
                    <div className="text-sm font-semibold text-[var(--text-primary,#e2e8f0)]">
                      {isZh ? '头像选择' : 'Avatar'}
                    </div>
                    <div className="mt-2 grid grid-cols-5 gap-2">
                      {avatarPalette.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={`h-9 w-full rounded-full border text-base flex items-center justify-center transition ${
                            avatarDisplay === opt
                              ? 'border-[var(--accent,#8b5cf6)] bg-[var(--accent-soft,#2a1e4a)] text-[var(--text-primary,#e2e8f0)]'
                              : 'border-[var(--border-soft,#334155)] text-[var(--text-primary,#e2e8f0)] hover:border-[var(--accent,#8b5cf6)]'
                          }`}
                          onClick={() => onAvatarChange(opt)}
                          aria-label={isZh ? `选择头像 ${opt}` : `Choose avatar ${opt}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      className="mt-2 flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-[var(--text-primary,#e2e8f0)] hover:bg-[var(--accent-soft,#2a1e4a)]"
                      onClick={() => {
                        setShowAdminConsole(true);
                        setUserMenuOpen(false);
                      }}
                    >
                      <span>{isZh ? '管理后台' : 'Admin console'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="mt-2 flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-[var(--text-primary,#e2e8f0)] hover:bg-[var(--accent-soft,#2a1e4a)]"
                    onClick={async () => {
                      setUserMenuOpen(false);
                        if (onLogout) await onLogout();
                      }}
                    >
                      <span>{isZh ? '退出登录' : 'Log out'}</span>
                      <span className="text-[11px] text-[var(--text-secondary,#cbd5e1)]">⌘Q</span>
                    </button>
                  </div>
                )}
              </div>
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
              historyPanelVisible={historyPanelVisible}
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
              modelId={activeModel.modelId}
              modelLabel={activeModel.label}
              selectedResolution={selectedResolution}
              editSelectedRatio={editSelectedRatio}
              editSelectedResolution={editSelectedResolution}
              canvasSize={canvasSize}
            />
          </div>

          {historyPanelVisible && (
            <>
              <aside className={`app-history-panel ${historyPanelVisible ? 'open' : ''}`}>
                <div className="app-history-panel__header">
                  <div className="app-history-panel__title">
                    <strong>{t('app.history.title')}</strong>
                    <span>{historySubtitle}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => historyClearRef.current?.()}
                      aria-label={t('app.history.clearAll')}
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setShowHistory(false)}
                    aria-label={t('app.history.close')}
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
                      setBadgeInlineMessage(t('app.history.capsule.deleted'));
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
                      setBadgeInlineMessage(t('app.history.capsule.cleared'));
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
          console.log(isZh ? '保存提示词:' : 'Saving prompts:', prompts);
          setShowSystemPromptModal(false);
        }}
      />

      {isAdmin && showAdminConsole && (
        <AdminConsole
          onClose={() => setShowAdminConsole(false)}
          isZh={isZh}
          userAvatar={userAvatar}
          onAvatarChange={handleAvatarChange}
        />
      )}

      {/* 恢复错误提示的可见弹窗，主要用于后端异常告警 */}
      <Toaster position="top-center" toastOptions={{ duration: 3800 }} />
    </div>
  );
};

const AppShell: React.FC = () => {
  const [authLoading, setAuthLoading] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [allowedSuffixes, setAllowedSuffixes] = useState<string[]>([]);
  const [userAvatar, setUserAvatar] = useState(() => {
    try {
      return localStorage.getItem('userAvatar') || '';
    } catch {
      return '';
    }
  });
  const [emailLocal, setEmailLocal] = useState('');
  const [emailSuffix, setEmailSuffix] = useState('cotticoffee.com');
  const [requestingLink, setRequestingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [authError, setAuthError] = useState('');
  const [tokenProcessing, setTokenProcessing] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('authToken');
    } catch {
      return null;
    }
  });

  const applyAuthToken = useCallback((token: string | null) => {
    if (token) {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      try {
        localStorage.setItem('authToken', token);
      } catch {}
    } else {
      delete apiClient.defaults.headers.common['Authorization'];
      try {
        localStorage.removeItem('authToken');
      } catch {}
    }
    setAuthToken(token);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const cfgResp = await authAPI.getConfig();
        const cfg = cfgResp.data || {};
        setAuthEnabled(!!cfg.emailAuthEnabled);
        const suffixes = cfg.allowedEmailSuffixes || [];
        setAllowedSuffixes(suffixes);
        if (suffixes.length > 0) {
          setEmailSuffix(suffixes[0]);
        } else {
          setEmailSuffix('cotticoffee.com');
        }
        if (cfg.emailAuthEnabled) {
          if (authToken) {
            applyAuthToken(authToken);
          }
          try {
            const meResp = await authAPI.me();
            if (meResp?.data?.user) {
              setAuthUser(meResp.data.user);
            }
          } catch (e: any) {
            // unauthenticated is expected before login
            const msg = e?.error || e?.message;
            if (msg) setAuthError(String(msg));
          }
        }
      } catch (err: any) {
        setAuthError(err?.message || '无法加载认证配置');
      } finally {
        setAuthLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!authEnabled) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return;

    const cleanUrl = () => {
      const url = window.location.origin + window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, url);
    };

    const consume = async () => {
      setTokenProcessing(true);
      try {
        const resp = await authAPI.callback(token);
        if (resp?.data?.user) {
          if (resp.data.token) applyAuthToken(resp.data.token);
          setAuthUser(resp.data.user);
          toast.success('登录成功');
        } else {
          toast.error('登录失败');
        }
      } catch (err: any) {
        toast.error(err?.error || err?.message || '登录失败');
      } finally {
        setTokenProcessing(false);
        cleanUrl();
      }
    };
    consume();
  }, [authEnabled]);

  const handleRequestLink = async () => {
    const local = emailLocal.trim();
    const suffix = emailSuffix || allowedSuffixes[0] || 'cotticoffee.com';
    if (!local) {
      toast.error('请输入有效邮箱名');
      return;
    }
    const email = `${local}@${suffix}`;
    setRequestingLink(true);
    try {
      const redirectUrl = window.location.origin + window.location.pathname;
      await authAPI.requestLink(email.trim(), redirectUrl);
      setLinkSent(true);
      toast.success('登录链接已发送，请检查邮箱');
    } catch (err: any) {
      toast.error(err?.error || err?.message || '发送失败');
    } finally {
      setRequestingLink(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch {}
    applyAuthToken(null);
    setAuthUser(null);
    setLinkSent(false);
    toast.success('已退出登录');
  };

  const handleAvatarChange = (val: string) => {
    setUserAvatar(val);
    try {
      localStorage.setItem('userAvatar', val);
    } catch {}
  };

  if (authLoading || tokenProcessing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-0,#0f172a)] text-[var(--text-primary,#e5e7eb)]">
        <LoadingSpinner message="正在加载认证状态..." size="large" />
        <Toaster position="top-center" toastOptions={{ duration: 3800 }} />
      </div>
    );
  }

  if (authEnabled && !authUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-0,#0f172a)] px-4 text-[var(--text-primary,#e5e7eb)]">
        <div className="w-full max-w-md rounded-2xl border border-[var(--border-soft,#334155)] bg-[var(--surface-1,#111827)] p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--text-secondary,#cbd5e1)]">邮箱登录</p>
              <h1 className="text-xl font-bold text-[var(--text-primary,#e2e8f0)]">仅限公司邮箱</h1>
            </div>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
              受限访问
            </span>
          </div>
            <div className="space-y-3">
              <label className="block text-sm text-[var(--text-secondary,#cbd5e1)]">邮箱地址</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={emailLocal}
                  onChange={(e) => setEmailLocal(e.target.value)}
                  placeholder="name"
                  className="flex-1 rounded-lg border border-[var(--border-soft,#334155)] bg-[var(--surface-input,#0b1220)] px-3 py-2 text-sm text-[var(--text-primary,#e5e7eb)] focus:border-[var(--accent,#8b5cf6)] focus:outline-none"
                />
                <span className="px-1 flex items-center text-sm text-[var(--text-secondary,#cbd5e1)]">@</span>
                <select
                  value={emailSuffix}
                  onChange={(e) => setEmailSuffix(e.target.value)}
                  className="min-w-[150px] rounded-lg border border-[var(--border-soft,#334155)] bg-[var(--surface-input,#0b1220)] px-3 py-2 text-sm text-[var(--text-primary,#e5e7eb)] focus:border-[var(--accent,#8b5cf6)] focus:outline-none"
                >
                  {(allowedSuffixes.length ? allowedSuffixes : ['cotticoffee.com']).map((suf) => (
                    <option key={suf} value={suf}>{suf}</option>
                  ))}
                </select>
              </div>
              {allowedSuffixes.length > 0 && (
                <p className="text-xs text-[var(--text-secondary,#cbd5e1)]">
                  允许后缀：{allowedSuffixes.map((s) => `@${s}`).join('，')}
                </p>
            )}
            {authError && <p className="text-xs text-red-400">{authError}</p>}
            {linkSent && (
              <p className="text-xs text-emerald-300">
                登录链接已发送到邮箱，如未收到可重试或检查垃圾邮件。
              </p>
            )}
            <button
              type="button"
              onClick={handleRequestLink}
              disabled={requestingLink}
              className="mt-2 w-full rounded-lg bg-[var(--accent,#8b5cf6)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {requestingLink ? '发送中...' : '发送登录链接'}
            </button>
          </div>
        </div>
        <Toaster position="top-center" toastOptions={{ duration: 3800 }} />
      </div>
    );
  }

  return (
    <SessionProvider>
      <AppContent
        authUser={authUser}
        onLogout={handleLogout}
        userAvatar={userAvatar}
        onAvatarChange={handleAvatarChange}
      />
    </SessionProvider>
  );
};

const App: React.FC = () => (
  <LocaleProvider>
    <AppShell />
  </LocaleProvider>
);

export default App;
