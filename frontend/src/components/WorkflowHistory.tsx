import React, { useState } from 'react';
import { ImageEditResult } from '../types/index.ts';

interface WorkflowHistoryProps {
  editHistory: ImageEditResult[];
}

export const WorkflowHistory: React.FC<WorkflowHistoryProps> = ({ 
  editHistory 
}) => {
  const [selectedResult, setSelectedResult] = useState<ImageEditResult | null>(null);

  const handleSelectResult = (result: ImageEditResult) => {
    setSelectedResult(result);
  };

  const handleCloseResult = () => {
    setSelectedResult(null);
  };

  // 按日期分组历史记录
  const groupedHistory = editHistory.reduce((groups: { [key: string]: ImageEditResult[] }, result) => {
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
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {editHistory.length} 个任务
          </span>
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
                            <button className="text-primary-600 hover:text-primary-800 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                              查看详情 →
                            </button>
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
    </>
  );
};
