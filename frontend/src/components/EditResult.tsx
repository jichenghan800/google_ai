import React, { useState } from 'react';
import { ImageEditResult } from '../types/index.ts';

interface EditResultProps {
  result: ImageEditResult;
  onClose: () => void;
}

export const EditResult: React.FC<EditResultProps> = ({ result, onClose }) => {
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  const handleDownloadImage = () => {
    if (result.resultType === 'image') {
      const link = document.createElement('a');
      link.href = result.result;
      link.download = `edited-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const copyToClipboard = async () => {
    if (result.resultType === 'text') {
      try {
        await navigator.clipboard.writeText(result.result);
        alert('内容已复制到剪贴板');
      } catch (err) {
        console.error('复制失败:', err);
        alert('复制失败，请手动复制');
      }
    }
  };

  const handleImageClick = () => {
    if (result.resultType === 'image') {
      setIsImageModalOpen(true);
    }
  };

  const handleCloseImageModal = () => {
    setIsImageModalOpen(false);
  };

  return (
    <>
      <div className="card p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-semibold text-gray-800">🎨 编辑结果</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 原始输入信息 */}
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-2">编辑指令</h3>
          <p className="text-gray-600 text-sm">{result.prompt}</p>
          
          <div className="mt-2 flex items-center text-xs text-gray-500">
            <span>上传了 {result.inputImages.length} 张图片</span>
            <span className="mx-2">•</span>
            <span>{new Date(result.createdAt).toLocaleString('zh-CN')}</span>
          </div>
        </div>

        {/* 结果展示 */}
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">AI 回复</h3>
          
          {result.resultType === 'image' ? (
            <div className="space-y-3">
              <div className="relative inline-block">
                <img
                  src={result.result}
                  alt="AI编辑结果"
                  className="max-w-full h-auto rounded-lg shadow-md border cursor-pointer hover:shadow-lg transition-shadow"
                  style={{ maxHeight: '400px' }}
                  onClick={handleImageClick}
                />
                {/* 放大图标提示 */}
                <div className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleDownloadImage}
                  className="btn-primary text-sm flex items-center space-x-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>下载图片</span>
                </button>
                <button
                  onClick={handleImageClick}
                  className="btn-secondary text-sm flex items-center space-x-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                  <span>查看原图</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-white border rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                  {result.result}
                </pre>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={copyToClipboard}
                  className="btn-primary text-sm flex items-center space-x-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 002 2m0 0h2a1 1 0 011 1v3M9 12l2 2 4-4" />
                  </svg>
                  <span>复制文本</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 元数据信息 */}
        {result.metadata && (
          <div className="text-xs text-gray-500 border-t pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div>模型: {result.metadata.model}</div>
              <div>输入图片: {result.metadata.inputImageCount} 张</div>
              {result.metadata.hasText && (
                <div className="text-green-600">✓ 包含文本回复</div>
              )}
              {result.metadata.hasImage && (
                <div className="text-blue-600">✓ 包含图片回复</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 图片放大模态框 */}
      {isImageModalOpen && result.resultType === 'image' && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={handleCloseImageModal}
        >
          <div className="max-w-screen-lg max-h-screen-90 p-4">
            <div className="relative">
              <img
                src={result.result}
                alt="AI编辑结果原图"
                className="max-w-full max-h-full object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={handleCloseImageModal}
                className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="absolute bottom-4 left-4 bg-black/50 text-white px-3 py-1 rounded text-sm">
                AI编辑结果 • 点击背景关闭
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
