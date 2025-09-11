import React from 'react';
import { CanvasSelector } from './CanvasSelector.tsx';
import { AspectRatioOption } from '../types/index.ts';
import { AIMode } from './ModeToggle.tsx';

interface DynamicInputAreaProps {
  mode: AIMode;
  
  // 画布选择相关（生成模式）
  selectedRatio?: AspectRatioOption;
  onRatioChange?: (ratio: AspectRatioOption) => void;
  aspectRatioOptions?: AspectRatioOption[];
  
  // 图片上传相关（编辑/分析模式）
  uploadedFiles?: File[];
  imagePreviews?: string[];
  onFilesUploaded?: (files: File[]) => void;
  onFileRemove?: (index: number) => void;
  onClearAll?: () => void;
  dragActive?: boolean;
  onDragHandlers?: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  fileInputRef?: React.RefObject<HTMLInputElement>;
  onFileInputChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRequestUploadLeft?: () => void; // 触发左侧上传（用于区分左右上传来源）
  
  // 处理状态相关
  isSubmitting?: boolean;
  isProcessing?: boolean;
  
  // 预览功能
  onImagePreview?: (imageUrl: string, title: string, type: 'before' | 'after') => void;
  maxPreviewHeight?: number; // 限制预览图最大高度（页面初始化时确定）
  highlight?: boolean; // 高亮边框（橙色虚线），用于提示当前编辑目标
  imageDimensions?: { width: number; height: number }[]; // 用于判断横竖图
}

export const DynamicInputArea: React.FC<DynamicInputAreaProps> = ({
  mode,
  selectedRatio,
  onRatioChange,
  aspectRatioOptions,
  uploadedFiles = [],
  imagePreviews = [],
  onFilesUploaded,
  onFileRemove,
  onClearAll,
  dragActive = false,
  onDragHandlers,
  fileInputRef,
  onFileInputChange,
  isSubmitting = false,
  isProcessing = false,
  onImagePreview,
  maxPreviewHeight,
  highlight = false,
  imageDimensions = [],
  onRequestUploadLeft
}) => {
  // 本地测量的图片尺寸，作为后备（Hooks 须在顶层调用）
  const [localDims, setLocalDims] = React.useState<{width:number;height:number}[]>([]);

  if (mode === 'generate') {
    // 画布选择模式
    if (!selectedRatio || !onRatioChange || !aspectRatioOptions) {
      return null;
    }
    
    return (
      <CanvasSelector
        selectedRatio={selectedRatio}
        onRatioChange={onRatioChange}
        aspectRatioOptions={aspectRatioOptions}
      />
    );
  }
  // 图片上传模式（编辑/分析）

  const getGridLayoutClass = (count: number) => {
    switch (count) {
      case 1: return 'grid-cols-1';
      case 2: {
        const dims = imageDimensions.length === 2 ? imageDimensions : (localDims.length === 2 ? localDims : [] as any);
        const bothLandscape = dims.length === 2 &&
          dims[0] && dims[1] &&
          dims[0].width > dims[0].height &&
          dims[1].width > dims[1].height;
        return bothLandscape ? 'grid-cols-1' : 'grid-cols-2';
      }
      case 3: return 'grid-cols-2';
      case 4: return 'grid-cols-2';
      default: return 'grid-cols-1';
    }
  };

  const dims = imageDimensions.length === 2 ? imageDimensions : (localDims.length === 2 ? localDims : [] as any);

  return (
    <div className={`relative border-2 border-dashed rounded-lg overflow-visible bg-gray-50 image-preview-responsive flex flex-col min-h-[480px] ${
      highlight ? 'border-orange-400' : 'border-gray-200'
    }`}>
      {/* 顶部浮层标题 */}
      <div className="absolute top-2 left-2 z-20 pointer-events-none">
        <span className="inline-block bg-black/60 text-white text-xs px-2 py-1 rounded">
          修改前
        </span>
      </div>
      
      {/* 顶部右侧浮层操作按钮（添加 / 清除） */}
      {imagePreviews.length > 0 && (
        <div className="absolute top-2 right-2 z-20 flex space-x-2 pointer-events-none">
          <button
            type="button"
            className="pointer-events-auto w-9 h-9 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center transition-colors disabled:bg-gray-300 shadow"
            onClick={() => {
              if (onRequestUploadLeft) {
                onRequestUploadLeft();
              } else {
                fileInputRef?.current?.click();
              }
            }}
            disabled={isSubmitting || isProcessing || uploadedFiles.length >= 2}
            title={uploadedFiles.length >= 2 ? '已达上限' : '添加更多'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            type="button"
            className="pointer-events-auto w-9 h-9 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors disabled:bg-gray-300 shadow"
            onClick={() => {
              if (onClearAll) {
                onClearAll();
              }
            }}
            disabled={isSubmitting || isProcessing}
            title="清除所有"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        {/* 原图预览 - 多张图片共享预览区域 */}
        <div className="h-full">
          {imagePreviews.length > 0 ? (
            <div className={`grid gap-2 ${getGridLayoutClass(imagePreviews.length)} h-full`}>
              {imagePreviews.map((preview, index) => (
                <div key={index} className={`relative group ${
                  imagePreviews.length === 3 && index === 2 ? 'col-span-2' : ''
                }`}>
                  <div 
                    className="w-full h-full overflow-hidden bg-gray-100 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-center"
                    onClick={() => {
                      // 调用预览功能
                      if (onImagePreview) {
                        onImagePreview(preview, '修改前', 'before');
                      }
                    }}
                  >
                    <img
                      src={preview}
                      alt={`原图 ${index + 1}`}
                      className="original-image w-full h-full object-contain hover:scale-105 transition-transform duration-200"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        setLocalDims(prev => {
                          const next = [...prev];
                          next[index] = { width: img.naturalWidth, height: img.naturalHeight };
                          return next;
                        });
                      }}
                    />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onFileRemove) {
                        onFileRemove(index);
                      }
                    }}
                    className="absolute top-2 right-2 bg-red-500 text-white w-9 h-9 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600 shadow-lg flex items-center justify-center"
                    disabled={isSubmitting || isProcessing}
                    title="删除图片"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  {/* 移除左下角文件名显示，保持画面简洁 */}
                  {/* 去除“点击预览原图”提示，保持画面简洁 */}
                </div>
              ))}
            </div>
          ) : (
            <div
              className={`flex-1 flex flex-col justify-center transition-colors duration-200 rounded-lg p-6 text-center ${
                dragActive ? 'bg-primary-50' : 'hover:bg-gray-100'
              }`}
              {...(onDragHandlers || {})}
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
              <p className="text-lg font-medium text-gray-600 mb-2">
                上传原图
              </p>
              <p className="text-sm text-gray-500 mb-4">
                拖拽图片到这里或点击上传<br/>
                支持 JPG, PNG, GIF, WebP 等格式，最大 10MB
              </p>
              <div className="flex justify-center space-x-3">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    if (onRequestUploadLeft) {
                      onRequestUploadLeft();
                    } else {
                      fileInputRef?.current?.click();
                    }
                  }}
                  disabled={isSubmitting || isProcessing}
                >
                  选择图片
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* 底部操作条已移除，按钮上移到浮层，给图片更多空间 */}
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        multiple
        max={2}
        onChange={onFileInputChange}
      />
    </div>
  );
};
