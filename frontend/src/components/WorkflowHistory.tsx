import React, { useState } from 'react';
import { ImageEditResult } from '../types/index.ts';
import { HistoryDetailModal } from './HistoryDetailModal.tsx';

interface WorkflowHistoryProps {
  editHistory: ImageEditResult[];
  onDeleteItem?: (id: string) => void;
  onClearAll?: () => void;
}

export const WorkflowHistory: React.FC<WorkflowHistoryProps> = ({ editHistory, onDeleteItem, onClearAll }) => {
  // 扁平化排序列表（倒序）
  const sorted = [...editHistory].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const handleSelectResult = (result: ImageEditResult) => {
    const idx = sorted.findIndex((r) => r.id === result.id);
    setSelectedIndex(idx >= 0 ? idx : null);
  };
  const handleCloseResult = () => setSelectedIndex(null);
  const handleNavigate = (newIndex: number) => {
    if (newIndex < 0 || newIndex >= sorted.length) return;
    setSelectedIndex(newIndex);
  };

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
        <div className="text-gray-400 mb-4">
          <svg className="mx-auto h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-medium text-gray-600 mb-2">还没有历史记录</h3>
        <p className="text-gray-500">完成您的第一个AI任务后，历史记录将显示在这里</p>
      </div>
    );
  }

  return (
    <>
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center">
            <span className="mr-2">📚</span>
            历史记录
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {editHistory.length} 个任务
            </span>
            <button
              type="button"
              className="text-sm px-3 py-1.5 rounded-md border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
              onClick={() => setConfirmOpen(true)}
              title="清空历史"
            >
              清空历史
            </button>
          </div>
        </div>
        
        <div className="space-y-6">
          {Object.entries(groupedHistory).map(([date, results]) => (
            <div key={date} className="space-y-3">
              <h3 className="text-sm font-medium text-gray-500 border-b pb-2">
                {date}
              </h3>
              
              <div className="space-y-3">
                {results.map((result) => {
                  const taskInfo = getTaskInfo(result);
                  return (
                    <div
                      key={result.id}
                      className={`border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors group ${taskInfo.border}`}
                      onClick={() => handleSelectResult(result)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          {/* 来源标记（简洁） */}
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-block w-2 h-2 rounded-full ${taskInfo.dot}`} />
                            <span className="text-xs text-gray-500">{taskInfo.label}</span>
                          </div>

                          {/* 提示词与文字结果预览（保持简洁） */}
                          {result.prompt.trim() && (
                            <p className="text-sm text-gray-700 mb-2 truncate">
                              {result.prompt}
                            </p>
                          )}
                          {result.resultType === 'text' && (
                            <p className="text-sm text-gray-600 line-clamp-2">
                              {result.result.substring(0, 100)}...
                            </p>
                          )}

                          <div className="flex items-center justify-between mt-2">
                            <div className="text-xs text-gray-500">
                              {new Date(result.createdAt).toLocaleTimeString('zh-CN')} • {result.metadata?.model}
                            </div>
                            <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                              >
                                查看详情 →
                              </button>
                              {onDeleteItem && (
                                <button
                                  className="text-red-600 hover:text-red-700 text-sm"
                                  title="删除此记录"
                                  onClick={(e) => { e.stopPropagation(); onDeleteItem(result.id); }}
                                >
                                  删除
                                </button>
                              )}
                            </div>
                          </div>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setConfirmOpen(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">清空历史</h3>
            <p className="text-sm text-gray-600 mb-4">此操作将清空本地历史记录，是否继续？</p>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded-md border text-gray-700 hover:bg-gray-50"
                onClick={() => setConfirmOpen(false)}
              >
                取消
              </button>
              <button
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
                onClick={() => { setConfirmOpen(false); onClearAll && onClearAll(); }}
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 查看详情模态框 */}
      {selectedIndex !== null && (
        <HistoryDetailModal
          results={sorted}
          index={selectedIndex}
          onClose={handleCloseResult}
          onNavigate={handleNavigate}
        />
      )}
    </>
  );
};
