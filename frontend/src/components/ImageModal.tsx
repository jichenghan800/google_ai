import React from 'react';
import { GeneratedImage } from '../types/index.ts';

interface ImageModalProps {
  image: GeneratedImage | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ image, isOpen, onClose }) => {
  if (!isOpen || !image) return null;

  const handleDownload = async () => {
    try {
      const response = await fetch(image.imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `ai-generated-${image.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-75"
      onClick={handleBackdropClick}
    >
      <div className="relative max-w-4xl max-h-full bg-white rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-800">图片详情</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors duration-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Image */}
        <div className="relative">
          <img
            src={image.imageUrl}
            alt={image.prompt}
            className="w-full h-auto max-h-96 object-contain"
          />
        </div>

        {/* Details */}
        <div className="p-4 space-y-4">
          <div>
            <h4 className="font-medium text-gray-800 mb-2">描述</h4>
            <p className="text-gray-600 text-sm leading-relaxed">{image.prompt}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-700">风格:</span>
              <p className="text-gray-600">{image.parameters.style || '自然'}</p>
            </div>
            <div>
              <span className="font-medium text-gray-700">宽高比:</span>
              <p className="text-gray-600">{image.parameters.aspectRatio || '1:1'}</p>
            </div>
            <div>
              <span className="font-medium text-gray-700">质量:</span>
              <p className="text-gray-600">
                {image.parameters.quality === 'draft' && '草图'}
                {image.parameters.quality === 'standard' && '标准'}
                {image.parameters.quality === 'high' && '高质量'}
              </p>
            </div>
            <div>
              <span className="font-medium text-gray-700">生成时间:</span>
              <p className="text-gray-600">{new Date(image.createdAt).toLocaleString('zh-CN')}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              onClick={handleDownload}
              className="btn-primary flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>下载</span>
            </button>
            <button onClick={onClose} className="btn-secondary">
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};