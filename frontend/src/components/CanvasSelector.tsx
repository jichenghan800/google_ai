import React from 'react';
import { AspectRatioOption } from '../types/index.ts';

interface CanvasSelectorProps {
  selectedRatio: AspectRatioOption;
  onRatioChange: (ratio: AspectRatioOption) => void;
  aspectRatioOptions: AspectRatioOption[];
  currentResult?: any;
  onDownload?: () => void;
  onEditMode?: () => void;
  onClearResult?: () => void;
}

export const CanvasSelector: React.FC<CanvasSelectorProps> = ({
  selectedRatio,
  onRatioChange,
  aspectRatioOptions,
  currentResult,
  onDownload,
  onEditMode,
  onClearResult
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg h-full flex flex-col">
      {/* 顶部标题 */}
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-lg font-medium text-gray-900 mb-1">创作画布</h3>
        <p className="text-sm text-gray-500">选择您想要的图片尺寸和比例</p>
      </div>
      
      {/* 画布预览区域 */}
      <div className="flex-1 p-6 flex flex-col justify-center">
        {/* 比例选择器 */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            {aspectRatioOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => onRatioChange(option)}
                className={`p-4 rounded-xl border-2 text-sm transition-all duration-200 transform hover:scale-105 ${
                  selectedRatio.id === option.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{option.icon}</span>
                    <div className="text-left">
                      <div className="font-medium">{option.label}</div>
                      <div className="text-xs text-gray-500">{option.description}</div>
                    </div>
                  </div>
                  {selectedRatio.id === option.id && (
                    <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* 底部操作按钮 */}
      <div className="p-4 bg-gray-50 border-t border-gray-100 rounded-b-lg">
        <div className="flex items-center justify-center space-x-4">
          {/* 下载按钮 - 绿色圆形 */}
          <button
            onClick={onDownload}
            className="w-12 h-12 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors shadow-lg hover:shadow-xl transform hover:scale-105"
            title="下载图片"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
          
          {/* 转入编辑按钮 - 蓝色圆形 */}
          <button
            onClick={onEditMode}
            className="w-12 h-12 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center transition-colors shadow-lg hover:shadow-xl transform hover:scale-105"
            title="转入编辑模式"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          
          {/* 清除按钮 - 红色圆形 */}
          <button
            onClick={onClearResult}
            className="w-12 h-12 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow-lg hover:shadow-xl transform hover:scale-105"
            title="清除结果"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
