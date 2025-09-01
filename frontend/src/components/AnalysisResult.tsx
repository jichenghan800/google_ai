import React from 'react';
import { ImageAnalysisResult } from '../types/index.ts';

interface AnalysisResultProps {
  result: ImageAnalysisResult;
  onClose: () => void;
}

export const AnalysisResult: React.FC<AnalysisResultProps> = ({ result, onClose }) => {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // 可以添加toast提示
    });
  };

  const downloadAsText = () => {
    const content = `图片分析结果\n\n时间: ${new Date(result.createdAt).toLocaleString('zh-CN')}\n\n分析内容:\n${result.analysis}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `图片分析_${new Date(result.createdAt).toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">分析结果</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => copyToClipboard(result.analysis)}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
            title="复制分析结果"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={downloadAsText}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
            title="下载分析结果"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors duration-200"
            title="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 图片预览 */}
        {result.imagePreview && (
          <div>
            <h4 className="font-medium text-gray-700 mb-3">原图片</h4>
            <img
              src={result.imagePreview}
              alt="分析的图片"
              className="w-full h-auto max-h-64 object-contain rounded-lg shadow-sm border"
            />
            
            {/* 图片信息 */}
            <div className="mt-3 text-sm text-gray-500 space-y-1">
              <div>文件名: {result.imageInfo.originalName}</div>
              <div>格式: {result.imageInfo.mimeType}</div>
              <div>大小: {(result.imageInfo.size / 1024).toFixed(1)} KB</div>
            </div>
          </div>
        )}

        {/* 分析内容 */}
        <div className={result.imagePreview ? '' : 'lg:col-span-2'}>
          <h4 className="font-medium text-gray-700 mb-3">AI分析结果</h4>
          <div className="bg-gray-50 rounded-lg p-4 max-h-80 overflow-y-auto">
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
              {result.analysis}
            </pre>
          </div>
          
          {/* 分析元数据 */}
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <div className="text-xs text-blue-700 space-y-1">
              <div><strong>分析时间:</strong> {new Date(result.createdAt).toLocaleString('zh-CN')}</div>
              <div><strong>使用模型:</strong> {result.metadata?.model || 'Gemini 2.5 Flash Lite'}</div>
              {result.prompt && result.prompt !== "请详细分析这张图片的内容" && (
                <div><strong>自定义提示:</strong> {result.prompt}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 快速操作 */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => copyToClipboard(result.analysis)}
            className="btn-secondary text-sm"
          >
            📋 复制分析内容
          </button>
          <button
            onClick={downloadAsText}
            className="btn-secondary text-sm"
          >
            💾 下载为文本
          </button>
          {result.imagePreview && (
            <button
              onClick={() => {
                const link = document.createElement('a');
                link.href = result.imagePreview!;
                link.download = `analyzed_image_${result.id}.png`;
                link.click();
              }}
              className="btn-secondary text-sm"
            >
              📥 保存图片
            </button>
          )}
        </div>
      </div>
    </div>
  );
};