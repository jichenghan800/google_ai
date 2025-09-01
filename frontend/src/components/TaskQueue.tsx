import React from 'react';
import { GenerationTask, QueueStatus } from '../types/index.ts';

interface TaskQueueProps {
  queuedTasks: GenerationTask[];
  queueStatus: QueueStatus | null;
  onCancelTask: (taskId: string) => void;
}

export const TaskQueue: React.FC<TaskQueueProps> = ({ 
  queuedTasks, 
  queueStatus, 
  onCancelTask 
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'queued':
        return '排队中';
      case 'processing':
        return '生成中';
      case 'completed':
        return '已完成';
      case 'failed':
        return '失败';
      default:
        return status;
    }
  };

  if (queuedTasks.length === 0 && (!queueStatus || queueStatus.queueLength === 0)) {
    return null;
  }

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">任务队列</h2>
        {queueStatus && (
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>队列: {queueStatus.queueLength}</span>
            <span>处理中: {queueStatus.processing}</span>
            <div className={`flex items-center space-x-1 ${queueStatus.isProcessing ? 'text-green-600' : 'text-red-600'}`}>
              <div className={`w-2 h-2 rounded-full ${queueStatus.isProcessing ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span>{queueStatus.isProcessing ? '运行中' : '已停止'}</span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {queuedTasks.map((task) => (
          <div
            key={task.taskId}
            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-3">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(task.status)}`}
                >
                  {getStatusText(task.status)}
                </span>
                {task.status === 'processing' && (
                  <div className="flex items-center space-x-2">
                    <svg className="animate-spin h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span className="text-sm text-blue-600">正在生成...</span>
                  </div>
                )}
              </div>
              
              <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                {task.prompt}
              </p>
              
              <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                <span>创建时间: {new Date(task.createdAt).toLocaleString('zh-CN')}</span>
                <span>风格: {task.parameters.style || 'natural'}</span>
                <span>比例: {task.parameters.aspectRatio || '1:1'}</span>
              </div>
              
              {task.error && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  错误: {task.error}
                </div>
              )}
            </div>

            {task.status === 'queued' && (
              <button
                onClick={() => onCancelTask(task.taskId)}
                className="ml-4 p-2 text-gray-400 hover:text-red-500 transition-colors duration-200"
                title="取消任务"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};