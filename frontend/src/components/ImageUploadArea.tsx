import React, { useRef, useState, useCallback } from 'react';

interface ImageUploadAreaProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  disabled?: boolean;
  accept?: string;
  className?: string;
}

export const ImageUploadArea: React.FC<ImageUploadAreaProps> = ({
  onFilesSelected,
  maxFiles = 2,
  disabled = false,
  accept = "image/*",
  className = ""
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesSelected(files.slice(0, maxFiles));
    }
    // 清空input值，允许重复选择同一文件
    if (e.target) {
      e.target.value = '';
    }
  }, [onFilesSelected, maxFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    if (disabled) return;

    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('image/')
    );
    
    if (files.length > 0) {
      onFilesSelected(files.slice(0, maxFiles));
    }
  }, [disabled, onFilesSelected, maxFiles]);

  const handleUploadClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div
      className={`
        border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200
        ${isDragOver 
          ? 'border-blue-400 bg-blue-50' 
          : 'border-gray-300 bg-gray-50'
        }
        ${disabled 
          ? 'opacity-50 cursor-not-allowed' 
          : 'cursor-pointer hover:border-blue-400 hover:bg-blue-50'
        }
        ${className}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleUploadClick}
    >
      <div className="text-gray-400 mb-4">
        <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
      </div>
      
      <h3 className="text-lg font-medium text-gray-700 mb-2">
        {isDragOver ? '释放文件上传' : '上传图片'}
      </h3>
      
      <p className="text-sm text-gray-500 mb-4">
        拖拽图片到这里或点击上传<br/>
        支持 JPG, PNG, GIF, WebP 等格式，最大 10MB
        {maxFiles > 1 && <><br/>最多可上传 {maxFiles} 张图片</>}
      </p>
      
      <button
        type="button"
        className={`
          px-6 py-3 rounded-lg font-medium transition-colors
          ${disabled 
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
            : 'bg-blue-500 hover:bg-blue-600 text-white'
          }
        `}
        disabled={disabled}
      >
        选择文件
      </button>
      
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={maxFiles > 1}
        onChange={handleFileInput}
        disabled={disabled}
      />
    </div>
  );
};
