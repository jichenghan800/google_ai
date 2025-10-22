export type SupportedLang = 'zh' | 'en';

type TranslationEntry = {
  zh: string;
  en: string;
};

type TranslationRecord = Record<string, TranslationEntry>;

const translations: TranslationRecord = {
  'app.title': { zh: 'AI 图像工作台', en: 'AI Image Studio' },
  'app.subtitle': { zh: 'Vertex AI · 多模态体验', en: 'Vertex AI · Multimodal Experience' },
  'app.section.workflow': { zh: '工作流模式', en: 'Workflow Modes' },
  'app.section.canvas': { zh: '画布选择', en: 'Canvas Selection' },
  'app.section.shortcuts': { zh: '常用方案', en: 'Quick Actions' },
  'app.quick.editTemplates': { zh: '指令模板', en: 'Edit Templates' },
  'app.quick.analyzeTemplates': { zh: '分析模板', en: 'Analysis Templates' },
  'app.quick.bestPractices': { zh: '最佳实践', en: 'Best Practices' },
  'app.sidebar.analyze.placeholder': { zh: '可在系统提示词中配置分析模板', en: 'Configure analysis templates in the system prompt settings' },
  'app.sidebar.theme.light': { zh: '切换至浅色模式', en: 'Switch to Light Mode' },
  'app.sidebar.theme.dark': { zh: '切换至深色模式', en: 'Switch to Dark Mode' },
  'app.sidebar.history.toggle': { zh: '切换历史记录面板', en: 'Toggle history panel' },
  'app.sidebar.language.toggle': { zh: '切换界面语言', en: 'Toggle interface language' },
  'app.sidebar.prompt.settings': { zh: '系统提示词配置', en: 'System prompt settings' },
  'app.sidebar.prompt.open': { zh: '打开系统提示词', en: 'Open system prompt' },
  'app.sidebar.expand': { zh: '展开导航', en: 'Open navigation' },
  'app.history.title': { zh: '生成历史', en: 'Generation History' },
  'app.history.subtitle': { zh: '最近 {{count}} 条任务', en: 'Latest {{count}} tasks' },
  'app.history.clearAll': { zh: '清空历史', en: 'Clear history' },
  'app.history.close': { zh: '关闭历史面板', en: 'Close history panel' },
  'app.history.capsule.deleted': { zh: '已删除 1 条历史', en: 'Deleted 1 history item' },
  'app.history.capsule.cleared': { zh: '已清空历史', en: 'History cleared' },
  'app.recognition.genericScenario': { zh: '分析场景', en: 'Analysis Scenario' },
  'app.recognition.defaultScenario': { zh: '默认场景', en: 'Default Scenario' },
  'app.recognition.storeScenario': { zh: '门店识别场景', en: 'Store Recognition Scenario' },
  'app.recognition.loadError': { zh: '加载图片分析场景失败:', en: 'Failed to load recognition scenarios:' },
  'app.recognition.initError': { zh: '初始化图片分析场景失败:', en: 'Failed to initialize recognition scenarios:' },
  'app.recognition.refreshError': { zh: '刷新图片分析场景失败:', en: 'Failed to refresh recognition scenarios:' },
  'app.loading.title': { zh: '正在唤醒工作台...', en: 'Warming up the workspace…' },
  'app.loading.subtitle': {
    zh: '正在初始化多模态服务，请稍候…',
    en: 'Initializing multimodal services, please wait…',
  },
  'app.error.title': { zh: '会话初始化失败', en: 'Failed to initialize session' },
  'app.toast.processError': { zh: '处理失败: {{message}}', en: 'Processing failed: {{message}}' },
  'app.toast.processing': { zh: 'AI 正在{{verb}}', en: 'AI is {{verb}}' },
  'app.toast.processing.verb.generate': { zh: '创作中…', en: 'creating…' },
  'app.toast.processing.verb.edit': { zh: '编辑中…', en: 'editing…' },
  'app.toast.processing.verb.analyze': { zh: '分析中…', en: 'analyzing…' },
  'app.toast.processing.success': { zh: '处理完成！', en: 'Processing complete!' },
  'app.toast.processing.failure': { zh: '处理失败，请稍后重试', en: 'Processing failed, please try again later' },
  'loading.default': { zh: '加载中...', en: 'Loading…' },
};

const INTERPOLATION_PATTERN = /{{\s*([\w.-]+)\s*}}/g;

export type TranslationKey = keyof typeof translations;

export const translate = (
  lang: SupportedLang,
  key: TranslationKey,
  replacements: Record<string, string | number> = {},
): string => {
  const entry = translations[key];
  const template = entry?.[lang] ?? entry?.zh ?? key;
  return template.replace(INTERPOLATION_PATTERN, (_, rawKey) => {
    const replacement = replacements[rawKey];
    return replacement !== undefined ? String(replacement) : '';
  });
};

export const hasTranslation = (key: string): key is TranslationKey => key in translations;

export const getTranslations = () => translations;
