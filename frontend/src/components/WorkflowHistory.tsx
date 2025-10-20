import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { XMarkIcon, StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { ImageEditResult } from '../types/index.ts';

interface WorkflowHistoryProps {
  editHistory: ImageEditResult[];
  activeId?: string | null;
  onHistoryFocus?: (result: ImageEditResult | null) => void;
  onPromptReuse?: (result: ImageEditResult) => void;
  onDeleteItem?: (id: string) => void;
  onClearAll?: () => void;
  onBindClear?: (open: () => void) => void;
}

export const WorkflowHistory: React.FC<WorkflowHistoryProps> = ({
  editHistory,
  activeId,
  onHistoryFocus,
  onPromptReuse,
  onDeleteItem,
  onClearAll,
  onBindClear,
}) => {
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sorted = useMemo(
    () => [...editHistory].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [editHistory],
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('iwf:history:favorites');
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      return new Set(arr);
    } catch {
      return new Set();
    }
  });

  const handleSelectResult = useCallback(
    (result: ImageEditResult) => {
      const idx = sorted.findIndex((r) => r.id === result.id);
      setSelectedIndex(idx >= 0 ? idx : null);
      if (onHistoryFocus) {
        lastNotifiedRef.current = result.id;
        onHistoryFocus(result);
      }
    },
    [sorted, onHistoryFocus],
  );

  useEffect(() => {
    if (onBindClear) {
      onBindClear(() => setConfirmOpen(true));
    }
  }, [onBindClear]);

  useEffect(() => {
    try {
      localStorage.setItem('iwf:history:favorites', JSON.stringify(Array.from(favoriteIds)));
    } catch {}
  }, [favoriteIds]);

  const selectedResult = selectedIndex !== null ? sorted[selectedIndex] : null;
  const lastNotifiedRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!activeId) {
      setSelectedIndex(null);
      lastNotifiedRef.current = null;
      return;
    }
    const idx = sorted.findIndex((item) => item.id === activeId);
    if (idx !== -1 && idx !== selectedIndex) {
      setSelectedIndex(idx);
    }
  }, [activeId, sorted, selectedIndex]);

  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= sorted.length) {
      setSelectedIndex(sorted.length ? sorted.length - 1 : null);
    }
  }, [selectedIndex, sorted.length]);

  useEffect(() => {
    if (!onHistoryFocus || !selectedResult) return;
    if (lastNotifiedRef.current === selectedResult.id) return;
    lastNotifiedRef.current = selectedResult.id;
    onHistoryFocus(selectedResult);
  }, [selectedResult, onHistoryFocus]);

  useEffect(() => {
    if (selectedIndex === null) return;
    const container = listRef.current;
    const result = sorted[selectedIndex];
    if (!container || !result) return;
    const el = itemRefs.current[result.id];
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.classList.remove('animate-pulse');
    }, 360);
    el.classList.add('animate-pulse');
    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (elRect.top < containerRect.top + 12 || elRect.bottom > containerRect.bottom - 12) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    return () => window.clearTimeout(timer);
  }, [selectedIndex, sorted]);

  const toggleFavorite = useCallback((id: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 按日期分组历史记录
  const groupedHistory = sorted.reduce((groups: { [key: string]: ImageEditResult[] }, result) => {
    const date = new Date(result.createdAt).toLocaleDateString('zh-CN');
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(result);
    return groups;
  }, {});

  const getTaskInfo = (result: ImageEditResult) => {
    if (result.inputImages.length > 0 && result.prompt.trim()) {
      return { type: 'edit', label: '编辑', dot: 'bg-purple-500', border: 'border-l-4 border-purple-400' };
    } else if (result.inputImages.length > 0) {
      return { type: 'analyze', label: '分析', dot: 'bg-blue-500', border: 'border-l-4 border-blue-400' };
    } else {
      return { type: 'generate', label: '生成', dot: 'bg-emerald-500', border: 'border-l-4 border-emerald-400' };
    }
  };

  if (editHistory.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="text-[rgba(var(--text-secondary-rgb),0.6)] mb-4">
          <svg className="mx-auto h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-medium text-[var(--text-secondary)] mb-2">还没有历史记录</h3>
        <p className="text-[rgba(var(--text-secondary-rgb),0.8)]">完成您的第一个AI任务后，历史记录将显示在这里</p>
      </div>
    );
  }

  return (
    <>
      <div className="card p-3">
        <div className="space-y-3" ref={listRef}>
          {Object.entries(groupedHistory).map(([date, results]) => (
            <div key={date} className="space-y-3">
              <h3 className="text-sm font-medium text-[var(--text-secondary)] border-b border-[rgba(var(--text-primary-rgb),0.12)] pb-2">
                {date}
              </h3>
              
              <div className="space-y-3">
                {results.map((result) => {
                  const taskInfo = getTaskInfo(result);
                  const createdTime = new Date(result.createdAt).toLocaleTimeString('zh-CN');
                  const isActive = selectedResult?.id === result.id;
                  const isFavorite = favoriteIds.has(result.id);
                  const cardClass = [
                    'relative rounded-lg border border-[rgba(var(--text-primary-rgb),0.12)] bg-[var(--surface-1)] p-4 cursor-pointer transition-all group focus-within:ring-2 focus-within:ring-emerald-300/70 focus-within:outline-none',
                    taskInfo.border,
                    isActive ? 'bg-emerald-50/60 ring-2 ring-emerald-400/70 shadow-md translate-y-[-1px]' : 'hover:bg-[var(--surface-2)]',
                    isFavorite && !isActive ? 'border-amber-300/60' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <div
                      key={result.id}
                      ref={(el) => {
                        if (el) {
                          itemRefs.current[result.id] = el;
                        } else {
                          delete itemRefs.current[result.id];
                        }
                      }}
                      className={cardClass}
                      data-active={isActive ? 'true' : 'false'}
                      tabIndex={0}
                      onClick={() => handleSelectResult(result)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (result.prompt?.trim()) {
                          onPromptReuse?.(result);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectResult(result);
                        }
                      }}
                      aria-pressed={isActive}
                    >
                      <div
                        className={`absolute top-3 right-3 flex items-center gap-2 transition-opacity duration-200 ${
                          isFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                        }`}
                      >
                        <button
                          type="button"
                          className="p-1 rounded-full border border-amber-200 bg-[var(--surface-card)] text-amber-500 shadow hover:shadow-md hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                          title={isFavorite ? '取消收藏' : '收藏此记录'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(result.id);
                          }}
                        >
                          {isFavorite ? (
                            <StarSolidIcon className="h-4 w-4" />
                          ) : (
                            <StarOutlineIcon className="h-4 w-4" />
                          )}
                        </button>
                        {onDeleteItem && (
                          <button
                            type="button"
                            className="p-1 rounded-full border border-red-200 bg-[var(--surface-card)] text-[var(--text-secondary)] shadow hover:shadow-md hover:text-red-500 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200"
                            title="删除此记录"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteItem(result.id);
                            }}
                          >
                            <XMarkIcon className="h-4 w-4" strokeWidth={2.2} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-block w-2 h-2 rounded-full ${taskInfo.dot}`} />
                            <span className="text-xs text-[var(--text-secondary)]">{taskInfo.label}</span>
                          </div>

                          {result.prompt.trim() && (
                            <p className="text-sm text-[var(--text-primary)] mb-1 truncate">
                              {result.prompt}
                            </p>
                          )}
                          <div className="text-xs text-[rgba(var(--text-secondary-rgb),0.7)] mb-2">
                            {createdTime}
                          </div>
                          <div className="flex flex-wrap gap-2 text-[11px] text-[var(--text-secondary)]">
                            {isFavorite && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                <StarSolidIcon className="h-3 w-3" />
                                已收藏
                              </span>
                            )}
                          </div>
                          {result.resultType === 'text' && (
                            <p className="text-sm text-[rgba(var(--text-primary-rgb),0.85)] line-clamp-2">
                              {result.result.substring(0, 100)}...
                            </p>
                          )}
                        </div>
                        {result.resultType === 'image' && (
                          <div className="ml-4 flex-shrink-0">
                            <img src={result.result} alt="结果预览" className="w-16 h-16 object-cover rounded border" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 清空确认对话框 */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.45)] backdrop-blur-[2px] flex items-center justify-center" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-[var(--border-soft)] bg-[var(--surface-card)] p-6 shadow-[0_26px_70px_rgba(15,23,42,0.28)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">清空历史</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">此操作将清空本地历史记录，是否继续？</p>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded-md border border-[rgba(var(--text-primary-rgb),0.12)] text-[var(--text-secondary)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] transition-colors"
                onClick={() => setConfirmOpen(false)}
              >
                取消
              </button>
              <button
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm"
                onClick={() => { setConfirmOpen(false); onClearAll && onClearAll(); }}
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
};
