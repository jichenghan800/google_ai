import React, { useState } from 'react';
import { ImageEditResult } from '../types/index';
import { ImageComparison } from './ImageComparison';
import { ImagePreviewModal } from './ImagePreviewModal';

interface ImageEditResultDisplayProps {
  result: ImageEditResult;
  onClose?: () => void;
  onContinueEdit?: () => void;
}

export const ImageEditResultDisplay: React.FC<ImageEditResultDisplayProps> = ({
  result,
  onClose,
  onContinueEdit
}) => {
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageTitle, setPreviewImageTitle] = useState<string>('');
  const [previewImageType, setPreviewImageType] = useState<'before' | 'after'>('before');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const openImagePreview = (imageUrl: string, title: string, type: 'before' | 'after' = 'before') => {
    setPreviewImageUrl(imageUrl);
    setPreviewImageTitle(title);
    setPreviewImageType(type);
    setIsPreviewOpen(true);
  };

  const closeImagePreview = () => {
    setIsPreviewOpen(false);
    setPreviewImageUrl(null);
  };

  const handleDownloadResult = () => {
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
        // 这里可以添加toast提示
        console.log('内容已复制到剪贴板');
      } catch (err) {
        console.error('复制失败:', err);
      }
    }
  };

  // 提取原图URLs
  const beforeImages = result.inputImages
    .filter(img => img.dataUrl)
    .map(img => img.dataUrl!);

  return (
    <>
      <div className="card p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center space-x-2">
            <span>🎨</span>
            <span>编辑结果</span>
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 编辑指令信息 */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-2">编辑指令</h3>
          <p className="text-gray-600 text-sm">{result.prompt}</p>
          
          <div className="mt-2 flex items-center text-xs text-gray-500">
            <span>上传了 {result.inputImages.length} 张图片</span>
            <span className="mx-2">•</span>
            <span>{new Date(result.createdAt).toLocaleString('zh-CN')}</span>
          </div>
        </div>

        {/* 图片对比显示 */}
        <div className="mb-6">
          <ImageComparison
            beforeImages={beforeImages}
            afterImage={result.result}
            onImagePreview={openImagePreview}
            currentResult={result}
          />
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-between items-center pt-4 border-t">
          <div className="flex space-x-3">
            {result.resultType === 'image' ? (
              <button
                onClick={handleDownloadResult}
                className="btn-primary flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>下载图片</span>
              </button>
            ) : (
              <button
                onClick={copyToClipboard}
                className="btn-primary flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 002 2m0 0h2a1 1 0 011 1v3M9 12l2 2 4-4" />
                </svg>
                <span>复制文本</span>
              </button>
            )}
          </div>

          <div className="flex space-x-3">
            {onContinueEdit && (
              <button
                onClick={onContinueEdit}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>继续编辑</span>
              </button>
            )}
          </div>
        </div>

        {/* 元数据信息 */}
        {result.metadata && (
          <div className="text-xs text-gray-500 border-t pt-3 mt-4">
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

      {/* 图片预览模态框 */}
      <ImagePreviewModal
        imageUrl={previewImageUrl}
        title={previewImageTitle}
        type={previewImageType}
        isOpen={isPreviewOpen}
        onClose={closeImagePreview}
      />
    </>
  );
};
