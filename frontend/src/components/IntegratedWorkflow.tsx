import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { ImageEditResult, AspectRatioOption, ImageAnalysisResult, ResolutionOption } from '../types/index.ts';
import { AnalysisResult } from './AnalysisResult.tsx';
import { recognitionAPI, templateAPI } from '../services/api.ts';
import { evaluatePromptQuality } from '../utils/promptQuality.ts';
import { DEFAULT_RECOGNITION_PROMPT, STORE_RECOGNITION_PROMPT } from '../constants/recognitionDefaults.ts';
import { ModeToggle, AIMode } from './ModeToggle.tsx';
import { DynamicInputArea } from './DynamicInputArea.tsx';
import { DraggableActionButton } from './DraggableActionButton.tsx';
import { TemplateInfoBadge, TemplateInfoStatus, TemplateInfoMeta } from './TemplateInfoBadge.tsx';
import { ImageAnnotatorModal } from './ImageAnnotatorModal.tsx';
import { getModeDisplayLabel } from '../constants/modeLabels.ts';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { ASPECT_RATIO_OPTIONS } from '../constants/aspectRatios.ts';
import { resolveTemplateEmoji } from '../utils/templateEmoji.ts';
import { useLocale } from '../contexts/LocaleContext.tsx';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB，与后端 multer 限制一致
const MAX_UPLOAD_LONG_EDGE = 4096; // 最长边 4096px，符合 Banana 模型支持上限

const formatBytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)}MB`;

const uploadLog = (...args: any[]) => {
  try {
    console.info('[upload]', ...args);
  } catch {}
};

const detectWebpSupport = () => {
  try {
    const canvas = document.createElement('canvas');
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
};

const readImageFromFile = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
};

const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string, quality?: number) => {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to encode image'));
      }
    }, mimeType, quality);
  });
};

const stripJpegMetadata = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  if (view.getUint16(0) !== 0xffd8) return file;
  let offset = 2;
  const chunks: Uint8Array[] = [new Uint8Array(buffer.slice(0, 2))];
  while (offset + 4 <= buffer.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda) {
      chunks.push(new Uint8Array(buffer.slice(offset)));
      break;
    }
    const length = view.getUint16(offset + 2);
    const segmentEnd = offset + 2 + length;
    const isMetadata = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!isMetadata) {
      chunks.push(new Uint8Array(buffer.slice(offset, segmentEnd)));
    }
    offset = segmentEnd;
  }
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(size);
  let cursor = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, cursor);
    cursor += chunk.length;
  });
  return new File([output], file.name, { type: file.type || 'image/jpeg' });
};

const compressImageFile = async (file: File) => {
  const originalSize = file.size;
  const img = await readImageFromFile(file);
  const scale = Math.min(1, MAX_UPLOAD_LONG_EDGE / Math.max(img.width, img.height));
  let targetWidth = Math.max(1, Math.round(img.width * scale));
  let targetHeight = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const supportsWebp = detectWebpSupport();
  const targetMime = supportsWebp && !file.type.includes('jpeg') ? 'image/webp' : 'image/jpeg';
  let quality = 0.92;
  let blob = await canvasToBlob(canvas, targetMime, quality);
  let attempts = 0;
  while (blob.size > MAX_UPLOAD_BYTES && quality > 0.6 && attempts < 6) {
    quality -= 0.07;
    blob = await canvasToBlob(canvas, targetMime, quality);
    attempts += 1;
  }
  if (blob.size > MAX_UPLOAD_BYTES && Math.max(targetWidth, targetHeight) > 2048) {
    const downScale = 2048 / Math.max(targetWidth, targetHeight);
    targetWidth = Math.max(1, Math.round(targetWidth * downScale));
    targetHeight = Math.max(1, Math.round(targetHeight * downScale));
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    quality = Math.min(quality, 0.85);
    blob = await canvasToBlob(canvas, targetMime, quality);
  }
  let softAttempts = 0;
  while (blob.size > MAX_UPLOAD_BYTES && softAttempts < 3) {
    quality = Math.max(0.4, quality - 0.1);
    const shrink = 0.88;
    targetWidth = Math.max(1, Math.round(targetWidth * shrink));
    targetHeight = Math.max(1, Math.round(targetHeight * shrink));
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    blob = await canvasToBlob(canvas, targetMime, quality);
    softAttempts += 1;
  }
  const ext = targetMime === 'image/webp' ? 'webp' : 'jpg';
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
  const out = new File([blob], `${baseName}.${ext}`, { type: blob.type });
  uploadLog('compress result', {
    name: out.name,
    before: formatBytes(originalSize),
    after: formatBytes(out.size),
    dims: `${targetWidth}x${targetHeight}`,
    mime: out.type
  });
  return out;
};

type ImageOrientation = 'portrait' | 'landscape' | 'square' | 'unknown';

interface IntegratedWorkflowProps {
  onProcessComplete: (result: ImageEditResult) => void;
  sessionId: string | null;
  isProcessing?: boolean;
  processingStatus?: 'idle' | 'loading' | 'success' | 'error';
  selectedMode?: AIMode;
  currentResult?: ImageEditResult | null;
  historySelection?: ImageEditResult | null;
  historyPromptDraft?: ImageEditResult | null;
  onHistoryPromptDraftConsumed?: () => void;
  onExitHistoryPlayback?: () => void;
  onClearResult?: () => void;
  onModeChange?: (mode: AIMode) => void;
  showSystemPromptModal?: boolean;
  onCloseSystemPromptModal?: () => void;
  onOpenSystemPromptModal?: () => void;
  onProcessStart?: () => void;
  onProcessError?: (error: string) => void;
  onToggleHistory?: () => void;
  historyPanelVisible?: boolean;
  showModeSwitch?: boolean;
  selectedRatio: AspectRatioOption;
  onRatioChange: (ratio: AspectRatioOption) => void;
  ratioOptions?: AspectRatioOption[];
  modelId?: string;
  modelLabel?: string;
  selectedResolution: ResolutionOption;
  editSelectedRatio?: AspectRatioOption | null;
  editSelectedResolution?: ResolutionOption | null;
  canvasSize: { width: number; height: number };
}

// 工具函数：URL转File
const urlToFile = async (url: string, filename: string): Promise<File> => {
  const tryFetch = async (target: string) => {
    const resp = await fetch(target);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const type = blob.type || 'image/png';
    return new File([blob], filename, { type });
  };

  // 1) 原始 URL
  try {
    return await tryFetch(url);
  } catch (e) {
    // fall through
  }

  // 2) 后端代理，处理无 CORS 的存储地址
  try {
    const proxied = `${API_BASE_URL}/edit/image-proxy?url=${encodeURIComponent(url)}`;
    return await tryFetch(proxied);
  } catch (err: any) {
    console.warn('urlToFile failed for', url, err);
    throw err;
  }
};

// 工具函数：DataURL转File
const dataURLtoFile = (dataurl: string, filename: string): File => {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
};

// 工具函数：保持原样（不强制添加 Markdown 标记）
const ensureMarkdown = (text: string): string => text;

type TemplatePickPayload = {
  display?: string;
  english?: string;
  id?: string;
  name?: string;
  nameZh?: string;
  nameEn?: string;
  content?: string;
  contentZh?: string;
  contentEn?: string;
  emoji?: string;
  category?: string;
  type?: string;
  ratio?: string;
  resolution?: string;
  defaultImageUrl?: string;
  defaultImageKey?: string;
};

type TemplateBadgeEventPayload = {
  status: TemplateInfoStatus;
  template?: TemplateInfoMeta;
  message?: string;
};

const emitTemplateInfoEvent = (payload: TemplateBadgeEventPayload) => {
  try {
    window.dispatchEvent(new CustomEvent('template:active-info', { detail: payload }));
  } catch {}
};

export const IntegratedWorkflow: React.FC<IntegratedWorkflowProps> = ({
  onProcessComplete,
  sessionId,
  isProcessing = false,
  processingStatus = 'idle',
  selectedMode = 'generate',
  currentResult,
  historySelection = null,
  historyPromptDraft = null,
  onHistoryPromptDraftConsumed,
  onExitHistoryPlayback,
  onClearResult,
  onModeChange,
  showSystemPromptModal = false,
  onCloseSystemPromptModal,
  onOpenSystemPromptModal,
  onProcessStart,
  onProcessError,
  onToggleHistory,
  historyPanelVisible = false,
  showModeSwitch = true,
  selectedRatio,
  onRatioChange,
  ratioOptions = ASPECT_RATIO_OPTIONS,
  modelId = 'gemini-2.5-flash-image',
  modelLabel = 'Banana',
  selectedResolution,
  editSelectedRatio = null,
  editSelectedResolution = null,
  canvasSize,
}) => {
  const { lang } = useLocale();
  const isZh = lang === 'zh';
  const isBananaPro = useMemo(() => {
    const id = (modelId || '').toLowerCase();
    const label = (modelLabel || '').toLowerCase();
    return id.includes('banana2') || id.includes('pro') || label.includes('bananapro') || label.includes('pro');
  }, [modelId, modelLabel]);
  const text = useMemo(
    () => ({
      aiAnalyzing: isZh ? 'AI 正在分析' : 'AI is analyzing',
      aiGenerating: isZh ? 'AI 正在生成' : 'AI is generating',
      aiEditing: isZh ? 'AI 正在编辑' : 'AI is editing',
      aiPromptRefinement: isZh ? 'AI优化提示词' : 'AI prompt refinement',
      aiProcessingFailed: isZh ? 'AI处理失败' : 'AI processing failed',
      uploadNewImages: isZh ? '上传新图片参与编辑' : 'Upload new images to continue editing',
      uploadPolicyViolation:
        isZh
          ? '上传的图片或编辑指令不符合AI安全政策要求'
          : 'Uploaded images or edit instructions violate AI safety guidelines',
      downloadImage: isZh ? '下载图片' : 'Download image',
      sessionNotInitialized: isZh ? '会话未初始化，请刷新页面重试' : 'Session not initialized, please refresh and try again',
      examplePromptGenerate:
        isZh
          ? '例如：一只沐浴晨光的贵宾犬在玻璃温室里喝茶，镜头细节突出，菲林质感'
          : 'Example: A poodle bathed in morning light drinking tea in a glass conservatory, cinematic details, film texture',
      examplePromptAnalyze:
        isZh
          ? '例如：分析图片中的主要元素和构图特点（支持 Markdown）'
          : 'Example: Analyze key elements and composition of the image (supports Markdown)',
      examplePromptEdit:
        isZh
          ? '例如：将背景改为海滩，并加入低饱和夕阳光晕'
          : 'Example: Change the background to a beach with a low-saturation sunset glow',
      beforeLabel: isZh ? '修改前' : 'Before',
      afterLabel: isZh ? '修改后' : 'After',
      closePreview: isZh ? '关闭预览' : 'Close preview',
      contentPolicyViolation: isZh ? '内容政策违规' : 'Content policy violation',
      contentRejected: isZh ? '内容被拒绝' : 'Content rejected',
      analyze: isZh ? '分析' : 'Analyze',
      analyzing: isZh ? '分析中' : 'Analyzing',
      analysisScenario: isZh ? '分析场景' : 'Analysis scenario',
      analysisResult: isZh ? '分析结果' : 'Analysis result',
      creationCanvas: isZh ? '创作画布' : 'Creation canvas',
      deleteImage: isZh ? '删除图片' : 'Delete image',
      loadEditTemplatesFailed: isZh ? '加载编辑模板失败' : 'Failed to load edit templates',
      policyViolationDetails:
        isZh
          ? '可能原因：\n• 图片包含敏感内容\n• 编辑指令涉及不当内容\n• 图片质量或格式问题\n\n建议：\n• 更换其他图片\n• 修改编辑指令\n• 检查图片是否清晰可识别'
          : 'Possible reasons:\n• Image contains sensitive content\n• Edit instructions involve inappropriate content\n• Image quality or format issues\n\nSuggestions:\n• Try another image\n• Adjust the edit instructions\n• Ensure the image is clear and recognizable',
      requestFailureDetails:
        isZh
          ? '可能原因：\n• 网络连接问题\n• 服务器暂时不可用\n• 请求超时\n\n建议：\n• 检查网络连接\n• 稍后重试\n• 尝试简化提示词'
          : 'Possible reasons:\n• Network connection issues\n• Server temporarily unavailable\n• Request timed out\n\nSuggestions:\n• Check your connection\n• Try again later\n• Simplify the prompt',
      recognitionBackfillFailed: isZh ? '回填识别设置失败:' : 'Failed to backfill recognition settings:',
      analysisRequiresImage: isZh ? '图片分析模式需要上传至少一张图片' : 'Image analysis mode requires at least one uploaded image',
      generationError: isZh ? '图片生成过程中发生错误' : 'An error occurred during image generation',
      moveImageFailed: isZh ? '图片迁移失败:' : 'Failed to move image:',
      processingFailed: isZh ? '处理失败' : 'Processing failed',
      processingFailedColon: isZh ? '处理失败:' : 'Processing failed:',
      autoLoadIntoEdit: isZh ? '已自动加载生成的图片到编辑模式' : 'Loaded generated image into edit mode automatically',
      quickTemplateFallback: isZh ? '常用方案' : 'Quick actions',
      sensitivePromptSuggestions:
        isZh
          ? '建议：\n• 调整提示词内容\n• 避免使用可能被视为敏感的词汇\n• 尝试更换描述方式'
          : 'Suggestions:\n• Adjust the prompt content\n• Avoid potentially sensitive wording\n• Try a different description',
      actionStart: isZh ? '开始' : 'Start',
      quickTemplate: isZh ? '快捷模板' : 'Quick template',
      promptOptimizeFailed: isZh ? '提示词优化失败:' : 'Prompt optimization failed:',
      promptSensitiveRejected: isZh ? '提示词包含敏感信息被AI拒绝' : 'Prompt rejected due to sensitive content',
      undoAutoOptimize: isZh ? '撤销自动优化' : 'Undo auto-optimization',
      newUpload: isZh ? '新上传图片' : 'New upload',
      uploadTooLargeTitle: isZh ? '图片过大' : 'Image too large',
      uploadTooLargeDetail: isZh ? '单张图片需小于等于 10MB，请压缩后重试。' : 'Each image must be 10MB or smaller. Please compress and try again.',
      uploadTooWideTitle: isZh ? '图片分辨率过高' : 'Image resolution too large',
      uploadTooWideDetail: isZh ? '目前仅支持长边不超过 4096px 的图片，请缩小后重试。' : 'Supported images have the longest edge of 4096px or less. Please resize and try again.',
      uploadOptimizeTitle: isZh ? '优化大图以便上传' : 'Optimize large images before upload',
      uploadOptimizeHint: isZh
        ? '检测到超过 10MB 的图片，可选择无损去除元数据或自动压缩（会缩放到最长边 4096px）。'
        : 'Images over 10MB detected. You can strip metadata (lossless) or auto-compress (scales longest edge to 4096px).',
      uploadOptimizeLossless: isZh ? '无损瘦身（去除元数据）' : 'Lossless trim (strip metadata)',
      uploadOptimizeLosslessNote: isZh ? '仅 JPEG 支持无损去除元数据，若仍超过 10MB 可尝试压缩。' : 'Lossless metadata stripping works for JPEG only. If still over 10MB, try compressing.',
      uploadOptimizeCompress: isZh ? '自动压缩并上传' : 'Auto-compress and upload',
      uploadOptimizeCancel: isZh ? '取消' : 'Cancel',
      uploadOptimizeWorking: isZh ? '处理中…' : 'Processing…',
      uploadOptimizeFailed: isZh ? '优化后仍超过 10MB，建议先压缩图片后再上传。' : 'Still over 10MB after optimization. Please compress and retry.',
      uploadOptimizeFailedWithSize: isZh
        ? (sizes: string) => `优化后仍有超限：${sizes}`
        : (sizes: string) => `Files still over 10MB after optimization: ${sizes}`,
      smartEditRequiresImage:
        isZh
          ? '智能编辑模式需要上传至少一张图片或点击继续编辑'
          : 'Smart edit mode requires at least one uploaded image or selecting continue editing',
      replaceImageFailed: isZh ? '替换图片失败:' : 'Failed to replace image:',
      fetchImageFailed:
        isZh
          ? '未能获取到可上传的图片文件。可能来源站点未开启 CORS，建议“另存为”后再拖拽本地文件。'
          : 'Unable to fetch an uploadable image file. The source site may block CORS; try saving it locally and uploading.',
      viewBefore: isZh ? '查看修改前' : 'View before',
      viewAfter: isZh ? '查看修改后' : 'View after',
      templateApplyFailed: isZh ? '模板应用失败，请重试' : 'Template application failed, please retry',
      indicatorProcessing: isZh ? '正在' : 'Processing',
      enterEditMode: isZh ? '点击进入编辑模式' : 'Click to enter edit mode',
      exitEditMode: isZh ? '点击退出编辑模式' : 'Click to exit edit mode',
      previewNewImage: isZh ? '点击预览新上传图片' : 'Click to preview the new image',
      generate: isZh ? '生成' : 'Generate',
      generating: isZh ? '生成中' : 'Generating',
      generationTemplateFailed: isZh ? '生成模板应用失败:' : 'Failed to apply generation template:',
      generatedImage: isZh ? '生成的图片' : 'Generated image',
      generationResult: isZh ? '生成结果' : 'Generation result',
      movePreviousResultFailed: isZh ? '移动上一次结果到左侧失败:' : 'Failed to move the previous result to the left:',
      continueEditCompleted:
        isZh
          ? '继续编辑完成：上一次结果已移至左侧原图区域'
          : 'Continue editing done: previous result moved to left original area',
      continueEditActivated: isZh ? '继续编辑模式已激活' : 'Continue edit mode activated',
      continueEditLabel: isZh ? '继续编辑' : 'Continue editing',
      annotateResult: isZh ? '标注' : 'Annotate',
      edit: isZh ? '编辑' : 'Edit',
      editing: isZh ? '编辑中' : 'Editing',
      editPreview: isZh ? '编辑预览' : 'Edit preview',
      autoOptimizeToggle: isZh ? '自动优化开关' : 'Auto optimization toggle',
      enableEditFirst: isZh ? '请先开启编辑' : 'Enable editing first',
      enterPrompt: isZh ? '请输入提示词' : 'Enter a prompt',
      readLocalAnalysisPromptFailed:
        isZh ? '读取本地图片分析System Prompt失败:' : 'Failed to read local image analysis system prompt:',
      crossOriginImageFailed:
        isZh ? '跨站图片拉取失败（可能被 CORS 限制）:' : 'Failed to fetch cross-origin image (possibly CORS blocked):',
      switchToEdit: isZh ? '转入编辑' : 'Switch to edit',
      switchToEditFailed: isZh ? '转入编辑失败:' : 'Failed to switch to edit:',
      exitContinueEdit: isZh ? '退出继续编辑模式' : 'Exit continue edit mode',
      storeRecognitionScenario: isZh ? '门店识别场景' : 'Store recognition scenario',
      defaultScenario: isZh ? '默认场景' : 'Default scenario',
      aiReply: isZh ? 'AI回复' : 'AI response',
      clearError: isZh ? '清除错误信息' : 'Clear error',
      failureTime: isZh ? '失败时间：' : 'Failure time:',
      aiRawResponse: isZh ? 'AI原始回复：' : 'AI original response:',
      inputPrompt: isZh ? '输入提示词' : 'Enter prompt',
      autoOptimizing: isZh ? 'AI 优化中…' : 'AI polishing…',
      autoOptimizeLabel: isZh ? 'AI 优化提示词' : 'AI prompt refinement',
      autoOptimizeSwitchTitle: isZh ? '自动优化开关' : 'Auto optimization toggle',
      autoOptimizeLabelShort: isZh ? '自动优化' : 'Auto optimize',
      restoreOriginalPrompt: isZh ? '恢复原提示词' : 'Restore original prompt',
      generatingFromTemplate: isZh ? '正在根据模板生成…' : 'Generating from template…',
    }),
    [isZh],
  );

  const buildTemplateMeta = useCallback(
    (pick: TemplatePickPayload, opts?: { title?: string; body?: string }): TemplateInfoMeta => {
      const fallback = text.quickTemplateFallback;
      const titleSource = (opts?.title ?? (isZh ? pick.nameZh : pick.nameEn)) || pick.name || fallback;
      const useZhBody = isZh;
      const bodySource = (opts?.body ?? (
        useZhBody
          ? (pick.display || pick.contentZh || pick.english || pick.contentEn || pick.content)
          : (pick.contentEn || pick.english || pick.content || pick.contentZh || pick.display)
      )) || '';
      const normalizedTitle = titleSource.toString().trim() || fallback;
      const normalizedBody = bodySource.toString().replace(/^模板[:：]\s*/u, '').trim();
      return {
        title: normalizedTitle,
        body: normalizedBody,
        emoji: pick.emoji,
      };
    },
    [isZh, text.quickTemplateFallback],
  );
  // 默认场景兜底提示词（当本地与服务端均无配置时使用）
  const DEFAULT_RECOGNITION_PROMPT_FALLBACK = DEFAULT_RECOGNITION_PROMPT;
  // 状态管理
  const [mode, setMode] = useState<AIMode>(selectedMode);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number}[]>([]);
  const [editOriginalImages, setEditOriginalImages] = useState<{ file: File; preview: string }[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isQuickTemplatePrompt, setIsQuickTemplatePrompt] = useState(false); // 标记：是否来自“编辑快捷Prompt”
  const [lastTemplatePick, setLastTemplatePick] = useState<TemplatePickPayload | null>(null);
  const autoDefaultAttempted = useRef<Set<string>>(new Set());
  const matchesTemplateScene = useCallback(
    (pick: TemplatePickPayload | null, sceneKey?: string | null) => {
      if (!pick) return false;
      const keys = [
        pick.id,
        pick.name,
        pick.nameZh,
        pick.nameEn,
        pick.display,
        pick.english,
      ].filter(Boolean);
      return !!sceneKey && keys.some((k) => k === sceneKey);
    },
    [],
  );
  const [templateInfoBadgeState, setTemplateInfoBadgeState] = useState<TemplateBadgeEventPayload>({ status: 'idle' });
  const broadcastTemplateBadge = useCallback((payload: TemplateBadgeEventPayload) => {
    setTemplateInfoBadgeState(payload);
    emitTemplateInfoEvent(payload);
  }, []);
const applyEditTemplatePick = useCallback(async (pick: TemplatePickPayload) => {
  const emoji = resolveTemplateEmoji(pick);
  const nextPick = { ...pick, emoji, display: pick.display, english: pick.english, defaultImageUrl: undefined, defaultImageKey: undefined };
  setIsQuickTemplatePrompt(true);
  setLastTemplatePick(nextPick);
  setPrompt(pick.display || '');
  const metaInfo = buildTemplateMeta({ ...pick, emoji }, { title: text.quickTemplate, body: pick.display });
  broadcastTemplateBadge({ status: 'ready', template: metaInfo });

  // 若有预置图片（按比例），直接展示，无需生成；若未传则尝试拉取
  let defaultUrl = pick.defaultImageUrl || null;
  if (!defaultUrl && pick.id) {
    try {
      const resp = await templateAPI.getDefaultImage(pick.id, { ratio: selectedRatio.id, resolution: '' });
      defaultUrl = resp.data?.url || null;
    } catch (e) {
      // ignore
    }
  }

  if (defaultUrl) {
    const fakeResult: ImageEditResult = {
      id: `tpl-${pick.id || 'default'}-${Date.now()}`,
      sessionId: sessionId || '',
      prompt: pick.display || '',
      mode: 'edit',
      inputImages: [],
      result: defaultUrl,
      resultType: 'image',
      createdAt: Date.now(),
      metadata: {
        templateId: pick.id,
        defaultImage: true,
        ratio: selectedRatio.id,
        resolution: ''
      }
    };
    onProcessComplete(fakeResult);
    // 记录已用预置图，避免后续 handleSubmit 再生成
    setLastTemplatePick((prev) => prev ? { ...prev, defaultImageUrl: defaultUrl, defaultImageKey: `${selectedRatio.id}|` } : prev);
  }
}, [broadcastTemplateBadge, buildTemplateMeta, onProcessComplete, selectedRatio.id, sessionId, text.quickTemplate]);

  useEffect(() => {
    if (!lastTemplatePick || templateInfoBadgeState.status === 'idle') return;
    const meta = buildTemplateMeta(lastTemplatePick);
    broadcastTemplateBadge({
      status: templateInfoBadgeState.status,
      template: meta,
      message: templateInfoBadgeState.message,
    });
  }, [buildTemplateMeta, broadcastTemplateBadge, lastTemplatePick, templateInfoBadgeState.status, templateInfoBadgeState.message]);
  // 生成模块：AI优化策略开关 Off/Suggest/Auto
  type GenOptimizeMode = 'off' | 'suggest';
  const [genOptimizeMode, setGenOptimizeMode] = useState<GenOptimizeMode>(() => {
    try {
      const v = localStorage.getItem('genOptimizeMode');
      if (v === 'off' || v === 'suggest') return v as GenOptimizeMode;
      return 'suggest';
    } catch { return 'suggest'; }
  });
  useEffect(() => { try { localStorage.setItem('genOptimizeMode', genOptimizeMode); } catch {} }, [genOptimizeMode]);
  const [genOptimizedBadge, setGenOptimizedBadge] = useState(false);
  const [genPrevPrompt, setGenPrevPrompt] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const sysEditRef = useRef<string>('');
  const sysGenRef = useRef<string>('');
  // Prompt 元信息：来源与是否为用户编辑过
  const [promptMeta, setPromptMeta] = useState<{
    source: 'user' | 'template' | 'optimize';
    sceneKey?: string;
    edited: boolean;
    ts: number;
  } | null>(null);
  const lastAutoBySceneRef = useRef<Record<string, string>>({});
  const imageResultUrl = currentResult?.resultType === 'image'
    ? currentResult?.result
    : currentResult?.imageUrl;
  const hasImageResult = Boolean(imageResultUrl);
  const [force800For4k150, setForce800For4k150] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() => {
    if (typeof window === 'undefined') return 900;
    return window.innerHeight;
  });
  const forceTallForLayout = useMemo(() => force800For4k150, [force800For4k150]);
  const defaultResultHeight = useMemo(() => {
    if (forceTallForLayout) return 800;
    if (viewportHeight >= 1500) return 720;
    if (viewportHeight >= 1280) return 610;
    if (viewportHeight >= 1100) return 570;
    if (viewportHeight >= 940) return 540;
    return 520;
  }, [forceTallForLayout, viewportHeight]);
  const baseResultHeight = useMemo(() => defaultResultHeight, [defaultResultHeight]);
  // 不再扣减额外空间，直接使用基准高度与最小值，避免右侧预览被人为压缩
  const resultImageMaxHeightPx = useMemo(() => Math.max(320, baseResultHeight), [baseResultHeight]);
  const resultCardStyle = useMemo(() => ({
    minHeight: baseResultHeight,
    marginTop: 0,
    overflow: 'hidden',
    '--result-img-max-h': `${resultImageMaxHeightPx}px`
  } as CSSProperties), [baseResultHeight, resultImageMaxHeightPx]);

  // 模板填充中的等待状态与请求竞态控制
  const [isTemplateFilling, setIsTemplateFilling] = useState(false);
  const templateReqIdRef = useRef<number>(0);
  const templateSceneKeyRef = useRef<string | null>(null);
  // 指令模板（编辑模式）
  const [editTemplates, setEditTemplates] = useState<any[]>([]);
  const lastHistoryPromptIdRef = useRef<string | null>(null);
  const promptShellClass =
    'relative rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-card)] shadow-[0_22px_48px_-24px_rgba(15,23,42,0.35)] backdrop-blur';
  const promptResultCardClass = 'group relative flex-1 flex flex-col overflow-hidden rounded-2xl border border-[var(--border-soft)] backdrop-blur-xl bg-[var(--surface-card)] shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)] transition-colors';
  const promptCardClass = 'workflow-prompt-card relative z-40 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-card)] backdrop-blur-2xl shadow-[0_18px_50px_-30px_rgba(15,23,42,0.35)] p-4 xl:p-6 transition-all';
  const promptTextareaClass =
    'w-full min-h-[150px] bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] border border-transparent rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/55 focus:border-transparent px-5 sm:px-6 py-5 sm:py-6 text-sm sm:text-base leading-relaxed transition-colors';
  const toolbarButtonClass =
    'inline-flex h-10 items-center gap-2 px-4 rounded-full border border-[var(--border-soft)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors shadow-sm disabled:opacity-45 disabled:cursor-not-allowed';
  const accentToolbarButtonClass =
    'inline-flex h-[38px] items-center gap-2 px-4 rounded-full border border-[var(--accent)]/45 bg-transparent text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:border-[var(--accent)]/60 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed';
  const primaryActionClass = (disabled: boolean, busy: boolean) => {
    const base =
      'group relative inline-flex items-center gap-2 sm:gap-3 font-semibold text-base sm:text-lg tracking-wide transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200/70';
    if (busy) {
      return `${base} justify-center px-1.5 sm:px-2 text-[var(--text-primary)] cursor-wait`;
    }
    if (disabled) {
      return `${base} px-1.5 sm:px-2 text-[rgba(var(--text-secondary-rgb),0.58)] cursor-not-allowed`;
    }
    return `${base} px-1.5 sm:px-2 text-[var(--text-primary)] hover:text-[rgba(var(--text-primary-rgb),0.8)]`;
  };

  const leftColRef = useRef<HTMLDivElement | null>(null);
  const rightColRef = useRef<HTMLDivElement | null>(null);
  const resultCardRef = useRef<HTMLDivElement | null>(null);
  const [rightPaneWidth, setRightPaneWidth] = useState<number | null>(null);
  const promptContainerRef = useRef<HTMLDivElement | null>(null);
  const promptHeaderRef = useRef<HTMLDivElement | null>(null);

  // 同步左列高度到右列（用于超宽/4K下图片结果高度动态变化时）
  const [syncedLeftHeight, setSyncedLeftHeight] = useState<number | null>(null);
  const syncLeftHeightToRight = useCallback(() => {
    try {
      const right = rightColRef.current;
      if (!right) return;
      const isTwoCol = window.matchMedia('(min-width: 1024px)').matches; // lg 及以上为两列
      if (!isTwoCol) {
        setSyncedLeftHeight(null);
        setRightPaneWidth(null);
        return;
      }
      const rect = right.getBoundingClientRect();
      const cardRect = resultCardRef.current?.getBoundingClientRect?.();
      if (rect) {
        if (rect.height > 0) {
          setSyncedLeftHeight(Math.round(rect.height));
        }
        const widthCandidate = cardRect?.width || rect.width;
        if (widthCandidate > 0) {
          const width = Math.round(widthCandidate);
          setRightPaneWidth((prev) => (prev === width ? prev : width));
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    // 加载系统提示词（跨浏览器一致）
    (async () => {
      try {
        const resp = await fetch('/api/auth/system-prompts');
        if (resp.ok) {
          const j = await resp.json();
          const data = j?.data || {};
          sysEditRef.current = data.editing || '';
          sysGenRef.current = data.generation || '';
          // 初次加载时应用到当前模块
          if (mode === 'edit') setSystemPrompt(sysEditRef.current);
          else if (mode === 'generate') setSystemPrompt(sysGenRef.current);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    // 切换模块时应用对应系统提示词
    if (mode === 'edit') setSystemPrompt(sysEditRef.current || '');
    else if (mode === 'generate') setSystemPrompt(sysGenRef.current || '');
  }, [mode]);

  useEffect(() => {
    if (!historySelection && lastHistoryPromptIdRef.current) {
      lastHistoryPromptIdRef.current = null;
      if (mode === 'generate') {
        setIsQuickTemplatePrompt(false);
        // 保留提示词内容，只标记为用户手动输入以便后续编辑/提交
        setPromptMeta({
          source: 'user',
          edited: true,
          ts: Date.now(),
        });
      }
    }
  }, [historySelection, mode]);

  useEffect(() => {
    if (!historyPromptDraft) return;
    if (mode !== 'generate') return;
    if (historyPromptDraft.id && lastHistoryPromptIdRef.current === historyPromptDraft.id) {
      onHistoryPromptDraftConsumed?.();
      return;
    }
    const candidatePrompt =
      (historyPromptDraft as any)?.prompt?.trim?.() ||
      (historyPromptDraft as any)?.finalPrompt?.trim?.() ||
      (historyPromptDraft.metadata?.prompt as string)?.trim?.() ||
      '';
    setIsQuickTemplatePrompt(false);
    setPrompt(candidatePrompt);
    setPromptMeta({
      source: 'user',
      edited: true,
      ts: Date.now(),
    });
    lastHistoryPromptIdRef.current = historyPromptDraft.id || `${Date.now()}`;
    onHistoryPromptDraftConsumed?.();
  }, [historyPromptDraft, mode, onHistoryPromptDraftConsumed]);

  useEffect(() => {
    // 初始与窗口变化时同步
    const onResize = () => {
      if (typeof window !== 'undefined') {
        setViewportHeight(window.innerHeight);
      }
      syncLeftHeightToRight();
    };
    window.addEventListener('resize', onResize);
    const t = setTimeout(() => {
      syncLeftHeightToRight();
    }, 50);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    };
  }, [syncLeftHeightToRight]);

  // 空态下保持固定高度，避免左右列高度不一致
  useEffect(() => {
    if (mode !== 'edit') return;
    if (currentResult) return;
    const el = resultCardRef.current;
    if (!el) return;
    const baseHeight = Math.max(488, defaultResultHeight);
    el.style.minHeight = baseHeight + 'px';
    el.style.maxHeight = baseHeight + 'px';
    return () => {
      el.style.minHeight = baseHeight + 'px';
      el.style.maxHeight = baseHeight + 'px';
    };
  }, [mode, currentResult, defaultResultHeight]);

  useEffect(() => {
    // 结果区尺寸变化时同步（图片加载、模式切换等）
    const host = rightColRef.current;
    if (!host) return;
    let ro: ResizeObserver | null = null;
    const runSync = () => {
      syncLeftHeightToRight();
    };
    try {
      const RZ: any = (window as any).ResizeObserver;
      if (typeof RZ === 'function') {
        ro = new RZ(() => runSync());
        ro.observe(host);
      }
    } catch {}
    const t = setTimeout(runSync, 80);
    return () => { try { ro && ro.disconnect(); } catch {}; clearTimeout(t); };
  }, [currentResult, imagePreviews.length, mode, syncLeftHeightToRight, historyPanelVisible]);

  useEffect(() => {
    if (historyPanelVisible) {
      const timer = setTimeout(() => syncLeftHeightToRight(), 40);
      return () => clearTimeout(timer);
    }
    // 当折叠历史面板时，恢复宽度为 null
    setRightPaneWidth(null);
  }, [historyPanelVisible, syncLeftHeightToRight]);
  // 模块上传区隔离的缓存（编辑/分析）
  const [editCache, setEditCache] = useState<{ files: File[]; previews: string[]; dims: { width: number; height: number }[] }>({ files: [], previews: [], dims: [] });
  const [analyzeCache, setAnalyzeCache] = useState<{ files: File[]; previews: string[]; dims: { width: number; height: number }[] }>({ files: [], previews: [], dims: [] });
  
  // 图片预览模态框状态
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [showAnnotator, setShowAnnotator] = useState(false);
  type AnnotatorContext = { kind: 'upload'; index: number } | { kind: 'result' };
  const [annotatorContext, setAnnotatorContext] = useState<AnnotatorContext | null>(null);
  const [annotatorImageUrl, setAnnotatorImageUrl] = useState<string | null>(null);
  const annotatorObjectUrlRef = useRef<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [previewImageTitle, setPreviewImageTitle] = useState('');
  const [previewImageType, setPreviewImageType] = useState<'before' | 'after'>('before');
  const annotatorOriginalUrl = useMemo(() => {
    if (!annotatorContext) return null;
    if (annotatorContext.kind === 'upload') {
      return editOriginalImages[annotatorContext.index]?.preview || annotatorImageUrl;
    }
    return annotatorImageUrl;
  }, [annotatorContext, editOriginalImages, annotatorImageUrl]);
  // 预览缩放/平移状态
  const [previewScale, setPreviewScale] = useState(1);
  const [previewOffset, setPreviewOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [previewNaturalSize, setPreviewNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [previewWrapSize, setPreviewWrapSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const previewWrapRef = useRef<HTMLDivElement | null>(null);
  const previewDraggingRef = useRef(false);
  const previewLastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // 编辑模式状态
  const [isContinueEditMode, setIsContinueEditMode] = useState(false);
  const [continueEditPreviews, setContinueEditPreviews] = useState<string[]>([]);
  const [continueEditDimensions, setContinueEditDimensions] = useState<{width:number;height:number}[]>([]);
  const [continueEditSourceOverride, setContinueEditSourceOverride] = useState<{ file: File; preview: string } | null>(null);
  const [resultDimensions, setResultDimensions] = useState<{width:number;height:number} | null>(null);
  const [singleImageHeight, setSingleImageHeight] = useState<number | null>(null);
  const resultOrientation = useMemo<ImageOrientation>(() => {
    if (!resultDimensions) return 'unknown';
    const { width, height } = resultDimensions;
    if (!width || !height) return 'unknown';
    if (width === height) return 'square';
    return width > height ? 'landscape' : 'portrait';
  }, [resultDimensions]);
  const resultImageClass = useMemo(() => {
    switch (resultOrientation) {
      case 'portrait':
        return 'h-full w-auto max-h-full';
      case 'landscape':
        return 'w-full h-auto max-w-full';
      case 'square':
        return 'w-full h-full max-w-full max-h-full';
      default:
        return 'w-full h-auto max-w-full';
    }
  }, [resultOrientation]);
  const resultImageStyle = useMemo<CSSProperties>(() => {
    switch (resultOrientation) {
      case 'portrait':
        return { objectFit: 'contain', objectPosition: 'center', height: '100%', width: 'auto', maxHeight: '100%', maxWidth: '100%' };
      case 'landscape':
        return { objectFit: 'contain', objectPosition: 'center', width: '100%', height: 'auto', maxWidth: '100%', maxHeight: '100%' };
      case 'square':
        return { objectFit: 'contain', objectPosition: 'center', width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%' };
      default:
        return { objectFit: 'contain', objectPosition: 'center', width: '100%', height: 'auto', maxWidth: '100%', maxHeight: '100%' };
    }
  }, [resultOrientation]);
  const resultDisplayUrl = useMemo(() => {
    return continueEditSourceOverride?.preview || currentResult?.result || currentResult?.imageUrl || '';
  }, [continueEditSourceOverride, currentResult?.imageUrl, currentResult?.result]);
  
  // 继续编辑模式下的新上传图片状态
  const [continueEditFiles, setContinueEditFiles] = useState<File[]>([]);
  const [continueEditFilePreviews, setContinueEditFilePreviews] = useState<string[]>([]);
  type UploadOptimizeContext =
    | { kind: 'left'; files: File[] }
    | { kind: 'replace'; file: File; index: number };
  const [uploadOptimizeState, setUploadOptimizeState] = useState<{
    open: boolean;
    context: UploadOptimizeContext | null;
    message: string | null;
    busy: boolean;
  }>({ open: false, context: null, message: null, busy: false });

  useEffect(() => {
    if (!currentResult || currentResult.resultType !== 'image') {
      setResultDimensions(null);
    }
  }, [currentResult]);

  // 新的结果出现时重置继续编辑的标注覆盖
  useEffect(() => {
    setContinueEditSourceOverride(null);
  }, [currentResult?.result, currentResult?.imageUrl]);


  // 图片预览模态框状态
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    imageUrl: string;
    title: string;
  }>({
    isOpen: false,
    imageUrl: '',
    title: ''
  });
  
  // 错误结果显示状态（按模块隔离）
  type ErrorInfo = {
    type: 'policy_violation' | 'general_error';
    title: string;
    message: string;
    details?: string;
    originalResponse?: string;
    timestamp: number;
  } | null;
  const [errorByMode, setErrorByMode] = useState<Record<AIMode, ErrorInfo>>({ generate: null, edit: null, analyze: null });
  // 图片分析结果
  const [analysisResult, setAnalysisResult] = useState<ImageAnalysisResult | null>(null);
  const [analyzePaneHeight, setAnalyzePaneHeight] = useState<number | null>(baseResultHeight);
  const [isAnalyzingLocal, setIsAnalyzingLocal] = useState(false);
  const analysisStartRef = useRef<number | null>(null);
  // 分析编辑栏模式：初始化为“编辑”
  const [analyzeEditorMode, setAnalyzeEditorMode] = useState<'edit' | 'preview' | 'split'>('edit');
  const analysisPaneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (mode !== 'analyze') {
      setAnalyzePaneHeight(baseResultHeight);
    } else {
      setAnalyzePaneHeight(prev => (prev && prev > 0 ? prev : baseResultHeight));
    }
  }, [mode, baseResultHeight]);

  useEffect(() => {
    if (mode !== 'analyze') return;
    const node = analysisPaneRef.current;
    if (!node) {
      setAnalyzePaneHeight(baseResultHeight);
      return;
    }
    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.height > 0) {
        setAnalyzePaneHeight(Math.round(rect.height));
      }
    };
    measure();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => measure());
      observer.observe(node);
      return () => observer.disconnect();
    }
    return () => {};
  }, [mode, analysisResult, baseResultHeight]);

  const emitUploadValidationError = useCallback(
    (title: string, message: string) => {
      setErrorByMode(prev => ({
        ...prev,
        [mode]: {
          type: 'general_error',
          title,
          message,
          details: message,
          originalResponse: message,
          timestamp: Date.now()
        }
      }));
      onProcessError?.(message);
    },
    [mode, onProcessError]
  );

  const openUploadOptimizeModal = useCallback((context: UploadOptimizeContext) => {
    setUploadOptimizeState({ open: true, context, message: null, busy: false });
  }, []);

  const closeUploadOptimizeModal = useCallback(() => {
    setUploadOptimizeState({ open: false, context: null, message: null, busy: false });
  }, []);

  const analysisResultStyle = useMemo(() => {
    if (mode !== 'analyze') {
      return resultCardStyle;
    }
    const baseMin = typeof resultCardStyle.minHeight === 'number' ? resultCardStyle.minHeight : defaultResultHeight;
    const minHeight = analyzePaneHeight ? Math.max(baseMin, analyzePaneHeight) : baseMin;
    return {
      ...resultCardStyle,
      minHeight
    } as CSSProperties;
  }, [mode, analyzePaneHeight, resultCardStyle, defaultResultHeight]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 上传目的地：左侧上传区 或 右侧编辑预览区

  // 页面初始化时确定一个稳定的预览最大高度，避免图片加载导致布局跳动
  const [maxPreviewHeight, setMaxPreviewHeight] = useState<number>(420);

  useEffect(() => {
    const el = resultCardRef.current;
    if (el) {
      const reserved = 120; // 标题/内边距/底部操作占位
      const h = el.clientHeight || 480;
      setMaxPreviewHeight(Math.max(240, h - reserved));
    } else if (typeof window !== 'undefined') {
      setMaxPreviewHeight(Math.max(240, Math.floor(window.innerHeight * 0.45)));
    }
  }, []);

  const alignedResultImgMaxHeight = useMemo(() => {
    // 与左侧一致：70vh 且不超过 pane-max-h；不再叠加 maxPreviewHeight 的扣减
    const cap = Math.min(Math.floor(viewportHeight * 0.7), 1433);
    return Math.max(320, Math.min(cap, resultImageMaxHeightPx));
  }, [viewportHeight, resultImageMaxHeightPx]);

  // 针对“4K 显示器 + 150% 系统缩放”下的特殊高度对齐
  // 该环境下 viewport 宽度通常在 2500px 左右，但低于我们自定义的 4k 断点（2559px），
  // 会导致左列（生成模式）仍为 675px，而右列已到 800px，从而出现左右不齐与中间空白。
  // 这里在该宽度区间内强制两列高度统一为 800px（仅此环境生效）。
  useEffect(() => {
    const check = () => {
      try {
        const dpr = (window.devicePixelRatio || 1);
        // 使用“屏幕CSS宽高 * DPR ≈ 物理像素”的近似，避免误命中 2K/超宽屏
        const sw = (window.screen && window.screen.width) ? window.screen.width : window.innerWidth;
        const sh = (window.screen && window.screen.height) ? window.screen.height : window.innerHeight;
        const devW = Math.round(sw * dpr);
        const devH = Math.round(sh * dpr);
        // 仅当物理分辨率接近 3840x2160 且系统缩放≈150% 时启用（容忍一定误差）
        const w4k = devW >= 3720 && devW <= 3960; // 3840 ±120
        const h4k = devH >= 2100 && devH <= 2220; // 2160 ±60
        const dprOk = dpr >= 1.4 && dpr <= 1.6;
        setForce800For4k150(Boolean(w4k && h4k && dprOk));
      } catch {
        setForce800For4k150(false);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 加载编辑模板（双语优先）
  useEffect(() => {
    (async () => {
      try {
        const resp = await templateAPI.getTemplates('edit');
        if (resp?.success && Array.isArray(resp.data)) {
          setEditTemplates(resp.data);
        }
      } catch (e) {
        console.warn(text.loadEditTemplatesFailed, e);
      }
    })();
  }, []);

  // 提示词按模块隔离：加载/保存到 sessionStorage
  // 加载：切换模块时读取该模块的提示词
  useEffect(() => {
    try {
      const key = `iwf:prompt:${mode}`;
      const saved = sessionStorage.getItem(key);
      if (typeof saved === 'string') setPrompt(saved);
    } catch {}
  }, [mode]);
  // 保存：仅在提示词变更时写入当前模块 key，避免切换模块时把上一个模块的提示词写入新模块
  const promptSaveModeRef = useRef<AIMode>(mode);
  useEffect(() => { promptSaveModeRef.current = mode; }, [mode]);
  useEffect(() => {
    try { sessionStorage.setItem(`iwf:prompt:${promptSaveModeRef.current}`, prompt); } catch {}
  }, [prompt]);

  // 当切换到“图片分析”模块时，默认展示“编辑”模式
  useEffect(() => {
    if (mode === 'analyze') {
      setAnalyzeEditorMode('edit');
    }
  }, [mode]);

  // 确保左侧图片尺寸完整：当通过迁移结果或其他途径设置了 imagePreviews 而未设置尺寸时，自动补齐尺寸
  useEffect(() => {
    if (mode !== 'edit') return;
    if (imagePreviews.length === 0) return;
    if (imageDimensions.length === imagePreviews.length) return;

    imagePreviews.forEach((src, idx) => {
      if (!imageDimensions[idx] && src) {
        const img = new Image();
        img.onload = () => {
          setImageDimensions(prev => {
            const next = [...prev];
            next[idx] = { width: img.width, height: img.height };
            return next;
          });
        };
        img.src = src;
      }
    });
  }, [mode, imagePreviews, imageDimensions]);

  const ensureAnnotatorImage = useCallback(async (src: string): Promise<{ url: string; revoke: boolean } | null> => {
    if (!src) return null;
    const tryFetch = async (target: string) => {
      const resp = await fetch(target, { mode: 'cors' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Not an image');
      return blob;
    };

    try {
      let urlToUse = src;
      let revoke = false;

      if (/^https?:\/\//i.test(src)) {
        let blob: Blob | null = null;
        try {
          blob = await tryFetch(src);
        } catch (e1) {
          try {
            const proxied = `${API_BASE_URL}/edit/image-proxy?url=${encodeURIComponent(src)}`;
            blob = await tryFetch(proxied);
          } catch (e2) {
            throw e2;
          }
        }
        urlToUse = URL.createObjectURL(blob!);
        revoke = true;
      }

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = (err) => reject(err || new Error('Invalid image loaded'));
        img.src = urlToUse;
      });

      return { url: urlToUse, revoke };
    } catch (err: any) {
      console.warn('Failed to load image for annotator', err);
      alert(`${text.crossOriginImageFailed} ${err?.message || err}`);
      return null;
    }
  }, [text.crossOriginImageFailed]);

  // 图片预览方法
  const openImagePreview = useCallback((imageUrl: string, title: string, type: 'before' | 'after') => {
    setPreviewImageUrl(imageUrl);
    setPreviewImageTitle(title);
    setPreviewImageType(type);
    setShowImagePreview(true);
  }, []);

  const closeAnnotator = useCallback(() => {
    if (annotatorObjectUrlRef.current) {
      try { URL.revokeObjectURL(annotatorObjectUrlRef.current); } catch {}
      annotatorObjectUrlRef.current = null;
    }
    setShowAnnotator(false);
    setAnnotatorContext(null);
    setAnnotatorImageUrl(null);
  }, []);

  const handleAnnotatorSave = useCallback(async (dataUrl: string) => {
    if (!annotatorContext) return;
    const makeFile = (fallbackName: string) => dataURLtoFile(dataUrl, fallbackName);

    const processFile = async (file: File) => {
      uploadLog('annotator output', {
        name: file.name,
        size: formatBytes(file.size),
        mime: file.type
      });
      if (file.size > MAX_UPLOAD_BYTES) {
        try {
          file = await compressImageFile(file);
          uploadLog('annotator auto-compress', {
            name: file.name,
            size: formatBytes(file.size),
            mime: file.type
          });
        } catch (err) {
          uploadLog('annotator auto-compress failed', err);
        }
      }
      return file;
    };

    if (annotatorContext.kind === 'upload') {
      const idx = annotatorContext.index;
      const baseName = (() => {
        const original = uploadedFiles[idx]?.name || `image-${idx + 1}.png`;
        const normalized = original.replace(/\.(png|jpg|jpeg|webp|gif|bmp)$/i, '');
        return normalized || `image-${idx + 1}`;
      })();
      let file = await processFile(makeFile(`${baseName}-annotated.png`));
      if (file.size > MAX_UPLOAD_BYTES) {
        uploadLog('annotator output still over limit after auto-compress', {
          name: file.name,
          size: formatBytes(file.size),
          limit: formatBytes(MAX_UPLOAD_BYTES)
        });
        openUploadOptimizeModal({ kind: 'replace', file, index: idx });
        closeAnnotator();
        return;
      }

      setUploadedFiles((prev) => {
        const next = [...prev];
        next[idx] = file;
        return next;
      });
      setImagePreviews((prev) => {
        const next = [...prev];
        next[idx] = dataUrl;
        return next;
      });
      try {
        const img = new Image();
        img.onload = () => {
          setImageDimensions((prev) => {
            const next = [...prev];
            next[idx] = { width: img.width, height: img.height };
            return next;
          });
        };
        img.src = dataUrl;
      } catch {}
    } else {
      // 标注当前结果作为继续编辑源
      const baseName = 'continue-edit-source';
      let file = await processFile(makeFile(`${baseName}.png`));
      if (file.size > MAX_UPLOAD_BYTES) {
        uploadLog('annotator output still over limit after auto-compress', {
          name: file.name,
          size: formatBytes(file.size),
          limit: formatBytes(MAX_UPLOAD_BYTES)
        });
        openUploadOptimizeModal({ kind: 'replace', file, index: 0 });
        closeAnnotator();
        return;
      }
      setContinueEditSourceOverride({ file, preview: dataUrl });
      try {
        const img = new Image();
        img.onload = () => {
          setResultDimensions({ width: img.width, height: img.height });
        };
        img.src = dataUrl;
      } catch {}
    }

    closeAnnotator();
  }, [annotatorContext, closeAnnotator, openUploadOptimizeModal, uploadedFiles]);

  const handleAnnotateUpload = useCallback((index: number) => {
    const src = imagePreviews[index];
    if (!src) return;
    void ensureAnnotatorImage(src).then((prepared) => {
      if (!prepared) return;
      if (annotatorObjectUrlRef.current && annotatorObjectUrlRef.current !== prepared.url) {
        try { URL.revokeObjectURL(annotatorObjectUrlRef.current); } catch {}
      }
      annotatorObjectUrlRef.current = prepared.revoke ? prepared.url : null;
      setAnnotatorContext({ kind: 'upload', index });
      setAnnotatorImageUrl(prepared.url);
      setShowAnnotator(true);
    });
  }, [ensureAnnotatorImage, imagePreviews]);
  // 左右切换预览：在键盘事件监听之前定义
  const switchPreviewImage = useCallback(() => {
    if (previewImageType === 'before' && currentResult && (currentResult as any)) {
      const afterSrc = (currentResult as any).result || (currentResult as any).imageUrl;
      if (!afterSrc) return;
      setPreviewImageUrl(afterSrc);
      setPreviewImageTitle(text.afterLabel);
      setPreviewImageType('after');
    } else if (previewImageType === 'after' && imagePreviews.length > 0) {
      setPreviewImageUrl(imagePreviews[0]);
      setPreviewImageTitle(text.beforeLabel);
      setPreviewImageType('before');
    }
  }, [previewImageType, currentResult, imagePreviews]);
  // 预览层键盘交互：ESC 关闭；左右方向键切换前/后图
  useEffect(() => {
    if (!showImagePreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowImagePreview(false);
      } else if (e.key === 'ArrowRight' && previewImageType === 'before') {
        // 向右：从修改前 → 修改后
        switchPreviewImage();
      } else if (e.key === 'ArrowLeft' && previewImageType === 'after') {
        // 向左：从修改后 → 修改前
        switchPreviewImage();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showImagePreview, previewImageType, switchPreviewImage]);

  // 打开或切换图片时重置缩放/平移
  useEffect(() => {
    if (!showImagePreview) return;
    setPreviewScale(1);
    setPreviewOffset({ x: 0, y: 0 });
    // 测量容器尺寸
    const measure = () => {
      const rect = previewWrapRef.current?.getBoundingClientRect();
      if (rect) setPreviewWrapSize({ w: rect.width, h: rect.height });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [showImagePreview, previewImageUrl]);

  // 预览层开启时，阻止页面背景滚动（捕获阶段阻止默认，但不停止冒泡，以便内部缩放处理）
  useEffect(() => {
    if (!showImagePreview) return;
    const onWheel = (e: WheelEvent) => { try { e.preventDefault(); } catch {} };
    const onTouch = (e: TouchEvent) => { try { e.preventDefault(); } catch {} };
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('touchmove', onTouch as any, { passive: false, capture: true });
    return () => {
      try {
        window.removeEventListener('wheel', onWheel as any, true as any);
        window.removeEventListener('touchmove', onTouch as any, true as any);
      } catch {}
    };
  }, [showImagePreview]);

  // 主按钮禁用逻辑（用于属性与样式一致）
  // 主按钮禁用逻辑：
  // - 生成：允许无图
  // - 编辑：需要左侧有图，或处于编辑且右侧有上一张结果图
  // - 分析：需要左侧有图
  const editHasSource = uploadedFiles.length > 0;
  const analyzeHasSource = uploadedFiles.length > 0;
  const primaryDisabled = (
    isProcessing ||
    isAnalyzingLocal ||
    ((mode !== 'analyze') && !prompt.trim()) ||
    (mode === 'edit' && !editHasSource) ||
    (mode === 'analyze' && !analyzeHasSource)
  );
  const isPrimaryBusy = isProcessing || isAnalyzingLocal;
  const primaryLabelCompact = mode === 'generate' ? text.generate : mode === 'edit' ? text.edit : text.analyze;
  const primaryLabelParts: [string, string] = useMemo(() => {
    if (mode === 'generate') return [text.actionStart, text.generate];
    if (mode === 'edit') return [text.actionStart, text.edit];
    return [text.actionStart, text.analyze];
  }, [mode, text.actionStart, text.generate, text.edit, text.analyze]);
  const busyLabelParts: [string, string] = useMemo(() => {
    if (mode === 'generate') return [text.indicatorProcessing, text.generate];
    if (mode === 'edit') return [text.indicatorProcessing, text.edit];
    return [text.indicatorProcessing, text.analyze];
  }, [mode, text.indicatorProcessing, text.generate, text.edit, text.analyze]);
  const busyLabelCompact = useMemo(() => {
    if (mode === 'generate') return text.generating;
    if (mode === 'edit') return text.editing;
    return text.analyzing;
  }, [mode, text.generating, text.editing, text.analyzing]);
  const iconVariantClass = useMemo(() => {
    if (isPrimaryBusy) return 'primary-action-icon--busy';
    if (primaryDisabled) return 'primary-action-icon--disabled';
    return 'primary-action-icon--enabled';
  }, [isPrimaryBusy, primaryDisabled]);

  const handleSubmit = async () => {
    // 预置图已展示且提示词未改，避免重复生成
    if (
      lastTemplatePick?.defaultImageUrl &&
      prompt.trim() === (lastTemplatePick.display || '').trim()
    ) {
      alert(isZh ? '已展示预置图，修改提示词后再生成' : 'Default image is already shown. Edit the prompt to regenerate.');
      return;
    }

    if (!sessionId) {
      alert(text.sessionNotInitialized);
      return;
    }

    if (mode !== 'analyze' && !prompt.trim()) {
      alert(text.enterPrompt);
      return;
    }

    // 资源校验：
    // - 编辑：需左侧有图，或处于编辑且右侧有上一张结果图
    // - 分析：需左侧有图
    if (mode === 'edit') {
      if (uploadedFiles.length === 0) {
        alert(text.smartEditRequiresImage);
        return;
      }
    } else if (mode === 'analyze') {
      if (uploadedFiles.length === 0) {
        alert(text.analysisRequiresImage);
        return;
      }
    }

    // 生成/编辑才通知父组件开始处理（分析模式不触发全局loading）
    if (mode !== 'analyze') {
      onProcessStart?.();
    }

    const handleFailure = (error: unknown) => {
      console.error(text.processingFailedColon, error);
      const errorMessage = error instanceof Error ? error.message : text.processingFailed;

      if (errorMessage.includes('Content policy violation')) {
        setErrorByMode(prev => ({ ...prev, [mode]: {
          type: 'policy_violation',
          title: text.contentPolicyViolation,
          message: text.uploadPolicyViolation,
          details: text.policyViolationDetails,
          originalResponse: errorMessage,
          timestamp: Date.now()
        }}));
        onClearResult?.();
      } else if (errorMessage.includes("Sorry, I'm unable to help you with that.")) {
        setErrorByMode(prev => ({ ...prev, [mode]: {
          type: 'policy_violation',
          title: text.contentRejected,
          message: text.promptSensitiveRejected,
          details: text.sensitivePromptSuggestions,
          originalResponse: errorMessage,
          timestamp: Date.now()
        }}));
        onClearResult?.();
      } else {
        setErrorByMode(prev => ({ ...prev, [mode]: {
          type: 'general_error',
          title: text.aiProcessingFailed,
          message: text.generationError,
          details: text.requestFailureDetails,
          originalResponse: errorMessage,
          timestamp: Date.now()
        }}));
        onClearResult?.();
      }

      onProcessError?.(errorMessage);
      const elapsed = analysisStartRef.current ? Date.now() - analysisStartRef.current : 0;
      const remain = Math.max(0, 600 - elapsed);
      setTimeout(() => setIsAnalyzingLocal(false), remain);
    };

    if (mode === 'analyze') {
      try {
        setAnalysisResult(null);
        setIsAnalyzingLocal(true);
        analysisStartRef.current = Date.now();
        const formData = new FormData();
        formData.append('image', uploadedFiles[0]);
        formData.append('sessionId', sessionId);
        formData.append('modelId', modelId);
        let userPrompt = prompt.trim();
        if (!userPrompt) {
          try {
            const localDefault = localStorage.getItem('customRecognitionPrompt') || '';
            userPrompt = (localDefault && localDefault.trim()) ? localDefault.trim() : DEFAULT_RECOGNITION_PROMPT_FALLBACK;
          } catch {
            userPrompt = DEFAULT_RECOGNITION_PROMPT_FALLBACK;
          }
        }
        if (userPrompt) {
          formData.append('prompt', userPrompt);
        }

        try {
          const recPrompt = localStorage.getItem('customRecognitionPrompt');
          const recScenariosRaw = localStorage.getItem('customRecognitionScenarios');
          const scenarios: string[] = recScenariosRaw ? JSON.parse(recScenariosRaw) : [];
          const scenarioText = Array.isArray(scenarios) ? scenarios.join('\n') : '';
          if (recPrompt && recPrompt.trim()) formData.append('customSystemPrompt', recPrompt);
          if (scenarioText && scenarioText.trim()) formData.append('scenario', scenarioText);
        } catch (e) {
          console.warn(text.readLocalAnalysisPromptFailed, e);
        }

        const response = await fetch(`${API_BASE_URL}/analyze/analyze-image`, {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          console.error('[Analyze] API error payload:', result);
          const extra = result.originalError ? ` | ${result.originalError}` : '';
          throw new Error((result.message || result.error || `HTTP ${response.status}: ${response.statusText}`) + extra);
        }

        const finalResult: ImageAnalysisResult = {
          ...result.data,
          imagePreview: imagePreviews[0],
        };
        setAnalysisResult(finalResult);
        const elapsed = analysisStartRef.current ? Date.now() - analysisStartRef.current : 0;
        const remain = Math.max(0, 600 - elapsed);
        setTimeout(() => setIsAnalyzingLocal(false), remain);
        return;
      } catch (error) {
        handleFailure(error);
        return;
      }
  }

  const processGenerateOrEdit = async () => {
    const formData = new FormData();

    let generationPromptToUse = prompt.trim();
      if (mode === 'generate') {
        const { score, reasons } = evaluatePromptQuality(generationPromptToUse);
        const needImprove = score < 60 && !/不要优化|勿优化|保持原样|按我写的来/.test(generationPromptToUse);
        if (genOptimizeMode === 'suggest' && needImprove) {
          try {
            setGenPrevPrompt(generationPromptToUse);
            const polished = await handleOptimizePrompt();
            if (polished) {
              generationPromptToUse = polished;
              setGenOptimizedBadge(true);
            }
          } catch (e) {
            console.warn('Optimize failed, continue with original');
          }
        }
      }

      if (mode === 'generate') {
        console.log(`🎨 生成背景图片: ${canvasSize.width}x${canvasSize.height} (${selectedRatio.label})`);

        const canvas = document.createElement('canvas');
        canvas.width = canvasSize.width;
        canvas.height = canvasSize.height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
          gradient.addColorStop(0, '#f8f9fa');
          gradient.addColorStop(1, '#e9ecef');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, 'image/png');
        });

        if (blob) {
          const backgroundImage = new File([blob], 'background.png', { type: 'image/png' });
          formData.append('images', backgroundImage);

          console.log(`✅ 背景图片已生成:`, {
            expectedSize: `${canvasSize.width}x${canvasSize.height}`,
            actualCanvasSize: `${canvas.width}x${canvas.height}`,
            fileSize: `${(blob.size / 1024).toFixed(2)}KB`,
            aspectRatio: selectedRatio.id,
            label: selectedRatio.label
          });
        }
      } else {
        if (mode === 'edit') {
          uploadedFiles.forEach((file) => formData.append('images', file));
        } else {
          uploadedFiles.forEach((file) => {
            formData.append('images', file);
          });
        }
      }

      formData.append('sessionId', sessionId);

      const isGenerateMode = mode === 'generate';
      const aspectRatioToUse = isGenerateMode ? selectedRatio.id : (editSelectedRatio?.id || null);
      const imageSizeToUse = isGenerateMode ? selectedResolution.id : (editSelectedResolution?.id || null);

      let finalPrompt = '';
      if (mode === 'generate') {
        const aspectRatioParam = `--ar ${selectedRatio.id}`;
        finalPrompt = `${generationPromptToUse} ${aspectRatioParam}`;
      } else {
        const currentInput = prompt.trim();
        if (lastTemplatePick && currentInput === (lastTemplatePick.display || '').trim() && lastTemplatePick.english) {
          finalPrompt = lastTemplatePick.english.trim();
        } else {
          finalPrompt = currentInput;
        }
      }

      formData.append('prompt', finalPrompt);
      console.log('Final prompt with aspect ratio:', finalPrompt);

      formData.append('enableAnalysis', 'false');
      formData.append('modelId', modelId);
      // 生成模式：显式传递画布尺寸与选定比例/分辨率
      if (isGenerateMode) {
        formData.append('aspectRatio', aspectRatioToUse);
        formData.append('width', `${canvasSize.width}`);
        formData.append('height', `${canvasSize.height}`);
        formData.append('imageSize', imageSizeToUse);
      } else {
        // 编辑模式：仅当用户在侧边栏选择了值时才传递，默认跟随输入图像
        if (aspectRatioToUse) formData.append('aspectRatio', aspectRatioToUse);
        if (imageSizeToUse) formData.append('imageSize', imageSizeToUse);
      }

      console.log('Submitting request to /edit/edit-images:', {
        mode,
        hasImages: uploadedFiles.length > 0 || (mode === 'generate'),
        finalPrompt,
        model: modelId
      });

      const response = await fetch(`${API_BASE_URL}/edit/edit-images`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      if (result.success) {
        console.log('✅ Processing completed:', result.data);
        setErrorByMode(prev => ({ ...prev, [mode]: null }));

        const augmented = {
          ...result.data,
          inputImages: (isContinueEditMode || mode === 'edit')
            ? (imagePreviews || []).map((url) => ({ originalName: '', mimeType: '', size: 0, dataUrl: url }))
            : [],
        };
        const pendingTplId = lastTemplatePick?.id || null;
        const sceneKey = promptMeta?.sceneKey || null;
        const isTemplateRun =
          pendingTplId &&
          promptMeta?.source === 'template' &&
          promptMeta?.edited === false &&
          matchesTemplateScene(lastTemplatePick, sceneKey);
        if (isTemplateRun && pendingTplId && !augmented.metadata?.templateId) {
          augmented.metadata = { ...(augmented.metadata || {}), templateId: pendingTplId };
        }

        if (isContinueEditMode && currentResult) {
          try {
            const previousResultFile = dataURLtoFile(currentResult.result || currentResult.imageUrl, 'previous-result.png');
            const previewUrl = URL.createObjectURL(previousResultFile);

            setUploadedFiles([previousResultFile]);
            setImagePreviews([previewUrl]);
            setEditOriginalImages([{ file: previousResultFile, preview: previewUrl }]);

            console.log(text.continueEditCompleted);
          } catch (error) {
            console.warn(text.movePreviousResultFailed, error);
          }

          setContinueEditFiles([]);
          setContinueEditFilePreviews([]);
          setContinueEditDimensions([]);
        }

        // 自动回填预置图（按比例，不分辨率）
        const autoDefaultParams = {
          ratio: selectedRatio.id,
          resolution: selectedResolution?.id || '',
          imageUrl: (result.data as any)?.result || (result.data as any)?.imageUrl,
          allowOverride: false as const
        };
        const resultImageUrl = autoDefaultParams.imageUrl;

        const resultTplId = (augmented as any)?.metadata?.templateId || null;
        const allowAutoDefault = !!resultTplId && lastTemplatePick?.id === resultTplId;

        if (
          allowAutoDefault &&
          mode === 'edit' &&
          !lastTemplatePick?.defaultImageUrl &&
          (!!(result.data as any)?.result || !!(result.data as any)?.imageUrl)
        ) {
          try {
            await templateAPI.setDefaultImage(resultTplId, autoDefaultParams);
            setLastTemplatePick(prev => prev && prev.id === resultTplId
              ? { ...prev, defaultImageUrl: resultImageUrl || prev.defaultImageUrl, defaultImageKey: `${selectedRatio.id}|${selectedResolution?.id || ''}` }
              : prev);
          } catch (err) {
            console.warn('auto set default image failed:', err);
          }
        } else if (
          allowAutoDefault &&
          mode === 'generate' &&
          !lastTemplatePick?.defaultImageUrl &&
          (!!(result.data as any)?.result || !!(result.data as any)?.imageUrl)
        ) {
          try {
            await templateAPI.setDefaultImage(resultTplId, autoDefaultParams);
            setLastTemplatePick(prev => prev && prev.id === resultTplId
              ? { ...prev, defaultImageUrl: resultImageUrl || prev.defaultImageUrl, defaultImageKey: `${selectedRatio.id}|${selectedResolution?.id || ''}` }
              : prev);
          } catch (err) {
            console.warn('auto set default image failed:', err);
          }
        }

        onProcessComplete(augmented as any);
        broadcastTemplateBadge({ status: 'idle' });
      } else {
        throw new Error(result.message || 'Processing failed');
      }
    };

    await processGenerateOrEdit().catch(handleFailure);
  };
  const primaryActionButton = (
    <DraggableActionButton
      onClick={handleSubmit}
      disabled={primaryDisabled}
      className={primaryActionClass(primaryDisabled, isPrimaryBusy)}
      icon={(
        <span
          aria-hidden="true"
          className={`order-2 primary-action-icon ${iconVariantClass}`}
        >
          <span className="primary-action-icon__orbit" aria-hidden="true" />
          <span className="primary-action-icon__glyph">🚀</span>
        </span>
      )}
    >
      <>
        <span className={`hidden xs:inline font-semibold tracking-wide drop-shadow-lg order-1 ${isPrimaryBusy ? 'primary-label--busy' : ''}`}>
          {(isPrimaryBusy ? busyLabelParts : primaryLabelParts)[0]}
        </span>
        <span className={`xs:hidden font-semibold tracking-wide drop-shadow-lg order-3 ${isPrimaryBusy ? 'primary-label--busy' : ''}`}>
          {isPrimaryBusy ? busyLabelCompact : primaryLabelCompact}
        </span>
        <span className={`hidden xs:inline font-semibold tracking-wide drop-shadow-lg order-3 ${isPrimaryBusy ? 'primary-label--busy' : ''}`}>
          {(isPrimaryBusy ? busyLabelParts : primaryLabelParts)[1]}
        </span>
        {isPrimaryBusy && (
          <span className="sr-only">
            {mode === 'generate' ? text.aiGenerating : mode === 'edit' ? text.aiEditing : text.aiAnalyzing}
          </span>
        )}
      </>
    </DraggableActionButton>
  );

  const promptInput = mode === 'analyze' ? (
    <MarkdownEditor
      value={prompt}
      onChange={(val) => {
        setPrompt(val);
        setPromptMeta(prev => {
          const next = { ...(prev || {}), source: 'user', edited: true, ts: Date.now() };
          try {
            console.log('[PromptChange] markdown', next);
          } catch {}
          return next;
        });
      }}
      placeholder={text.examplePromptAnalyze}
      disabled={isProcessing}
      defaultMode="edit"
      mode={analyzeEditorMode}
      onModeChange={setAnalyzeEditorMode}
      minHeight={150}
      variant="glass"
      className="border-0 shadow-none bg-[var(--surface-card)] text-[var(--text-primary)]"
    />
  ) : (
    <div className={promptShellClass}>
      <textarea
        value={prompt}
        onChange={(e) => {
          setIsQuickTemplatePrompt(false);
          setPrompt(e.target.value);
          setPromptMeta((prev) => {
            const next = { ...(prev || {}), source: 'user', edited: true, ts: Date.now() };
            try {
              console.log('[PromptChange] text', next);
            } catch {}
            return next;
          });
        }}
        placeholder={
          mode === 'generate'
            ? text.examplePromptGenerate
            : text.examplePromptEdit
        }
        className={promptTextareaClass}
        disabled={isProcessing}
      />
      <div className="pointer-events-none absolute bottom-5 right-4 text-xs text-[rgba(var(--text-secondary-rgb),0.65)]">
        {prompt.length}/1000
      </div>
    </div>
  );

  // 图片识别自定义场景（作为分析快捷指令）
  const [, setRecognitionQuickScenarios] = useState<{ label: string; content: string }[]>([]);
  const loadRecognitionScenarios = useCallback(async () => {
    const merged = new Map<string, { label: string; content: string }>();
    const insert = (label: string, content: string) => {
      const normalizedLabel = (label || text.analysisScenario).trim() || text.analysisScenario;
      const normalizedContent = (content || '').trim();
      if (!normalizedContent) return;
      merged.set(normalizedLabel, { label: normalizedLabel, content: normalizedContent });
    };

    try {
      const savedDefault = localStorage.getItem('customRecognitionPrompt') || '';
      insert(text.defaultScenario, (savedDefault && savedDefault.trim()) ? savedDefault : DEFAULT_RECOGNITION_PROMPT_FALLBACK);
    } catch {
      insert(text.defaultScenario, DEFAULT_RECOGNITION_PROMPT_FALLBACK);
    }
    insert(text.storeRecognitionScenario, STORE_RECOGNITION_PROMPT);

    try {
      const raw = localStorage.getItem('customRecognitionScenarios');
      if (raw) {
        const arr: string[] = JSON.parse(raw);
        if (Array.isArray(arr)) {
          arr.forEach((entry) => {
            const str = String(entry ?? '').trim();
            if (!str) return;
            const [name, ...rest] = str.split(':');
            const label = (name || '').trim() || text.analysisScenario;
            const content = (rest.length ? rest.join(':') : name || '').trim();
            insert(label, content);
          });
        }
      }
    } catch {
      // ignore malformed local data
    }

    setRecognitionQuickScenarios(Array.from(merged.values()));
  }, []);

  useEffect(() => {
    // 先加载本地，然后总是请求一次服务器，确保跨设备同步
    (async () => {
      await loadRecognitionScenarios();
      try {
        const resp = await recognitionAPI.getSettings();
        if (resp?.success && resp.data) {
          const { customRecognitionPrompt, recognitionScenarios } = resp.data as any;
          const srvDefault = (customRecognitionPrompt && typeof customRecognitionPrompt === 'string' && customRecognitionPrompt.trim()) ? customRecognitionPrompt : DEFAULT_RECOGNITION_PROMPT_FALLBACK;
          try { localStorage.setItem('customRecognitionPrompt', srvDefault); } catch {}
          if (Array.isArray(recognitionScenarios)) {
            const arr = recognitionScenarios.map((s: any) => `${s.name || ''}: ${s.content || ''}`);
            try { localStorage.setItem('customRecognitionScenarios', JSON.stringify(arr)); } catch {}
          }
          const merged = new Map<string, { label: string; content: string }>();
          const insert = (label: string, content: string) => {
            const normalizedLabel = (label || text.analysisScenario).trim() || text.analysisScenario;
            const normalizedContent = (content || '').trim();
            if (!normalizedContent) return;
            merged.set(normalizedLabel, { label: normalizedLabel, content: normalizedContent });
          };
          insert(text.defaultScenario, srvDefault);
          insert(text.storeRecognitionScenario, STORE_RECOGNITION_PROMPT);
          if (Array.isArray(recognitionScenarios)) {
            recognitionScenarios.forEach((s: any) => insert(s?.name, s?.content));
          }
          setRecognitionQuickScenarios(Array.from(merged.values()));
        }
      } catch (e) {
        console.warn(text.recognitionBackfillFailed, e);
      }
    })();
    const handler = () => loadRecognitionScenarios();
    window.addEventListener('recognitionScenariosUpdated', handler as any);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('recognitionScenariosUpdated', handler as any);
      window.removeEventListener('storage', handler);
    };
  }, [loadRecognitionScenarios]);

  // 离开“图片生成”模块时，如当前提示词属于“模板自动填充且未编辑”，视为临时遗留并清空
  const prevModeRef = useRef<AIMode>(mode);
  useEffect(() => {
    const prev = prevModeRef.current;
    if (prev !== mode) {
      if (prev === 'generate' && promptMeta?.source === 'template' && promptMeta?.edited === false) {
        try { console.debug('[ModuleSwitch] clear auto-filled template when leaving generate', { prevMode: prev, nextMode: mode, prevMeta: promptMeta }); } catch {}
        setPrompt('');
        setPromptMeta(null);
      }
      prevModeRef.current = mode;
    }
  }, [mode, promptMeta]);

  // 条件对齐：当左右第一张图片的朝向相同（都为横图或都为竖图）时，仅对齐“第一张左图”的高度到右侧结果图高度；否则恢复默认（不强制设置）
  const alignHeightsIfSameOrientation = useCallback(() => {
    // 需要有结果图渲染出来
    const resultImg = document.getElementById('result-image') as HTMLImageElement | null;
    if (!resultImg) return;

    // 判断右侧朝向
    const r = resultDimensions;
    if (!r) return;
    const rightIsLandscape = r.width > r.height;

    // 只看第一张左侧图片的朝向
    if (imagePreviews.length === 0) return;
    if (!imageDimensions[0]) return;
    const leftFirstIsLandscape = imageDimensions[0].width > imageDimensions[0].height;
    const sameOrientation = leftFirstIsLandscape === rightIsLandscape;

    const firstOriginal = document.querySelector<HTMLImageElement>('.original-image');
    if (!firstOriginal) return;

    if (!sameOrientation) {
      // 恢复默认：只清除第一张左图内联高度，并确保顶部对齐
      const el = firstOriginal as unknown as HTMLElement;
      el.style.height = '';
      el.style.objectFit = 'contain';
      el.style.objectPosition = 'top center';
      return;
    }

    // 同步高度
    const h = resultImg.getBoundingClientRect().height;
    if (!h || h <= 0) return;
    const el = firstOriginal as unknown as HTMLElement;
    el.style.height = `${Math.round(h)}px`;
    el.style.objectFit = 'cover';
    el.style.objectPosition = 'top center';
  }, [resultDimensions, imagePreviews.length, imageDimensions]);

  // 在结果尺寸、左侧尺寸或数量变化、以及窗口缩放时进行一次条件对齐
  useEffect(() => {
    if (!currentResult) return;
    const cb = () => alignHeightsIfSameOrientation();
    const t = setTimeout(cb, 50);
    window.addEventListener('resize', cb);
    return () => { clearTimeout(t); window.removeEventListener('resize', cb); };
  }, [currentResult, alignHeightsIfSameOrientation]);


  const closeImagePreview = useCallback(() => {
    setShowImagePreview(false);
  }, []);

  // switchPreviewImage 已提前到键盘监听之前

  // 编辑处理
  const handleContinueEditing = useCallback(async () => {
    if (!imageResultUrl || !currentResult) return;
    try {
      const src = currentResult.result || currentResult.imageUrl || '';
      if (!src) return;
      let file: File;
      if (continueEditSourceOverride?.file) {
        file = continueEditSourceOverride.file;
      } else if (src.startsWith('data:')) {
        file = dataURLtoFile(src, 'continue-edit-source.png');
      } else {
        file = await urlToFile(src, 'continue-edit-source.png');
      }
      const previewUrl = src.startsWith('data:') ? src : URL.createObjectURL(file);

      setUploadedFiles([file]);
      setImagePreviews([previewUrl]);
      setEditOriginalImages([{ file, preview: previewUrl }]);
      setContinueEditFiles([]);
      setContinueEditFilePreviews([]);
      setContinueEditDimensions([]);
      setContinueEditSourceOverride(null);
      try {
        const img = new Image();
        img.onload = () => {
          setImageDimensions([{ width: img.width, height: img.height }]);
        };
        img.src = previewUrl;
      } catch {}
      console.log(text.continueEditActivated);
    } catch (err) {
      console.warn(text.movePreviousResultFailed, err);
    }
  }, [
    continueEditSourceOverride,
    currentResult,
    imageResultUrl,
    text.continueEditActivated,
    text.movePreviousResultFailed
  ]);

  // 模式切换处理
  const handleModeChange = useCallback(async (newMode: AIMode) => {
    const previousMode = mode;
    // 先保存当前模块的左侧上传区状态
    if (previousMode === 'edit') {
      setEditCache({ files: uploadedFiles, previews: imagePreviews, dims: imageDimensions });
    } else if (previousMode === 'analyze') {
      setAnalyzeCache({ files: uploadedFiles, previews: imagePreviews, dims: imageDimensions });
    }
    
    // 从生成模式切换到编辑模式时的自动迁移
    if (previousMode === 'generate' && newMode === 'edit' && currentResult?.imageUrl && editCache.files.length === 0 && editCache.previews.length === 0) {
      try {
        const file = await urlToFile(currentResult.imageUrl, 'generated-image.png');
        setUploadedFiles([file]);
        setImagePreviews([currentResult.imageUrl]);
        setEditOriginalImages([{ file, preview: currentResult.imageUrl }]);
        
        // 清空右侧结果
                          if (historySelection) {
                            setIsQuickTemplatePrompt(false);
                            setPrompt('');
                            setPromptMeta({
                              source: 'user',
                              edited: true,
                              ts: Date.now(),
                            });
                            lastHistoryPromptIdRef.current = null;
                            onHistoryPromptDraftConsumed?.();
                            onExitHistoryPlayback?.();
                            return;
                          }
                          onClearResult?.();
        
        console.log(text.autoLoadIntoEdit);
      } catch (error) {
        console.error(text.moveImageFailed, error);
      }
    }
    
    // 目标模块：恢复其缓存的左侧上传区状态（生成模块不使用上传，置空）
    if (newMode === 'edit') {
      setUploadedFiles(editCache.files);
      setImagePreviews(editCache.previews);
      setImageDimensions(editCache.dims);
    } else if (newMode === 'analyze') {
      setUploadedFiles(analyzeCache.files);
      setImagePreviews(analyzeCache.previews);
      setImageDimensions(analyzeCache.dims);
    } else {
      setUploadedFiles([]);
      setImagePreviews([]);
      setImageDimensions([]);
    }
    
    setMode(newMode);
    onModeChange?.(newMode);
  }, [mode, currentResult, onClearResult, onModeChange, uploadedFiles, imagePreviews, imageDimensions, editCache.files.length, editCache.previews.length, analyzeCache.files.length, analyzeCache.previews.length]);

  // 当父组件的 selectedMode 改变（底部按钮切换）时，触发内部切换逻辑
  useEffect(() => {
    if (mode !== selectedMode) {
      (async () => { await handleModeChange(selectedMode); })();
    }
  }, [selectedMode]);

  // 文件处理
  const handleFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    // 上传前校验：文件大小（与后端 multer 限制一致）
    const tooLarge = imageFiles.find(file => file.size > MAX_UPLOAD_BYTES);
    if (tooLarge) {
      openUploadOptimizeModal({ kind: 'left', files: imageFiles });
      return;
    }

    if (mode === 'analyze') {
      setAnalysisResult(null);
      const file = imageFiles[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          if (Math.max(img.width, img.height) > MAX_UPLOAD_LONG_EDGE) {
            emitUploadValidationError(text.uploadTooWideTitle, text.uploadTooWideDetail);
            setUploadedFiles([]);
            setImagePreviews([]);
            setImageDimensions([]);
            return;
          }
          setUploadedFiles([file]);
          setImagePreviews([dataUrl]);
          setImageDimensions([{ width: img.width, height: img.height }]);
        };
        img.onerror = () => {
          setUploadedFiles([]);
          setImageDimensions([]);
        };
        img.src = dataUrl;
      };
      reader.onerror = () => {
        setUploadedFiles([]);
        setImagePreviews([]);
        setImageDimensions([]);
      };
      reader.readAsDataURL(file);
      return;
    }

    const maxFiles = 3;
    const remainingSlots = maxFiles - uploadedFiles.length;
    if (remainingSlots <= 0) return;

    const validFiles = imageFiles.slice(0, remainingSlots);
    if (validFiles.length === 0) return;

    const tmpPreviews: (string | undefined)[] = new Array(validFiles.length);
    const tmpDims: ({width:number;height:number} | undefined)[] = new Array(validFiles.length);
    const tmpOriginals: ({ file: File; preview: string } | undefined)[] = new Array(validFiles.length);
    const tmpFiles: (File | undefined)[] = new Array(validFiles.length);
    let done = 0;
    let rejectedByResolution = 0;
    validFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          if (Math.max(img.width, img.height) > MAX_UPLOAD_LONG_EDGE) {
            rejectedByResolution += 1;
          } else {
            tmpPreviews[index] = result;
            tmpOriginals[index] = { file, preview: result };
            tmpDims[index] = { width: img.width, height: img.height };
            tmpFiles[index] = file;
          }
          done += 1;
          if (done === validFiles.length) {
            const addPreviews = tmpPreviews.filter(Boolean) as string[];
            const addDims = tmpDims.filter(Boolean) as {width:number;height:number}[];
            const addOriginals = tmpOriginals.filter(Boolean) as { file: File; preview: string }[];
            const addFiles = tmpFiles.filter(Boolean) as File[];
            if (addFiles.length) setUploadedFiles(prev => [...prev, ...addFiles]);
            if (addPreviews.length) setImagePreviews(prev => [...prev, ...addPreviews]);
            if (addDims.length) setImageDimensions(prev => [...prev, ...addDims]);
            if (addOriginals.length) setEditOriginalImages(prev => [...prev, ...addOriginals]);
            if (rejectedByResolution > 0) {
              emitUploadValidationError(text.uploadTooWideTitle, text.uploadTooWideDetail);
            }
          }
        };
        img.onerror = () => {
          done += 1;
          if (done === validFiles.length) {
            const addPreviews = tmpPreviews.filter(Boolean) as string[];
            const addDims = tmpDims.filter(Boolean) as {width:number;height:number}[];
            const addOriginals = tmpOriginals.filter(Boolean) as { file: File; preview: string }[];
            const addFiles = tmpFiles.filter(Boolean) as File[];
            if (addFiles.length) setUploadedFiles(prev => [...prev, ...addFiles]);
            if (addPreviews.length) setImagePreviews(prev => [...prev, ...addPreviews]);
            if (addDims.length) setImageDimensions(prev => [...prev, ...addDims]);
            if (addOriginals.length) setEditOriginalImages(prev => [...prev, ...addOriginals]);
            if (rejectedByResolution > 0) {
              emitUploadValidationError(text.uploadTooWideTitle, text.uploadTooWideDetail);
            }
          }
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    });
  }, [emitUploadValidationError, mode, openUploadOptimizeModal, text.uploadTooWideDetail, text.uploadTooWideTitle, uploadedFiles.length]);


  // 从 DataTransfer 提取网页图片 URL（支持 text/uri-list 与 text/html）
  const extractImageUrlsFromDataTransfer = (dt: DataTransfer): string[] => {
    const urls = new Set<string>();
    try {
      // 1) text/uri-list: 按行分割
      const uriList = dt.getData('text/uri-list');
      if (uriList) {
        uriList.split('\n').forEach(line => {
          const url = line.trim();
          if (url && !url.startsWith('#')) urls.add(url);
        });
      }
      // 2) text/plain: 可能直接是一个 URL
      const plain = dt.getData('text/plain');
      if (plain && /^https?:\/\//i.test(plain.trim())) {
        urls.add(plain.trim());
      }
      // 3) text/html: 提取 <img src="...">
      const html = dt.getData('text/html');
      if (html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const img = doc.querySelector('img');
        const href = doc.querySelector('a')?.getAttribute('href') || '';
        if (img?.getAttribute('src')) urls.add(img.getAttribute('src')!);
        if (href && /^https?:\/\//i.test(href)) urls.add(href);
      }
    } catch {}
    return Array.from(urls);
  };

  // 远程图片 URL 转 File（可能受 CORS 限制）
  const urlToImageFileSafe = async (url: string, fallbackName = 'image'): Promise<File | null> => {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) return null;
      const ext = blob.type.split('/')[1] || 'png';
      const nameFromUrl = (() => {
        try {
          const u = new URL(url);
          const base = u.pathname.split('/').pop() || '';
          if (base && base.includes('.')) return base;
        } catch {}
        return `${fallbackName}.${ext}`;
      })();
      return new File([blob], nameFromUrl, { type: blob.type });
    } catch (err) {
      console.warn(text.crossOriginImageFailed, url, err);
      return null;
    }
  };

  // 拖拽处理
  const dragHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDrop: async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const dt = e.dataTransfer;
      const files = Array.from(dt.files);
      if (files.length > 0) {
        handleFiles(files);
        return;
      }
      // 处理从网页拖拽来的图片 URL
      const urls = extractImageUrlsFromDataTransfer(dt);
      if (urls.length === 0) return;
      const maxFiles = (mode === 'edit' ? 3 : 1) - uploadedFiles.length;
      if (maxFiles <= 0) return;
      const pick = urls.slice(0, maxFiles);
      const fetched: File[] = [];
      for (const u of pick) {
        const f = await urlToImageFileSafe(u);
        if (f) fetched.push(f);
      }
      if (fetched.length > 0) {
        handleFiles(fetched);
      } else {
        console.warn(text.fetchImageFailed);
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      handleFiles(Array.from(files));
    }
  };

  // 替换指定索引的文件
  const handleFileReplace = useCallback((index: number, file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      openUploadOptimizeModal({ kind: 'replace', file, index });
      return;
    }
    try {
      // 读取预览并测量尺寸
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          if (Math.max(img.width, img.height) > MAX_UPLOAD_LONG_EDGE) {
            emitUploadValidationError(text.uploadTooWideTitle, text.uploadTooWideDetail);
            return;
          }
          setUploadedFiles(prev => {
            const next = [...prev];
            next[index] = file;
            return next;
          });
          setImagePreviews(prev => {
            const next = [...prev];
            next[index] = dataUrl;
            return next;
          });
          setEditOriginalImages(prev => {
            const next = [...prev];
            next[index] = { file, preview: dataUrl };
            return next;
          });
          setImageDimensions(prev => {
            const next = [...prev];
            next[index] = { width: img.width, height: img.height };
            return next;
          });
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.warn(text.replaceImageFailed, e);
    }
  }, [emitUploadValidationError, openUploadOptimizeModal, text.replaceImageFailed, text.uploadTooWideDetail, text.uploadTooWideTitle]);

  const handleFileRemove = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);
    const newDimensions = imageDimensions.filter((_, i) => i !== index);
    const newOriginals = editOriginalImages.filter((_, i) => i !== index);
    
    setUploadedFiles(newFiles);
    setImagePreviews(newPreviews);
    setImageDimensions(newDimensions);
    setEditOriginalImages(newOriginals);
    
    // 需求更新：在编辑下，只要左侧发生“删除”动作就自动退出编辑（无论剩余数量）
    if (isContinueEditMode) setIsContinueEditMode(false);
  };

  const applyOptimizedFiles = useCallback((files: File[], context: UploadOptimizeContext) => {
    if (context.kind === 'left') {
      handleFiles(files);
    } else {
      if (files[0]) handleFileReplace(context.index, files[0]);
    }
  }, [handleFileReplace, handleFiles]);

  const handleOptimize = useCallback(async (mode: 'lossless' | 'compress') => {
    if (!uploadOptimizeState.context) return;
    setUploadOptimizeState(prev => ({ ...prev, busy: true, message: null }));
    const baseFiles = uploadOptimizeState.context.kind === 'replace'
      ? [uploadOptimizeState.context.file]
      : uploadOptimizeState.context.files;
    try {
      let processed: File[] = [];
      if (mode === 'lossless') {
        processed = await Promise.all(baseFiles.map(async (f) => {
          if (f.type.includes('jpeg') || f.type.includes('jpg')) {
            return await stripJpegMetadata(f);
          }
          return f;
        }));
      } else {
        processed = await Promise.all(baseFiles.map(async (f) => {
          if (f.size > MAX_UPLOAD_BYTES) {
            return await compressImageFile(f);
          }
          return f;
        }));
      }
      const overLimit = processed.filter(f => f.size > MAX_UPLOAD_BYTES);
      if (overLimit.length > 0) {
        const sizes = overLimit.map(f => `${f.name}:${formatBytes(f.size)}`).join(', ');
        const msg = typeof text.uploadOptimizeFailedWithSize === 'function'
          ? text.uploadOptimizeFailedWithSize(sizes)
          : text.uploadOptimizeFailed;
        setUploadOptimizeState(prev => ({ ...prev, busy: false, message: msg }));
        return;
      }
      const ctx = uploadOptimizeState.context;
      closeUploadOptimizeModal();
      applyOptimizedFiles(processed, ctx);
    } catch (err) {
      console.error('optimize upload failed', err);
      setUploadOptimizeState(prev => ({ ...prev, busy: false, message: text.uploadOptimizeFailed }));
    }
  }, [applyOptimizedFiles, closeUploadOptimizeModal, text.uploadOptimizeFailed, uploadOptimizeState.context]);

  const optimizeFiles = uploadOptimizeState.context
    ? (uploadOptimizeState.context.kind === 'replace'
      ? [uploadOptimizeState.context.file]
      : uploadOptimizeState.context.files)
    : [];
  const overLimitCount = optimizeFiles.filter(f => f.size > MAX_UPLOAD_BYTES).length;
  const hasJpegForLossless = optimizeFiles.some(f => /jpe?g/i.test(f.type));

  // 提示词优化功能
  // AI优化提示词：恢复原有逻辑（不接受额外参数）
  const handleOptimizePrompt = async (): Promise<string | undefined> => {
    if (!prompt.trim() || !sessionId) return;
    const targetLanguage = /[\u4e00-\u9fa5]/.test(prompt) ? 'zh' : 'en';
    
    setIsPolishing(true);
    try {
      // 检查是否为编辑模式且有图片
      if (mode === 'edit' && (uploadedFiles.length > 0 || isContinueEditMode)) {
        
        // 创建FormData - 关键：正确传递图片
        const formData = new FormData();
        
        // 根据模式添加图片
        if (isContinueEditMode && currentResult) {
          // 继续编辑：将生成结果转为文件
          const resultFile = dataURLtoFile(currentResult.result, 'continue-edit-analysis.png');
          formData.append('images', resultFile);
          
          // 添加新上传的图片
          continueEditFiles.forEach((file) => {
            formData.append('images', file);
          });
        } else {
          // 普通模式：添加所有上传的图片
          uploadedFiles.forEach((file) => {
            formData.append('images', file);
          });
        }
        
        // 添加其他参数
        formData.append('sessionId', sessionId || '');
        formData.append('userInstruction', prompt.trim());
        formData.append('customSystemPrompt', systemPrompt || '');
        formData.append('modelId', modelId);
        formData.append('targetLanguage', targetLanguage);
        
        // 调用智能分析API
        const response = await fetch(`${API_BASE_URL}/edit/intelligent-analysis-editing`, {
          method: 'POST',
          body: formData, // 注意：不设置Content-Type，让浏览器自动设置
        });
        
        const result = await response.json();
        if (result.success) {
          setPrompt(ensureMarkdown(result.data.editPrompt)); // 更新提示词（带基础Markdown）
        } else {
          throw new Error(result.error || 'Optimization failed');
        }
        
      } else {
        // 无图片的传统优化流程
        const currentSystemPrompt = systemPrompt || (mode === 'generate' 
          ? `你是一位专业的AI图像生成提示词优化专家，专门为Gemini 2.5 Flash Image Preview优化文生图提示词。

