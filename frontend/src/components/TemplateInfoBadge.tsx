import React, { useEffect, useMemo, useState, useLayoutEffect } from 'react';

export type TemplateInfoStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TemplateInfoMeta {
  title: string;
  body: string;
  emoji?: string;
}

export interface TemplateContextInfo {
  title: string;
  items: Array<{ label: string; value: string }>;
  accent?: 'default' | 'history';
}

export interface TemplateInfoBadgeProps {
  status: TemplateInfoStatus;
  template?: TemplateInfoMeta | null;
  message?: string;
  className?: string;
  modeLabel?: string;
  processingStatus?: 'idle' | 'loading' | 'success' | 'error';
  processingMessage?: string;
  inlineMessage?: string;
  contextInfo?: TemplateContextInfo | null;
}

export const TemplateInfoBadge: React.FC<TemplateInfoBadgeProps> = ({
  status,
  template,
  message,
  className = '',
  modeLabel = '当前模式 · 图片生成',
  processingStatus = 'idle',
  processingMessage,
  inlineMessage,
  contextInfo,
}) => {
  const [flash, setFlash] = useState(false);
  const [enter, setEnter] = useState(false);

  const payloadKey = useMemo(() => {
    const contextKey = contextInfo
      ? [
          contextInfo.title || '',
          (contextInfo.items || []).map((item) => `${item.label}:${item.value}`).join('|'),
          contextInfo.accent || '',
        ].join('::')
      : '';
    return [
      status,
      processingStatus,
      processingMessage || '',
      template?.title || '',
      template?.body || '',
      contextKey,
      inlineMessage || '',
    ].join('::');
  }, [status, processingStatus, processingMessage, template?.title, template?.body, contextInfo, inlineMessage]);
  const [lastPayloadKey, setLastPayloadKey] = useState(payloadKey);
  const hasPayloadChanged = payloadKey !== lastPayloadKey;
  const showProcessingState = processingStatus !== 'idle';

  useLayoutEffect(() => {
    if (!hasPayloadChanged) return;
    setLastPayloadKey(payloadKey);
  }, [hasPayloadChanged, payloadKey]);

  useEffect(() => {
    if (status !== 'ready') return;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 800);
    return () => window.clearTimeout(timer);
  }, [status, template?.title, template?.body]);

  useEffect(() => {
    setEnter(true);
    const timer = window.setTimeout(() => setEnter(false), 240);
    return () => window.clearTimeout(timer);
  }, [status, template?.title, template?.body]);

  const bodyText = useMemo(() => {
    const raw = (template?.body || '').trim();
    if (!raw) return '';
    return raw.replace(/^模板\s*[:：]\s*/u, '').trim();
  }, [template?.body]);
  const compactBodyText = useMemo(() => {
    if (!bodyText) return '';
    return bodyText.replace(/\s+/g, ' ').trim();
  }, [bodyText]);
  const titleText = useMemo(
    () => (template?.title || '').trim() || '常用方案',
    [template?.title],
  );
  const emoji = template?.emoji;

  const containerClass = [
    'template-info-shell',
    showProcessingState ? 'template-info-shell--processing' : '',
    !showProcessingState && status === 'idle' ? 'template-info-shell--idle' : '',
    !showProcessingState && status === 'loading' ? 'template-info-shell--loading' : '',
    !showProcessingState && status === 'error' ? 'template-info-shell--error' : '',
    flash ? 'template-info-shell--flash' : '',
    enter ? 'template-info-shell--enter' : '',
    contextInfo?.accent === 'history' ? 'template-info-shell--history' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const inlineText = inlineMessage?.trim() || '';
  const context = contextInfo && (contextInfo.items || []).length > 0 ? contextInfo : null;
  const hasInline = !context && inlineText.length > 0;

  let content: React.ReactNode = null;
  if (context) {
  const textClass = context.accent === 'history' ? 'text-[var(--text-inverted)]' : 'text-[var(--text-primary)]';
    content = (
      <div className="template-info-shell__content">
        <div
          className={[
            'flex items-center gap-2 px-1 text-xs leading-relaxed whitespace-nowrap overflow-hidden text-ellipsis',
            textClass,
          ].join(' ')}
        >
          <span className="font-semibold text-sm">{context.title}</span>
          {context.items.map((item, idx) => (
            <span
              key={`${item.label}-${item.value}-${idx}`}
              className="inline-flex items-center gap-1"
            >
              <span className="opacity-50">•</span>
              <span className="font-medium opacity-70">{item.label}</span>
              <span className="opacity-90">{item.value}</span>
            </span>
          ))}
        </div>
      </div>
    );
  } else if (hasInline) {
    content = (
      <div className="template-info-shell__status">
        <span
          className="template-info-status-text template-info-status-text--inline"
          role="status"
          aria-live="polite"
        >
          {inlineText}
        </span>
      </div>
    );
  } else if (showProcessingState) {
    const statusClass =
      processingStatus === 'success'
        ? 'template-info-status-text--success'
        : processingStatus === 'error'
          ? 'template-info-status-text--error'
          : 'template-info-status-text--loading';
    content = (
      <div className="template-info-shell__status">
        <span
          className={['template-info-status-text', statusClass].filter(Boolean).join(' ')}
          role="status"
          aria-live="polite"
        >
          {processingMessage || (processingStatus === 'loading' ? 'AI 正在处理中…' : '')}
        </span>
      </div>
    );
  } else if (status === 'error') {
    content = (
      <div className="template-info-shell__content">
        <div className="template-info-message template-info-message--error">
          <div className="template-info-message__title">
            {emoji ? (
              <span className="template-info-emoji" aria-hidden="true">
                {emoji}
              </span>
            ) : (
              <span className="template-info-emoji template-info-emoji--fallback" aria-hidden="true">
                ⚠️
              </span>
            )}
            <span>{titleText}</span>
          </div>
          <div className="template-info-message__body">
            {message || '模板应用失败，请稍后重试。'}
          </div>
        </div>
      </div>
    );
  } else if (status === 'ready' || (status === 'loading' && template)) {
    const isSoftLoading = status === 'loading';
    content = (
      <div className="template-info-shell__content">
        <div className={['template-info-main', isSoftLoading ? 'template-info-main--loading' : ''].filter(Boolean).join(' ')}>
          <div className="template-info-header">
            <span className="template-info-title">
              <span className="template-info-emoji" aria-hidden="true">
                {emoji || '✨'}
              </span>
              <span className="template-info-title__text">{titleText}</span>
            </span>
          </div>
          <div
            className={[
              'template-info-body',
              !bodyText ? 'template-info-body--empty' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
              {compactBodyText || '当前模板暂无详细描述。'}
          </div>
        </div>
      </div>
    );
  }

  const shouldShowModeLabel = !showProcessingState && status === 'idle' && !hasInline && !context;

  return (
    <div className={containerClass}>
      {shouldShowModeLabel && (
        <div className="template-info-shell__mode" aria-live="polite">
          {modeLabel}
        </div>
      )}
      {content}
    </div>
  );
};

export default TemplateInfoBadge;
