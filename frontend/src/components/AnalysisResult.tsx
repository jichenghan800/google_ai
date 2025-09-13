import React from 'react';
import { MarkdownRenderer } from './MarkdownRenderer.tsx';
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
    // 仅下载纯净的分析报告内容
    const blob = new Blob([result.analysis], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `图片分析_${new Date(result.createdAt).toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card p-4 mb-6 relative h-full flex flex-col">
      {/* 右上角浮动操作条（与生成/编辑风格一致） */}
      <div className="absolute top-2 right-2 z-20 flex items-center space-x-2 pointer-events-none">
        {/* 复制 - 白底蓝边圆形 */}
        <button
          onClick={() => copyToClipboard(result.analysis)}
          className="pointer-events-auto w-9 h-9 bg-white border-2 border-blue-500 text-blue-600 hover:bg-blue-50 rounded-full flex items-center justify-center transition-colors shadow"
          title="复制纯净报告"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
        {/* 下载 - 绿色圆形 */}
        <button
          onClick={downloadAsText}
          className="pointer-events-auto w-9 h-9 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors shadow"
          title="下载纯净报告 (Markdown)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
        {/* 关闭 - 白底红边圆形 */}
        <button
          onClick={onClose}
          className="pointer-events-auto w-9 h-9 bg-white border-2 border-red-500 text-red-600 hover:bg-red-50 rounded-full flex items-center justify-center transition-colors shadow"
          title="关闭"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 分析内容（仅显示AI分析结果，不展示原图信息/标题） */}
      <div className="bg-gray-50 rounded-lg p-4 flex-1 overflow-y-auto">
        <MarkdownRenderer content={result.analysis} />
      </div>
    </div>
  );
};