## 优化模板结构
1. 主体描述：清晰描述主要对象或人物
2. 环境场景：详细的背景和环境设定
3. 视觉风格：艺术风格、色彩搭配、光影效果
4. 构图细节：角度、景深、焦点
5. 情感氛围：整体感觉和情绪表达

## 优化要求
1. 将简单描述转化为叙事性场景
2. 增加视觉细节和感官描述
3. 使用专业摄影和艺术术语
4. 保持描述的连贯性和逻辑性
5. 突出视觉冲击力和美感
6. 确保描述适合AI理解和执行
7. 用中文输出优化后的提示词
8. 不要包含任何尺寸、分辨率或宽高比信息

请将输入转化为专业的、叙事驱动的提示词，遵循Gemini最佳实践。专注于场景描述和视觉叙事。只返回优化后的提示词，不要解释。`
          : `你是一位专业的AI图片编辑提示词优化专家，擅长为Gemini 2.5 Flash Image Preview生成精确的图片编辑指令。

请基于图片编辑最佳实践，优化用户的编辑指令，使其更加精确和专业。

## 优化重点
1. 明确编辑目标和范围
2. 保持原图的核心特征
3. 使用精确的编辑术语
4. 考虑视觉和谐性
5. 提供具体的修改指导

请优化编辑指令，使其更加专业和精确。只返回优化后的提示词，用中文输出。`);

        const response = await fetch(`${API_BASE_URL}/edit/polish-prompt`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId,
            originalPrompt: prompt,
            aspectRatio: selectedRatio.id,
            customSystemPrompt: currentSystemPrompt,
            promptType: mode === 'edit' ? 'editing' : 'generation',
            targetLanguage,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success && data.data?.polishedPrompt) {
          const polished = ensureMarkdown(data.data.polishedPrompt);
          setPrompt(polished);
          setPromptMeta({ source: 'optimize', edited: false, ts: Date.now() });
          return polished;
        }
      }
    } catch (error) {
      console.error(text.promptOptimizeFailed, error);
      alert(`${isZh ? '优化失败' : 'Optimization failed'}: ${error.message}`);
    } finally {
      setIsPolishing(false);
    }
    return undefined;
  };

  // 生成模板应用：将所选模板作为 system prompt，走模板填充流程（不影响“AI优化提示词”按钮）
  const applyGenerationTemplate = async (
    templateSystemPrompt: string,
    sceneKey?: string,
    templateName?: string
  ): Promise<string | undefined> => {
  if (!sessionId) { alert(text.sessionNotInitialized); return; }
  const myId = templateReqIdRef.current + 1;
  try {
      templateReqIdRef.current = myId;
      setIsTemplateFilling(true);
      try {
        // 调试：记录本次模板填充请求上下文
        console.log('[TemplateFill] start', {
          reqId: myId,
          sceneKey,
          templateName,
          hasSession: !!sessionId,
          prevMeta: promptMeta,
        });
      } catch {}
      const ar = selectedRatio.id;
      try { console.log('[TemplateFill] request payload', { reqId: myId, ar, templateName, sceneKey, ignoreUserBrief: true }); } catch {}
      const response = await fetch(`${API_BASE_URL}/edit/polish-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          // 重要：模板填充不依赖用户输入，统一传空，避免旧内容影响新场景
          originalPrompt: '',
          aspectRatio: ar,
          customSystemPrompt: templateSystemPrompt,
          promptType: 'generation',
          useTemplateFiller: true,
          templateName: templateName || ''
        })
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (myId !== templateReqIdRef.current) {
        // 已有更新的请求在进行，丢弃本次结果
        try { console.warn('[TemplateFill] stale response discarded', { reqId: myId, currentReqId: templateReqIdRef.current }); } catch {}
        return undefined;
      }
      if (data.success && data.data?.polishedPrompt) {
        const generated = ensureMarkdown(data.data.polishedPrompt);
        try { console.log('[TemplateFill] success', { reqId: myId, length: generated?.length, head: (generated||'').slice(0, 80) }); } catch {}
        setPrompt(generated);
        setPromptMeta({ source: 'template', sceneKey, edited: false, ts: Date.now() });
        setGenOptimizedBadge(true);
        return generated;
      }
      try { console.warn('[TemplateFill] empty result', { reqId: myId, payloadKeys: Object.keys(data||{}) }); } catch {}
    } catch (e: any) {
      console.warn(text.generationTemplateFailed, e);
      try { console.error('[TemplateFill] error', { reqId: myId, message: e?.message || String(e) }); } catch {}
      alert(`${isZh ? '模板应用失败' : 'Template application failed'}: ${e?.message || e}`);
    } finally {
      // 仅当本请求仍是最新时，关闭加载态
      if (templateReqIdRef.current === myId) {
        try { console.log('[TemplateFill] end', { reqId: myId }); } catch {}
        setIsTemplateFilling(false);
      }
    }
    return undefined;
  };

  const handleGenerateTemplatePick = useCallback(
    async (pick: {
      display: string;
      english?: string;
      id?: string;
      name?: string;
      nameZh?: string;
      nameEn?: string;
      emoji?: string;
      category?: string;
      content?: string;
      contentZh?: string;
      contentEn?: string;
      type?: string;
      ratio?: string;
      resolution?: string;
    }) => {
      try {
        console.log('[TemplateClick]', { pick });
      } catch {}
      if (isTemplateFilling) return;
      const sceneKey =
        pick.id || pick.name || pick.nameZh || pick.nameEn || pick.english || pick.display;
      const meta = buildTemplateMeta(pick);
      setLastTemplatePick({ ...pick, defaultImageUrl: undefined, defaultImageKey: undefined });
      broadcastTemplateBadge({ status: 'loading', template: meta });
      // BananaPro 模板（存于 edit-pro）不走 AI，加载即填充，且中英文按语言反转展示
      const isProTemplate = (pick.category || '').includes('pro');
      if (isProTemplate) {
        const zhText = pick.contentZh || pick.content || pick.display || '';
        const enText = pick.contentEn || pick.english || pick.display || pick.content || '';
        const promptText = isZh ? zhText : enText;
        const badgeBody = isZh ? enText : zhText;
        const badgeTitle = isZh
          ? (pick.nameEn || pick.name || pick.nameZh || '')
          : (pick.nameZh || pick.name || pick.nameEn || '');
        setPrompt(promptText);
        setPromptMeta({ source: 'template', sceneKey, edited: false, ts: Date.now() });
        setGenOptimizedBadge(false);
        // Pro 模板的胶囊已在 App 层直接设置，这里不再广播，避免覆盖
        return;
      }
      if (
        promptMeta?.source === 'template' &&
        promptMeta?.edited === false &&
        promptMeta?.sceneKey &&
        promptMeta.sceneKey !== sceneKey
      ) {
        try {
          console.log('[TemplateClick] clear previous auto-filled template due to scene change', {
            prevMeta: promptMeta,
            nextSceneKey: sceneKey,
          });
        } catch {}
        setPrompt('');
      }
      const templateName = pick.nameEn || pick.nameZh || pick.name || undefined;
      templateSceneKeyRef.current = sceneKey || null;
      const ok = await applyGenerationTemplate(
        pick.english || pick.display,
        sceneKey || undefined,
        templateName,
      );
      if (templateSceneKeyRef.current !== (sceneKey || null)) {
        return;
      }
      if (typeof ok === 'string' && ok.trim()) {
        setGenOptimizeMode('off');
        broadcastTemplateBadge({ status: 'ready', template: buildTemplateMeta(pick) });
      } else {
        broadcastTemplateBadge({
          status: 'error',
          template: buildTemplateMeta(pick),
          message: text.templateApplyFailed,
        });
      }
    },
    [isTemplateFilling, promptMeta, applyGenerationTemplate, buildTemplateMeta, broadcastTemplateBadge, text.templateApplyFailed],
  );

  // 提交处理 - 使用原来的完整实现

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      if (!detail) return;
      if (mode !== 'edit') {
        setMode('edit');
        onModeChange?.('edit');
      }
      applyEditTemplatePick(detail);
    };
    window.addEventListener('sidebar:edit-template', handler as EventListener);
    return () => window.removeEventListener('sidebar:edit-template', handler as EventListener);
  }, [applyEditTemplatePick, mode, onModeChange]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      if (!detail) return;
      const isPro = String(detail?.category || '').includes('pro');
      const ratioKey = `${selectedRatio.id || ''}|`;
      const sceneKey = detail.id || detail.name || detail.nameZh || detail.nameEn || detail.display || detail.english;

      const resolveDefaultFromPayload = () => {
        const imgs = detail.defaultImages || {};
        const exact = imgs[ratioKey];
        if (exact) {
          if (typeof exact === 'string') return exact;
          return exact.url || exact.signedUrl || null;
        }
        const first = Object.values(imgs)[0];
        if (first) {
          if (typeof first === 'string') return first;
          return first.url || first.signedUrl || null;
        }
        return null;
      };

      const zhText = detail.contentZh || detail.content || detail.display || '';
      const enText = detail.contentEn || detail.english || detail.display || detail.content || '';
      const promptText = isZh ? zhText : enText;

      const tryShowDefault = async () => {
        let defaultUrl: string | null = detail.defaultImageUrl || resolveDefaultFromPayload();
        if (!defaultUrl && detail.id) {
          try {
            const resp = await templateAPI.getDefaultImage(detail.id, { ratio: selectedRatio.id, resolution: selectedResolution?.id || '' });
            defaultUrl = resp.data?.url || null;
          } catch (e) {
            // ignore 404
            if ((e as any)?.status === 404 || (e as any)?.error === 'Default image not found') {
              setLastTemplatePick(prev => prev && prev.id === detail.id
                ? { ...prev, defaultImageUrl: undefined, defaultImageKey: undefined }
                : prev);
            }
          }
        }

        if (defaultUrl) {
          console.log('[TemplateDefault] show cached default image', { templateId: detail.id, ratio: selectedRatio.id, resolution: selectedResolution?.id || '' });
          const fakeResult: ImageEditResult = {
            id: `tpl-${detail.id || 'default'}-${Date.now()}`,
            sessionId: sessionId || '',
            prompt: promptText,
            mode: 'generate',
            inputImages: [],
            result: defaultUrl,
            resultType: 'image',
            createdAt: Date.now(),
            metadata: {
              templateId: detail.id,
            defaultImage: true,
            ratio: selectedRatio.id,
            resolution: selectedResolution?.id || ''
          }
        };
          onProcessComplete(fakeResult);
          setLastTemplatePick({
            ...detail,
            display: promptText,
            english: enText,
            emoji: resolveTemplateEmoji(detail),
            defaultImageUrl: defaultUrl,
            defaultImageKey: `${selectedRatio.id}|${selectedResolution?.id || ''}`,
          });
          setPrompt(promptText);
          setPromptMeta({ source: 'template', sceneKey, edited: false, ts: Date.now() });
          return true;
        }
        return false;
      };

      if (!isPro) {
        if (mode !== 'generate') {
          setMode('generate');
          onModeChange?.('generate');
        }
        (async () => {
          const shown = await tryShowDefault();
          if (shown) return;
          await handleGenerateTemplatePick(detail);
        })();
      } else {
        (async () => {
          const shown = await tryShowDefault();
          if (!shown) {
            setLastTemplatePick({
              ...detail,
              display: promptText,
              english: enText,
              emoji: resolveTemplateEmoji(detail),
            });
            setPrompt(promptText);
            setPromptMeta({ source: 'template', sceneKey, edited: false, ts: Date.now() });
          }
        })();
      }
    };
    window.addEventListener('sidebar:generate-template', handler as EventListener);
    return () => window.removeEventListener('sidebar:generate-template', handler as EventListener);
  }, [handleGenerateTemplatePick, mode, onModeChange, isZh, onProcessComplete, selectedRatio.id, sessionId, selectedResolution?.id]);

  // 自动将当前结果写入模板预置图（生成/编辑通用兜底）
  useEffect(() => {
    const tplId = lastTemplatePick?.id;
    if (!tplId || lastTemplatePick?.defaultImageUrl) return;
    const key = `${tplId}|${selectedRatio.id}|${selectedResolution?.id || ''}`;
    if (autoDefaultAttempted.current.has(key)) return;
    const imageUrl = currentResult?.result || (currentResult as any)?.imageUrl;
    const resultTplId = (currentResult as any)?.metadata?.templateId;
    if (!imageUrl) return;
    if (!(mode === 'generate' || mode === 'edit')) return;
    if (!resultTplId || resultTplId !== tplId) return;

    (async () => {
      try {
        autoDefaultAttempted.current.add(key);
        await templateAPI.setDefaultImage(tplId, {
          ratio: selectedRatio.id,
          resolution: selectedResolution?.id || '',
          imageUrl,
          allowOverride: false,
        });
        try { console.log('[TemplateDefault] saved', { tplId, ratio: selectedRatio.id, resolution: selectedResolution?.id || '' }); } catch {}
        setLastTemplatePick(prev => prev && prev.id === tplId
          ? { ...prev, defaultImageUrl: imageUrl, defaultImageKey: `${selectedRatio.id}|${selectedResolution?.id || ''}` }
          : prev);
      } catch (err) {
        console.warn('auto set default image failed (effect):', err);
      }
    })();
  }, [currentResult?.result, (currentResult as any)?.imageUrl, lastTemplatePick?.id, lastTemplatePick?.defaultImageUrl, mode, selectedRatio.id, selectedResolution?.id]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ label: string; content: string }>).detail;
      if (!detail) return;
      if (mode !== 'analyze') {
        setMode('analyze');
        onModeChange?.('analyze');
      }
      setPrompt(detail.content);
      setAnalyzeEditorMode('preview');
    };
    window.addEventListener('sidebar:analyze-scenario', handler as EventListener);
    return () => window.removeEventListener('sidebar:analyze-scenario', handler as EventListener);
  }, [mode, onModeChange]);

  const badgeVisible = templateInfoBadgeState.status !== 'idle';
  const headerGridClass = [
    'workflow-grid',
    mode === 'edit' ? 'workflow-grid--edit' : mode === 'analyze' ? 'workflow-grid--analyze' : 'workflow-grid--generate',
    'items-start gap-3 xl:gap-4'
  ].join(' ');
  const badgeWrapperClass = historyPanelVisible ? 'min-w-0 justify-self-end' : 'min-w-0';
  const badgeWrapperStyle: CSSProperties | undefined =
    historyPanelVisible && rightPaneWidth
      ? { width: `${rightPaneWidth}px`, maxWidth: '100%' }
      : undefined;

  return (
    <div className="workflow-shell space-y-[6px] xl:space-y-[14px]">
      {showModeSwitch ? (
        <div className="relative">
          <div className={headerGridClass}>
            <div className="min-w-0 xl:max-w-sm">
              <ModeToggle
                selectedMode={mode}
                onModeChange={handleModeChange}
                isProcessing={isProcessing}
                layout={badgeVisible ? 'horizontal' : 'vertical'}
                condensed={badgeVisible}
              />
            </div>
            {badgeVisible && (
              <div className={badgeWrapperClass} style={badgeWrapperStyle}>
                <TemplateInfoBadge
                  status={templateInfoBadgeState.status}
                  template={templateInfoBadgeState.template}
                  message={templateInfoBadgeState.message}
                  modeLabel={getModeDisplayLabel(mode)}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="relative">
        </div>
      )}
      
      {/* 上半部分：输入区域和结果展示 */}
      <div
        className={[
          'workflow-grid',
          mode !== 'generate' ? `workflow-grid--${mode}` : '',
        ].filter(Boolean).join(' ')}
      >
        {/* 左侧：动态输入区域（相对定位以托管悬浮面板） */}
        {mode !== 'generate' && (
          <div
            ref={leftColRef}
            className={[
              'workflow-pane',
              'workflow-pane--input',
              mode === 'edit' ? 'workflow-pane--edit' : '',
              forceTallForLayout ? 'workflow-pane--force' : '',
            ].filter(Boolean).join(' ')}
          >
            <DynamicInputArea
              mode={mode}
              selectedRatio={selectedRatio}
              onRatioChange={onRatioChange}
              aspectRatioOptions={ratioOptions}
              uploadedFiles={uploadedFiles}
              imagePreviews={imagePreviews}
              onFilesUploaded={handleFiles}
              onFileRemove={handleFileRemove}
              onFileReplace={handleFileReplace}
              onClearAll={() => {
                // 清理所有预览URL以避免内存泄漏
                imagePreviews.forEach(preview => {
                  if (preview && preview.startsWith('blob:')) {
                    URL.revokeObjectURL(preview);
                  }
                });
                
                setUploadedFiles([]);
                setImagePreviews([]);
                setEditOriginalImages([]);
                // 同步清理当前模块的左侧上传区缓存（不影响其他模块）
                if (mode === 'edit') {
                  setEditCache({ files: [], previews: [], dims: [] });
                } else if (mode === 'analyze') {
                  setAnalyzeCache({ files: [], previews: [], dims: [] });
                }
                // 不自动清空提示词，让用户手动控制
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
                
                // 清除所有时也应该退出编辑模式
                setIsContinueEditMode(false);
                setContinueEditFiles([]);
                setContinueEditFilePreviews([]);
              }}
              dragActive={dragActive}
              onDragHandlers={dragHandlers}
              fileInputRef={fileInputRef}
              onFileInputChange={handleFileInputChange}
              onRequestUploadLeft={() => {
                fileInputRef.current?.click();
              }}
              isSubmitting={isProcessing}
              isProcessing={isProcessing}
              onImagePreview={openImagePreview}
              maxPreviewHeight={maxPreviewHeight}
              highlight={mode === 'edit' && imagePreviews.length > 0 && !!currentResult}
              onToggleHistory={onToggleHistory}
              onSelectGenerateTemplate={handleGenerateTemplatePick}
              isTemplateFilling={isTemplateFilling}
              forceTall={forceTallForLayout}
              analysisPaneHeight={analyzePaneHeight}
              onAnnotateImage={mode === 'edit' ? handleAnnotateUpload : undefined}
              annotateLabel={text.annotateResult}
              annotateButtonClass={toolbarButtonClass}
            />
          </div>
        )}
        
        {/* 右侧：结果展示（承载指令面板） */}
        <div
          ref={rightColRef}
          className={[
            'workflow-pane',
            'workflow-pane--output',
            mode === 'edit' ? 'workflow-pane--edit' : '',
            mode === 'generate' ? 'workflow-pane--generate' : '',
            forceTallForLayout ? 'workflow-pane--force' : '',
          ].filter(Boolean).join(' ')}
        >
        {mode === 'edit' && (imagePreviews.length > 0 || !!currentResult) ? (
          // 编辑模式：显示修改后区域
          <div
            ref={resultCardRef}
            className={[
              promptResultCardClass,
              'border-[var(--border-soft)]'
            ].join(' ')}
            style={resultCardStyle}
          >
              {hasImageResult && (
                <div className="absolute bottom-3 right-3 z-20 pointer-events-none flex items-center gap-2">
                  <button
                    onClick={handleContinueEditing}
                    className={[
                      'pointer-events-auto',
                      toolbarButtonClass,
                      'flex items-center gap-1'
                    ].join(' ')}
                    title={text.continueEditLabel}
                  >
                    <span className="text-sm font-semibold">⬅</span>
                    <span className="text-sm font-semibold tracking-wide">{text.continueEditLabel}</span>
                  </button>
                </div>
              )}

              {currentResult ? (
                <>
                  {/* 图片显示区域（统一双图并列风格） */}
                  <div className="flex-1 p-0 h-full">
                      <div
                        className="relative group flex h-full w-full items-center justify-center"
                        onClick={() => openImagePreview(currentResult.result || currentResult.imageUrl, text.afterLabel, 'after')}
                      >
                            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-2)] cursor-pointer transition-colors hover:bg-[var(--surface-3)]">
                              {currentResult.resultType === 'image' ? (
                                <img
                                  data-pane-img
                                  id="result-image"
                                  src={currentResult.result || currentResult.imageUrl}
                                  alt={text.generatedImage}
                                  className={`${resultImageClass} transition-transform duration-200 hover:scale-105`}
                                  style={{ ...resultImageStyle, maxHeight: alignedResultImgMaxHeight }}
                                  onLoad={(e) => {
                                    const img = e.currentTarget;
                                    setResultDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                                    setTimeout(() => alignHeightsIfSameOrientation(), 0);
                                  }}
                                  onError={() => setResultDimensions(null)}
                                />
                              ) : (
                                <div
                                  className="flex h-full w-full min-h-[200px] items-center justify-center overflow-y-auto px-6 py-2.5"
                                  style={{ maxHeight: alignedResultImgMaxHeight }}
                                >
                                  <div className="text-gray-700 text-sm whitespace-pre-wrap text-center max-w-full">
                                {currentResult.result}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="absolute top-3 right-3 z-20 flex items-start space-x-2 pointer-events-none">
                          <button
                            type="button"
                            className="pointer-events-auto w-9 h-9 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow"
                            title={text.deleteImage}
                            onClick={(e) => {
                              e.stopPropagation();
                              onClearResult?.();
                            }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                          {(currentResult.resultType === 'image' || currentResult.imageUrl) && (
                            <a
                              href={currentResult.result || currentResult.imageUrl}
                              download="edited-image.png"
                              onClick={(e) => e.stopPropagation()}
                              className="pointer-events-auto w-9 h-9 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors shadow"
                              title={text.downloadImage}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                              </svg>
                            </a>
                          )}
                        </div>
                        {currentResult.resultType !== 'image' && (
                          <div className="absolute top-2 left-2 bg-blue-500/80 text-white text-xs px-2 py-1 rounded pointer-events-none">
                            {text.aiReply}
                          </div>
                        )}
                        {/* 移除编辑右侧的生成完成时间标记 */}
                      </div>
                  </div>
                
                  {/* 底部操作条已移除，按钮已上移为浮层 */}
                </>
              ) : (
                <div className="flex-1" style={{ minHeight: alignedResultImgMaxHeight, maxHeight: alignedResultImgMaxHeight }} />
              )}
            </div>
          ) : (mode === 'analyze' && analysisResult) ? (
            <div
              ref={analysisPaneRef}
              className="bg-white rounded-lg border border-gray-200 flex flex-col flex-1 min-h-0 overflow-hidden"
              style={analysisResultStyle}
            >
              <AnalysisResult
                result={analysisResult}
                onClose={() => setAnalysisResult(null)}
              />
            </div>
          ) : (mode === 'generate' && currentResult) ? (
            // 生成模式：画布结果（hover 删除 / 点击放大 / ESC关闭）
            <div
              ref={resultCardRef}
              className="relative flex flex-col flex-1 min-h-0 rounded-2xl border border-white/12 bg-white/8 backdrop-blur-xl shadow-[0_24px_60px_-32px_rgba(15,23,42,0.65)] transition-all"
              style={resultCardStyle}
            >
              <div className="flex-1 px-6 py-[10px] sm:px-7 sm:py-[10px] lg:px-8 lg:py-[10px] grid place-items-center">
                <div className="relative group grid h-full w-full place-items-center">
                  {(currentResult as any).resultType === 'image' ? (
                    <img data-pane-img
                      src={(currentResult as any).result || (currentResult as any).imageUrl}
                      alt={text.generationResult}
                      className="max-h-full max-w-full object-contain rounded-2xl shadow-[0_12px_32px_-18px_rgba(15,23,42,0.55)] cursor-pointer transition-transform duration-200 group-hover:scale-[1.015]"
                      onClick={() => openImagePreview((currentResult as any).result || (currentResult as any).imageUrl, text.generationResult, 'after')}
                    />
                  ) : (
                    <div
                      className="flex h-full w-full min-h-[200px] items-center justify-center overflow-y-auto px-6 py-2.5"
                      style={{ maxHeight: resultImageMaxHeightPx }}
                    >
                      <div className="text-[var(--text-primary)] text-sm whitespace-pre-wrap text-center max-w-full">
                        {(currentResult as any).result}
                      </div>
                    </div>
                  )}
                  {/* 右上角操作条：删除 / 下载 / 转入编辑 */}
                  <div className="absolute top-3 right-3 z-20 flex items-start space-x-2 pointer-events-none">
                    <button
                      type="button"
                      className="pointer-events-auto w-9 h-9 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow"
                      title={text.deleteImage}
                      onClick={() => {
                        onClearResult?.();
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    {/* 下载 - 绿色圆形 */}
                    <a
                      href={(currentResult as any).result || (currentResult as any).imageUrl}
                      download="generated-image.png"
                      className="pointer-events-auto w-9 h-9 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors shadow"
                      title={text.downloadImage}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </a>
                    {/* 转入编辑 - 白底紫边圆形 */}
                    <button
                      type="button"
                      className="pointer-events-auto w-9 h-9 bg-white border-2 border-purple-500 text-purple-600 hover:bg-purple-50 rounded-full flex items-center justify-center transition-colors shadow"
                      title={text.switchToEdit}
                      onClick={async () => {
                        try {
                          const src: string = (currentResult as any).result || (currentResult as any).imageUrl;
                          if (!src) return;
                          let file: File;
                          let previewUrl: string;
                          if (src.startsWith('data:')) {
                            file = dataURLtoFile(src, 'generated-image.png');
                            previewUrl = src;
                          } else {
                            file = await urlToFile(src, 'generated-image.png');
                            previewUrl = URL.createObjectURL(file);
                          }
                          setUploadedFiles([file]);
                          setImagePreviews([previewUrl]);
                          setEditOriginalImages([{ file, preview: previewUrl }]);
                          setMode('edit');
                          onModeChange?.('edit');
                        } catch (e) {
                          console.error(text.switchToEditFailed, e);
                        }
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    {/* 操作按钮集合结束 */}
                  </div>
                </div>
              </div>
            </div>
          ) : (() => { const errorResult = errorByMode[mode]; return !!errorResult; })() ? (
            // 仅显示当前模块的错误，不影响其他模块
            // 错误结果显示
            <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
              <div className="flex-1 p-6 flex items-center justify-center">
                <div className="text-center space-y-4 max-w-md">
                  {/* 错误图标 */}
                  <div className="text-red-400 mb-4">
                    <svg className="mx-auto h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z"
                      />
                    </svg>
                  </div>
                  
                  {/* 错误标题 */}
                  <div>
                    <h3 className="text-lg font-medium text-red-800 mb-2">
                      ⚠️ {errorByMode[mode]?.title}
                    </h3>
                    <p className="text-red-700 text-sm mb-4">
                      {errorByMode[mode]?.message}
                    </p>
                  </div>
                  
                  {/* 错误详情 */}
                  {errorByMode[mode]?.details && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left">
                      <div className="text-sm text-red-800 whitespace-pre-line">
                        {errorByMode[mode]?.details}
                      </div>
                    </div>
                  )}
                  
                  {/* AI原始回复 */}
                  {errorByMode[mode]?.originalResponse && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-left">
                      <div className="text-xs text-gray-600 mb-2 font-medium">{text.aiRawResponse}</div>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap">
                        {errorByMode[mode]?.originalResponse}
                      </div>
                    </div>
                  )}
                  
                  {/* 清除错误按钮 */}
                  <button
                    onClick={() => setErrorByMode(prev => ({ ...prev, [mode]: null }))}
                    className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm"
                  >
                    {text.clearError}
                  </button>
                  
                  {/* 时间戳 */}
                  <div className="text-xs text-gray-500">
                    {text.failureTime}{errorByMode[mode]?.timestamp ? new Date(errorByMode[mode]!.timestamp).toLocaleTimeString() : ''}
                  </div>
                </div>
              </div>
            </div>
          ) : (
          <div
            className="rounded-2xl border border-dashed border-white/15 bg-white/[0.06] backdrop-blur-xl flex flex-col items-center justify-center text-center"
            style={mode === 'edit' || mode === 'generate' ? { ...resultCardStyle, height: '100%' } : resultCardStyle}
          >
            <div
              className="w-full h-full flex flex-col items-center justify-center text-center p-6 sm:p-8"
              style={{ marginTop: '-10px' }}
            >
              <div className="mb-6">
                <div className="text-6xl xl:text-7xl 2xl:text-8xl 3xl:text-9xl mb-4 opacity-70">
                  {mode === 'generate' ? '🎨' : mode === 'edit' ? '✨' : '🔍'}
                </div>
                <h3 className="text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl font-semibold text-[var(--text-primary)] mb-2">
                  {mode === 'generate' ? text.creationCanvas : mode === 'edit' ? text.editPreview : text.analysisResult}
                </h3>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
      
      {/* 下半部分：提示词输入区域（横向全宽） */}
      <div
        ref={promptContainerRef}
        className={promptCardClass}
      >
        <div ref={promptHeaderRef} className="flex items-center justify-between mb-2 xl:mb-3">
          <div className="flex items-center flex-wrap gap-3">
            <span
              role="heading"
              aria-level={3}
              className="inline-flex items-center text-base sm:text-lg xl:text-xl font-semibold text-green-700 cursor-default select-none"
            >
              <span>{text.inputPrompt}</span>
            </span>
            {/* 编辑模式：同一行展示图片编辑快捷Prompt，与标题保持间距 */}
            {/* 生成模式的六大场景按钮已上移至画布选择区 */}
            {mode === 'generate' && isTemplateFilling && (
              <span className="inline-flex items-center gap-2 text-xs sm:text-sm text-gray-500 ml-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {text.generatingFromTemplate}
              </span>
            )}
            {/* 移除标题行的三段开关；生成模式下已将场景按钮上移至画布选择区 */}
          </div>
          <div className="flex flex-wrap items-center gap-2.5 -mt-[5px]">
            <button
              onClick={handleOptimizePrompt}
              disabled={!prompt.trim() || isPolishing || isProcessing}
              className={accentToolbarButtonClass}
              title={text.aiPromptRefinement}
            >
              {isPolishing ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-sm font-semibold">{text.autoOptimizing}</span>
                </>
              ) : (
                <>
                  <span className="text-emerald-200 text-base leading-none">✨</span>
                  <span className="text-sm font-semibold tracking-wide">{text.autoOptimizeLabel}</span>
                </>
              )}
            </button>
            {mode === 'generate' && (
              <button
                type="button"
                onClick={() => setGenOptimizeMode(genOptimizeMode === 'suggest' ? 'off' : 'suggest')}
                className={
                  genOptimizeMode === 'suggest'
                    ? `${toolbarButtonClass} border-emerald-400/50 bg-[rgba(16,185,129,0.15)] text-[rgba(4,120,87,0.95)]`
                    : toolbarButtonClass
                }
                title={text.autoOptimizeSwitchTitle}
              >
                <span className="text-sm font-semibold tracking-wide">{text.autoOptimizeLabelShort}</span>
                <span
                  className={`relative inline-flex h-5 w-10 rounded-full transition-colors ${
                    genOptimizeMode === 'suggest' ? 'bg-[rgba(16,185,129,0.75)]' : 'bg-[rgba(var(--text-secondary-rgb),0.35)]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      genOptimizeMode === 'suggest' ? 'translate-x-5' : ''
                    }`}
                  />
                </span>
              </button>
            )}
            {mode === 'generate' && genOptimizedBadge && genPrevPrompt && (
              <button
                className={toolbarButtonClass}
                title={text.undoAutoOptimize}
                onClick={() => {
                  setPrompt(genPrevPrompt!);
                  setGenPrevPrompt(null);
                  setGenOptimizedBadge(false);
                  setGenOptimizeMode('off');
                }}
              >
                <span className="text-sm">↺</span>
                <span className="text-xs font-medium">{text.restoreOriginalPrompt}</span>
              </button>
            )}
          </div>
        </div>
        <div className="relative mt-6">
          <div className="absolute -top-[70px] left-1/2 -translate-x-1/2">
            {primaryActionButton}
          </div>
          <div className="pt-0 -mt-[5px]">
            {promptInput}
          </div>
        </div>

      </div>
      
      {/* 系统提示词模态框交由 App.tsx 的 SystemPromptModal 统一渲染，避免重复弹出 */}
      
      {/* 图片预览模态框 */}
      {showAnnotator && (
        <ImageAnnotatorModal
          isOpen={showAnnotator}
          imageUrl={annotatorImageUrl}
          originalUrl={annotatorOriginalUrl}
          onClose={closeAnnotator}
          onSave={handleAnnotatorSave}
        />
      )}
      {showImagePreview && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50"
          onClick={closeImagePreview}
          onWheelCapture={(e) => { e.preventDefault(); }}
          onTouchMoveCapture={(e) => { e.preventDefault(); }}
          style={{ touchAction: 'none' }}
        >
          <div className="relative max-w-full max-h-full p-4" onClick={(e) => e.stopPropagation()}>
            <div
              ref={previewWrapRef}
              className="relative overflow-hidden bg-black/20 cursor-grab"
              style={{ width: '90vw', height: '90vh', maxWidth: '90vw', maxHeight: '90vh' }}
              onWheel={(e) => {
                e.preventDefault();
                const rect = previewWrapRef.current?.getBoundingClientRect();
                const cx = rect ? e.clientX - rect.left : 0;
                const cy = rect ? e.clientY - rect.top : 0;
                const prev = previewScale;
                const delta = -e.deltaY;
                const factor = delta > 0 ? 1.1 : 0.9;
                const next = Math.min(8, Math.max(1, prev * factor));
                if (next === prev) return;
                const nx = cx - (cx - previewOffset.x) * (next / prev);
                const ny = cy - (cy - previewOffset.y) * (next / prev);
                setPreviewScale(next);
                setPreviewOffset({ x: nx, y: ny });
              }}
              onMouseDown={(e) => {
                previewDraggingRef.current = true;
                previewLastPosRef.current = { x: e.clientX, y: e.clientY };
                (e.currentTarget as HTMLElement).classList.add('cursor-grabbing');
              }}
              onMouseMove={(e) => {
                if (!previewDraggingRef.current) return;
                const dx = e.clientX - previewLastPosRef.current.x;
                const dy = e.clientY - previewLastPosRef.current.y;
                previewLastPosRef.current = { x: e.clientX, y: e.clientY };
                setPreviewOffset((p) => ({ x: p.x + dx, y: p.y + dy }));
              }}
              onMouseUp={(e) => {
                previewDraggingRef.current = false;
                (e.currentTarget as HTMLElement).classList.remove('cursor-grabbing');
              }}
              onMouseLeave={(e) => {
                previewDraggingRef.current = false;
                (e.currentTarget as HTMLElement).classList.remove('cursor-grabbing');
              }}
              onDoubleClick={() => { setPreviewScale(1); setPreviewOffset({ x: 0, y: 0 }); }}
            >
              <img
                src={previewImageUrl}
                alt={previewImageTitle}
                className="select-none pointer-events-none w-full h-full object-contain"
                style={{ transform: `translate(${previewOffset.x}px, ${previewOffset.y}px) scale(${previewScale})`, transformOrigin: '0 0' }}
                onLoad={(e) => {
                  try {
                    const img = e.currentTarget as HTMLImageElement;
                    setPreviewNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                    const rect = previewWrapRef.current?.getBoundingClientRect();
                    if (rect) setPreviewWrapSize({ w: rect.width, h: rect.height });
                  } catch {}
                }}
              />

              {/* 关闭按钮：在缩放=1且未平移时贴图边缘；否则贴容器边缘 */}
              {(() => {
                const atBase = previewScale === 1 && Math.abs(previewOffset.x) < 0.5 && Math.abs(previewOffset.y) < 0.5;
                const gap = 16;
                let closeStyle: React.CSSProperties | undefined;
                if (atBase && previewNaturalSize && previewWrapSize.w && previewWrapSize.h) {
                  const { w: W, h: H } = previewWrapSize;
                  const { w: iw, h: ih } = previewNaturalSize;
                  const s = Math.min(W / iw, H / ih);
                  const cw = iw * s;
                  const ch = ih * s;
                  const cl = (W - cw) / 2;
                  const ct = (H - ch) / 2;
                  // 贴内容区域右上角，留出 gap
                  closeStyle = { right: (W - (cl + cw)) + gap, top: ct + gap };
                }
                return (
                  <button
                    onClick={closeImagePreview}
                    className={`absolute bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors ${
                      !(closeStyle) ? 'top-4 right-4' : ''
                    }`}
                    style={closeStyle}
                    title={text.closePreview}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                );
              })()}

              {/* 左右切换箭头 - 只在有两张图片时显示 */}
              {imagePreviews.length > 0 && currentResult && (() => {
                const atBase = previewScale === 1 && Math.abs(previewOffset.x) < 0.5 && Math.abs(previewOffset.y) < 0.5;
                const gap = 16;
                let leftStyle: React.CSSProperties | undefined;
                let rightStyle: React.CSSProperties | undefined;
                if (atBase && previewNaturalSize && previewWrapSize.w && previewWrapSize.h) {
                  const { w: W, h: H } = previewWrapSize;
                  const { w: iw, h: ih } = previewNaturalSize;
                  const s = Math.min(W / iw, H / ih);
                  const cw = iw * s;
                  const ch = ih * s;
                  const cl = (W - cw) / 2;
                  const ct = (H - ch) / 2;
                  leftStyle = { left: cl + gap, top: ct + ch / 2, transform: 'translate(0, -50%)' };
                  rightStyle = { right: (W - (cl + cw)) + gap, top: ct + ch / 2, transform: 'translate(0, -50%)' };
                }
                return (
                  <>
                    {previewImageType === 'after' && (
                      <button
                        onClick={switchPreviewImage}
                        className={`absolute bg-black/50 text-white p-3 rounded-full hover:bg-black/70 transition-colors ${
                          !(leftStyle) ? 'left-4 top-1/2 transform -translate-y-1/2' : ''
                        }`}
                        style={leftStyle}
                        title={text.viewBefore}
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                    )}
                    {previewImageType === 'before' && (
                      <button
                        onClick={switchPreviewImage}
                        className={`absolute bg-black/50 text-white p-3 rounded-full hover:bg-black/70 transition-colors ${
                          !(rightStyle) ? 'right-4 top-1/2 transform -translate-y-1/2' : ''
                        }`}
                        style={rightStyle}
                        title={text.viewAfter}
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {uploadOptimizeState.open && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/70 p-4">
          <div
            className="w-full max-w-lg rounded-2xl p-5 shadow-2xl border"
            style={{
              background: 'var(--annotator-glass)',
              borderColor: 'var(--border-soft)',
              boxShadow: '0 30px 80px -40px rgba(0,0,0,0.65)',
              backdropFilter: 'blur(18px) saturate(150%)',
              WebkitBackdropFilter: 'blur(18px) saturate(150%)',
              color: 'var(--text-primary)'
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{text.uploadOptimizeTitle}</h3>
              <button
                type="button"
                className="rounded-full p-1 text-[var(--text-secondary)] hover:bg-white/10"
                onClick={closeUploadOptimizeModal}
                disabled={uploadOptimizeState.busy}
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{text.uploadOptimizeHint}</p>
            <div className="mt-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-input)] px-3 py-2 text-xs text-[var(--text-primary)]/85">
              {optimizeFiles.map((file, idx) => (
                <div key={`${file.name}-${file.size}-${idx}`} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{file.name}</span>
                  <span className="whitespace-nowrap">{formatBytes(file.size)}</span>
                </div>
              ))}
              {overLimitCount > 0 && (
                <div className="mt-2 text-[11px] text-[var(--text-secondary)]">
                  {overLimitCount} / {optimizeFiles.length} {isZh ? '张超出 10MB' : 'over 10MB'}
                </div>
              )}
            </div>
            {uploadOptimizeState.message && (
              <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {uploadOptimizeState.message}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-[var(--border-soft)] bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-white/10 disabled:opacity-50"
                onClick={() => handleOptimize('lossless')}
                disabled={uploadOptimizeState.busy || !hasJpegForLossless}
              >
                {uploadOptimizeState.busy ? text.uploadOptimizeWorking : text.uploadOptimizeLossless}
              </button>
              <button
                type="button"
                className="rounded-full bg-blue-600/90 px-3 py-2 text-sm text-white hover:bg-blue-600 disabled:opacity-60 shadow-[0_10px_30px_-14px_rgba(59,130,246,0.65)]"
                onClick={() => handleOptimize('compress')}
                disabled={uploadOptimizeState.busy}
              >
                {uploadOptimizeState.busy ? text.uploadOptimizeWorking : text.uploadOptimizeCompress}
              </button>
              <button
                type="button"
                className="rounded-full px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 disabled:opacity-60"
                onClick={closeUploadOptimizeModal}
                disabled={uploadOptimizeState.busy}
              >
                {text.uploadOptimizeCancel}
              </button>
            </div>
            {!hasJpegForLossless && (
              <p className="mt-2 text-xs text-[var(--text-secondary)]">{text.uploadOptimizeLosslessNote}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
