import React from 'react';

interface ImagePreviewModalProps {
  imageUrl: string | null;
  title: string;
  type: 'before' | 'after';
  isOpen: boolean;
  onClose: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  imageUrl,
  title,
  type,
  isOpen,
  onClose
}) => {
  if (!isOpen || !imageUrl) return null;

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${type === 'before' ? 'original' : 'generated'}-image-${Date.now()}.png`;
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
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${
              type === 'before' ? 'bg-blue-500' : 'bg-green-500'
            }`}></div>
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          </div>
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
        <div className="relative max-h-96 overflow-hidden">
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-auto max-h-96 object-contain"
          />
          
          {/* Type indicator */}
          <div className={`absolute top-4 left-4 px-3 py-1 rounded text-sm font-medium ${
            type === 'before' 
              ? 'bg-blue-500/80 text-white' 
              : 'bg-green-500/80 text-white'
          }`}>
            {type === 'before' ? '原图' : '生成结果'}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center p-4 border-t">
          <div className="text-sm text-gray-500">
            点击背景或按 ESC 键关闭
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleDownload}
              className={`btn-primary flex items-center space-x-2 ${
                type === 'before' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-green-500 hover:bg-green-600'
              }`}
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
