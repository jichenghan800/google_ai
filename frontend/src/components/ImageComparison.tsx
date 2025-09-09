import React, { useState, useRef } from 'react';
import { ImageEditResult } from '../types/index';

interface ImageComparisonProps {
  beforeImages: string[];
  afterImage?: string;
  onImagePreview: (imageUrl: string, title: string, type: 'before' | 'after') => void;
  onUpload?: () => void;
  onClear?: () => void;
  onContinueEdit?: () => void;
  isProcessing?: boolean;
  isContinueEditMode?: boolean;
  currentResult?: ImageEditResult | null;
}

export const ImageComparison: React.FC<ImageComparisonProps> = ({
  beforeImages,
  afterImage,
  onImagePreview,
  onUpload,
  onClear,
  onContinueEdit,
  isProcessing = false,
  isContinueEditMode = false,
  currentResult
}) => {
  const getGridClass = (count: number) => {
    switch (count) {
      case 1: return 'grid-cols-1';
      case 2: return 'grid-cols-2';
      case 3: return 'grid-cols-2';
      case 4: return 'grid-cols-2';
      default: return 'grid-cols-1';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 修改前区域 */}
      <div className="space-y-3">
        <div className="text-center">
          <h5 className="text-sm font-medium text-gray-600">修改前</h5>
        </div>
        
        {beforeImages.length > 0 ? (
          <div className={`grid gap-2 ${getGridClass(beforeImages.length)} border-2 border-dashed border-gray-200 rounded-lg p-4 bg-gray-50`}>
            {beforeImages.map((image, index) => (
              <div key={index} className={`relative group ${
                beforeImages.length === 3 && index === 2 ? 'col-span-2' : ''
              }`}>
                <div 
                  className="w-full aspect-square overflow-hidden bg-gray-100 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg"
                  onClick={() => onImagePreview(image, '修改前', 'before')}
                  title="点击查看原图"
                >
                  <img
                    src={image}
                    alt={`原图 ${index + 1}`}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                  />
                </div>
                <div className="absolute top-2 left-2 bg-blue-500/80 text-white text-xs px-2 py-1 rounded">
                  原图 {index + 1}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50">
            <div className="text-gray-400 mb-4">
              <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm mb-4">
              上传图片开始编辑
            </p>
            {onUpload && (
              <button
                onClick={onUpload}
                disabled={isProcessing}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors disabled:bg-gray-300"
              >
                上传图片
              </button>
            )}
          </div>
        )}
        
        {beforeImages.length > 0 && (
          <div className="flex justify-center space-x-3">
            {onUpload && (
              <button
                onClick={onUpload}
                disabled={isProcessing}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors disabled:bg-gray-300 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>添加</span>
              </button>
            )}
            {onClear && (
              <button
                onClick={onClear}
                disabled={isProcessing}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors disabled:bg-gray-300 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>清空</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 修改后区域 */}
      <div className="space-y-3 flex flex-col">
        <div className="text-center">
          <h5 className="text-sm font-medium text-gray-600">修改后</h5>
        </div>
        
        <div className="border-2 border-dashed rounded-lg overflow-hidden bg-gray-50 flex-1 flex flex-col">
          {afterImage && currentResult ? (
            <>
              {/* 图片显示区域 */}
              <div className="relative flex-1">
                <div 
                  className="w-full h-full overflow-hidden bg-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => onImagePreview(afterImage, '修改后', 'after')}
                  title="点击预览结果图片"
                >
                  {currentResult.resultType === 'image' ? (
                    <img
                      src={afterImage}
                      alt="生成的图片"
                      className="w-full h-auto object-contain hover:scale-105 transition-transform duration-200"
                      style={{ maxHeight: '400px' }}
                    />
                  ) : (
                    <div className="p-6 min-h-[200px] flex items-center justify-center">
                      <div className="text-gray-700 text-sm whitespace-pre-wrap text-center max-w-full">
                        {afterImage}
                      </div>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 bg-blue-500/80 text-white text-xs px-2 py-1 rounded">
                    {currentResult.resultType === 'image' ? '点击预览结果' : 'AI回复'}
                  </div>
                </div>
                <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                  生成完成 • {new Date(currentResult.createdAt).toLocaleTimeString()}
                </div>
              </div>
              
              {/* 操作按钮区域 */}
              <div className="p-4 flex justify-between items-center">
                <div className="flex space-x-4">
                  {currentResult.resultType === 'image' && (
                    <a
                      href={afterImage}
                      download="generated-image.png"
                      className="w-10 h-10 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors"
                      title="下载图片"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </a>
                  )}
                </div>
                
                {/* 持续编辑开关 */}
                <button
                  onClick={onContinueEdit}
                  className="flex items-center space-x-3 flex-shrink-0"
                  title={isContinueEditMode ? "点击退出持续编辑模式" : "点击进入持续编辑模式"}
                >
                  <div className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 ${
                    isContinueEditMode ? 'bg-green-500' : 'bg-gray-300'
                  }`}>
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
                      isContinueEditMode ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </div>
                  <span className={`text-base font-medium ${
                    isContinueEditMode ? 'text-green-600' : 'text-gray-700'
                  }`}>
                    持续编辑
                  </span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              {isProcessing ? (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-gray-500 text-sm">AI正在处理中...</p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-gray-400 mb-4">
                    <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-sm">
                    等待生成结果
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
