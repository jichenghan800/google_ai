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
  maxFiles = 3,
  disabled = false,
  accept = 'image/*',
  className = ''
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const containerClass = [
    'group relative overflow-hidden rounded-2xl border border-dashed transition-all duration-300 backdrop-blur-xl px-6 py-12 sm:px-10 sm:py-14 text-center',
    disabled
      ? 'opacity-50 cursor-not-allowed pointer-events-none'
      : 'hover:border-white/20 hover:bg-white/[0.08]',
    isDragOver
      ? 'border-emerald-300/80 bg-emerald-300/10 shadow-[0_25px_65px_-32px_rgba(16,185,129,0.55)]'
      : 'border-white/12 bg-white/[0.04] shadow-[0_22px_55px_-32px_rgba(15,23,42,0.75)]'
  ];
  if (className) {
    containerClass.push(className);
  }

  const plusButtonClass = [
    'inline-flex items-center justify-center transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-300/70 disabled:opacity-60 disabled:cursor-not-allowed',
    isDragOver ? 'scale-105 drop-shadow-[0_10px_22px_rgba(56,189,248,0.45)]' : 'hover:scale-105 hover:drop-shadow-[0_10px_22px_rgba(56,189,248,0.35)]'
  ].join(' ');
  const dropzoneHeadingClass = 'text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl font-semibold text-slate-100';
  const dropzoneBodyClass = 'text-sm sm:text-base xl:text-lg 2xl:text-xl text-slate-300/90 leading-relaxed';
  const dropzoneFeatureClass = 'inline-flex items-center gap-2 text-xs sm:text-sm text-slate-200';
  const dropzoneSubtextClass = 'block mt-1 text-xs sm:text-sm text-slate-400/80';

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
      className={containerClass.join(' ')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-white/[0.02] to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
        {isDragOver && (
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/25 via-emerald-400/10 to-transparent opacity-80" />
        )}
        <div className="absolute -inset-px rounded-[inherit] border border-white/5 opacity-0 transition-opacity duration-300 group-hover:opacity-40" />
      </div>

      <div className="mb-6 flex flex-col items-center justify-center">
        <button
          type="button"
          className={plusButtonClass}
          onClick={(event) => {
            event.stopPropagation();
            handleUploadClick();
          }}
          disabled={disabled}
          aria-label="选择文件"
        >
          <img src="/upload.png" alt="上传图片" className="h-20 w-20 object-contain drop-shadow-[0_8px_20px_rgba(56,189,248,0.45)]" />
        </button>
        <div className="mt-5 space-y-2 text-center">
          <h3
          className={dropzoneHeadingClass}
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            if (!disabled) {
              handleUploadClick();
            }
          }}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && !disabled) {
              event.preventDefault();
              event.stopPropagation();
              handleUploadClick();
            }
          }}
        >
          上传图片
        </h3>
          <p className={dropzoneBodyClass}>
            上传图片并描述编辑需求，AI 将智能处理您的图片
            {maxFiles > 1 && (
              <span className={dropzoneSubtextClass}>最多可上传 {maxFiles} 张图片</span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs sm:text-sm text-slate-300/80">
        <span className={dropzoneFeatureClass}>
          <span className="text-lg leading-none">🖱️</span>
          <span>支持拖拽</span>
        </span>
        <span className={dropzoneFeatureClass}>
          <span className="text-lg leading-none">🗂️</span>
          <span>多图上传</span>
        </span>
        <span className={dropzoneFeatureClass}>
          <span className="text-lg leading-none">📋</span>
          <span>粘贴上传</span>
        </span>
      </div>

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
