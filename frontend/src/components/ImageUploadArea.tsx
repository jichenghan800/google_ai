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
      : 'cursor-pointer hover:border-white/20 hover:bg-white/[0.08]',
    isDragOver
      ? 'border-emerald-300/80 bg-emerald-300/10 shadow-[0_25px_65px_-32px_rgba(16,185,129,0.55)]'
      : 'border-white/12 bg-white/[0.04] shadow-[0_22px_55px_-32px_rgba(15,23,42,0.75)]'
  ];
  if (className) {
    containerClass.push(className);
  }

  const plusButtonClass = [
    'inline-flex h-12 w-12 items-center justify-center rounded-full border transition-colors duration-200 shadow-[0_18px_42px_-26px_rgba(148,163,184,0.65)]',
    isDragOver
      ? 'border-emerald-200/70 bg-emerald-300/20 text-emerald-100'
      : 'border-white/12 bg-white/[0.08] text-white hover:border-emerald-200/60 hover:bg-white/[0.14]',
    disabled ? 'cursor-not-allowed opacity-60' : ''
  ].join(' ');

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
      onClick={handleUploadClick}
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
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
        <div className="mt-5 space-y-2">
          <h3 className="text-xl font-semibold text-slate-100">
            {isDragOver ? '松开开始上传' : '上传图片'}
          </h3>
          <p className="text-sm text-slate-300/90 leading-relaxed">
            拖拽图片到这里或点击加号上传，支持 JPG、PNG、GIF、WebP，最大 10MB
            {maxFiles > 1 && (
              <span className="block mt-1 text-xs text-slate-400/80">最多可上传 {maxFiles} 张图片</span>
            )}
          </p>
        </div>
      </div>

      <span className="block text-center text-xs text-slate-400/85">支持拖拽、批量选择与粘贴上传</span>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-300/75">
        <span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1">
          <span>⚡</span>
          <span>实时预览</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1">
          <span>🧩</span>
          <span>智能排版</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1">
          <span>🔒</span>
          <span>本地安全</span>
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
