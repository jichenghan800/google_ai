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
  dragActive?: boolean;
  onDragHandlers?: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  fileInputRef?: React.RefObject<HTMLInputElement>;
  onFileInputChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
  dragActive = false,
  onDragHandlers,
  fileInputRef,
  onFileInputChange
}) => {
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
  return (
    <div className="bg-white rounded-lg border border-gray-200 min-h-[380px] xl:min-h-[480px] 2xl:min-h-[680px] 3xl:min-h-[780px] 4k:min-h-[580px] ultrawide:min-h-[680px]">
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 transition-colors min-h-[360px] xl:min-h-[460px] 2xl:min-h-[660px] 3xl:min-h-[760px] 4k:min-h-[560px] ultrawide:min-h-[660px] ${
          dragActive
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        {...(onDragHandlers || {})}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={onFileInputChange}
          className="hidden"
        />
        
        {uploadedFiles.length === 0 ? (
          <div className="text-center">
            <div className="text-4xl mb-4">
              {mode === 'edit' ? '✨' : '🔍'}
            </div>
            <h3 className="text-lg font-medium text-gray-700 mb-2">
              {mode === 'edit' ? '上传要编辑的图片' : '上传要分析的图片'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              拖拽图片到此处，或点击选择文件
            </p>
            <button
              onClick={() => fileInputRef?.current?.click()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              选择图片
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700">
                已上传图片 ({uploadedFiles.length})
              </h4>
              <button
                onClick={() => fileInputRef?.current?.click()}
                className="text-sm text-blue-500 hover:text-blue-600"
              >
                添加更多
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative group">
                  <img
                    src={preview}
                    alt={`上传图片 ${index + 1}`}
                    className="w-full h-32 ultrawide:h-24 4k:h-28 object-cover rounded-lg border border-gray-200"
                  />
                  <button
                    onClick={() => onFileRemove?.(index)}
                    className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
