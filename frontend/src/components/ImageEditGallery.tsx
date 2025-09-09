import React from 'react';
import { ImageEditResult } from '../types/index';

interface ImageEditGalleryProps {
  editHistory: ImageEditResult[];
  onResultClick: (result: ImageEditResult) => void;
}

export const ImageEditGallery: React.FC<ImageEditGalleryProps> = ({
  editHistory,
  onResultClick
}) => {
  if (editHistory.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="text-gray-400 mb-4">
          <svg className="mx-auto h-24 w-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-500 mb-2">还没有编辑记录</h3>
        <p className="text-gray-400">上传图片并输入编辑指令开始创作</p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">编辑历史</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {editHistory.map((result) => (
          <div
            key={result.id}
            className="group relative cursor-pointer overflow-hidden rounded-lg bg-gray-100 transition-transform duration-200 hover:scale-105"
            onClick={() => onResultClick(result)}
          >
            <div className="aspect-square w-full">
              {result.resultType === 'image' ? (
                <img
                  src={result.result}
                  alt={result.prompt}
                  className="h-full w-full object-cover transition-opacity duration-200 group-hover:opacity-90"
                  loading="lazy"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100">
                  <div className="text-center">
                    <svg className="w-8 h-8 text-blue-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-xs text-blue-600 font-medium">文本回复</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Overlay with prompt */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-white text-sm line-clamp-2 font-medium">
                  {result.prompt}
                </p>
                <p className="text-white/80 text-xs mt-1">
                  {new Date(result.createdAt).toLocaleString('zh-CN')}
                </p>
              </div>
            </div>

            {/* Type indicator */}
            <div className="absolute top-2 right-2">
              <div className={`text-white p-1 rounded-full text-xs ${
                result.resultType === 'image' ? 'bg-green-500' : 'bg-blue-500'
              }`}>
                {result.resultType === 'image' ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
              </div>
            </div>

            {/* Input images count */}
            <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
              {result.inputImages.length} 张图片
            </div>
          </div>
        ))}
      </div>
      
      {editHistory.length > 0 && (
        <div className="mt-4 text-center text-sm text-gray-500">
          共 {editHistory.length} 条编辑记录
        </div>
      )}
    </div>
  );
};
