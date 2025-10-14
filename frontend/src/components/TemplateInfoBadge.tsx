import React, { useEffect, useMemo, useState, useLayoutEffect } from 'react';
import { DocumentDuplicateIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

export type TemplateInfoStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TemplateInfoMeta {
  title: string;
  body: string;
  emoji?: string;
}

export interface TemplateInfoBadgeProps {
  status: TemplateInfoStatus;
  template?: TemplateInfoMeta | null;
  message?: string;
  className?: string;
  modeLabel?: string;
}

export const TemplateInfoBadge: React.FC<TemplateInfoBadgeProps> = ({
  status,
  template,
  message,
  className = '',
  modeLabel = '当前模式 · 图片生成',
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState(false);
  const [enter, setEnter] = useState(false);

  const payloadKey = useMemo(() => {
    return `${status}::${template?.title || ''}::${template?.body || ''}`;
  }, [status, template?.title, template?.body]);
  const [lastPayloadKey, setLastPayloadKey] = useState(payloadKey);
  const hasPayloadChanged = payloadKey !== lastPayloadKey;
  const effectiveExpanded = !hasPayloadChanged && expanded;

  useLayoutEffect(() => {
    if (!hasPayloadChanged) return;
    setLastPayloadKey(payloadKey);
    setExpanded(false);
    setCopied(false);
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

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const bodyText = useMemo(() => (template?.body || '').trim(), [template?.body]);
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
    status === 'idle' ? 'template-info-shell--idle' : '',
    status === 'loading' ? 'template-info-shell--loading' : '',
    status === 'error' ? 'template-info-shell--error' : '',
    flash ? 'template-info-shell--flash' : '',
    enter ? 'template-info-shell--enter' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleCopy = async () => {
    if (!bodyText) return;
    try {
      await navigator.clipboard.writeText(bodyText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const toggleExpand = () => {
    setExpanded((prev) => !prev);
  };

  let content: React.ReactNode = null;
  if (status === 'loading') {
    content = (
      <div className="template-info-shell__content">
        <div className="template-info-main">
          <div className="template-info-header template-info-header--loading">
            <span className="template-info-title">
              <span className="template-info-emoji" aria-hidden="true">
                {emoji || '✨'}
              </span>
              <span className="template-info-title__text">{titleText}</span>
            </span>
            <span className="template-info-loading">生成中…</span>
          </div>
          <div
            className={[
              'template-info-body',
              !bodyText ? 'template-info-body--empty' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
              {compactBodyText || '正在生成模板描述…'}
          </div>
        </div>
        <div className="template-info-actions">
          <button
            type="button"
            className="template-info-btn"
            disabled
            title="模板生成中"
          >
            <DocumentDuplicateIcon className="template-info-btn__icon" />
            <span>复制</span>
          </button>
          <button
            type="button"
            className="template-info-btn"
            disabled
            title="模板生成中"
          >
            <ChevronDownIcon className="template-info-btn__icon" />
            <span>展开</span>
          </button>
        </div>
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
  } else if (status === 'ready') {
    content = (
      <div className="template-info-shell__content">
        <div className={['template-info-main', effectiveExpanded ? 'template-info-main--expanded' : ''].filter(Boolean).join(' ')}>
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
              effectiveExpanded ? 'template-info-body--expanded' : '',
              !bodyText ? 'template-info-body--empty' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
              {(effectiveExpanded ? bodyText : compactBodyText) || '当前模板暂无详细描述。'}
          </div>
        </div>
        <div className="template-info-actions">
          <button
            type="button"
            className="template-info-btn"
            onClick={handleCopy}
            disabled={!bodyText}
            title={copied ? '已复制' : '复制模板内容'}
          >
            <DocumentDuplicateIcon className="template-info-btn__icon" />
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
          <button
            type="button"
            className="template-info-btn"
            onClick={toggleExpand}
            title={effectiveExpanded ? '收起内容' : '展开完整内容'}
          >
            <ChevronDownIcon
              className={[
                'template-info-btn__icon',
                effectiveExpanded ? 'template-info-btn__icon--rotated' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
            <span>{effectiveExpanded ? '收起' : '展开'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <div className="template-info-shell__mode" aria-live="polite">
        {modeLabel}
      </div>
      {content}
    </div>
  );
};

export default TemplateInfoBadge;
