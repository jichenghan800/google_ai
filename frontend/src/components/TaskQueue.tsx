import React, { useMemo } from 'react';
import { GenerationTask, QueueStatus } from '../types/index.ts';
import { useLocale } from '../contexts/LocaleContext.tsx';

interface TaskQueueProps {
  queuedTasks: GenerationTask[];
  queueStatus: QueueStatus | null;
  onCancelTask: (taskId: string) => void;
}

export const TaskQueue: React.FC<TaskQueueProps> = ({ queuedTasks, queueStatus, onCancelTask }) => {
  const { lang } = useLocale();
  const isZh = lang === 'zh';
  const text = useMemo(
    () => ({
      statusQueued: isZh ? '排队中' : 'Queued',
      statusProcessing: isZh ? '生成中' : 'Processing',
      statusCompleted: isZh ? '已完成' : 'Completed',
      statusFailed: isZh ? '失败' : 'Failed',
      queueTitle: isZh ? '任务队列' : 'Task Queue',
      queueLabel: isZh ? '队列' : 'Queued',
      processingLabel: isZh ? '处理中' : 'Processing',
      running: isZh ? '运行中' : 'Online',
      stopped: isZh ? '已停止' : 'Offline',
      processingHint: isZh ? '正在生成...' : 'Generating…',
      createdAt: isZh ? '创建时间' : 'Created at',
      style: isZh ? '风格' : 'Style',
      ratio: isZh ? '比例' : 'Aspect',
      errorPrefix: isZh ? '错误' : 'Error',
      cancelTask: isZh ? '取消任务' : 'Cancel task',
    }),
    [isZh],
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'processing':
        return 'bg-transparent text-emerald-700 border-emerald-500';
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
        return text.statusQueued;
      case 'processing':
        return text.statusProcessing;
      case 'completed':
        return text.statusCompleted;
      case 'failed':
        return text.statusFailed;
      default:
        return status;
    }
  };

  const formatDateTime = (timestamp: number) => new Date(timestamp).toLocaleString(isZh ? 'zh-CN' : 'en-US');

  if (queuedTasks.length === 0 && (!queueStatus || queueStatus.queueLength === 0)) {
    return null;
  }

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">{text.queueTitle}</h2>
        {queueStatus && (
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>
              {text.queueLabel}: {queueStatus.queueLength}
            </span>
            <span>
              {text.processingLabel}: {queueStatus.processing}
            </span>
            <div className={`flex items-center space-x-1 ${queueStatus.isProcessing ? 'text-green-600' : 'text-red-600'}`}>
              <div className={`w-2 h-2 rounded-full ${queueStatus.isProcessing ? 'bg-green-500' : 'bg-red-500'}`} />
              <span>{queueStatus.isProcessing ? text.running : text.stopped}</span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {queuedTasks.map((task) => (
          <div key={task.taskId} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-3">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(task.status)}`}>
                  {getStatusText(task.status)}
                </span>
                {task.status === 'processing' && (
                  <div className="flex items-center space-x-2">
                    <svg className="animate-spin h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="text-sm text-emerald-700">{text.processingHint}</span>
                  </div>
                )}
              </div>

              <p className="mt-2 text-sm text-gray-600 line-clamp-2">{task.prompt}</p>

              <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                <span>
                  {text.createdAt}: {formatDateTime(task.createdAt)}
                </span>
                <span>
                  {text.style}: {task.parameters.style || 'natural'}
                </span>
                <span>
                  {text.ratio}: {task.parameters.aspectRatio || '1:1'}
                </span>
              </div>

              {task.error && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {text.errorPrefix}: {task.error}
                </div>
              )}
            </div>

            {task.status === 'queued' && (
              <button
                onClick={() => onCancelTask(task.taskId)}
                className="ml-4 p-2 text-gray-400 hover:text-red-500 transition-colors duration-200"
                title={text.cancelTask}
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
