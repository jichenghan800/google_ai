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
        <div className="flex items-center justify-between space-x-2">
          <button
            onClick={onDownload}
            className="flex items-center space-x-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-md transition-colors flex-1"
          >
            <span>📥</span>
            <span>下载</span>
          </button>
          
          <button
            onClick={onEditMode}
            className="flex items-center space-x-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm rounded-md transition-colors flex-1"
          >
            <span>✏️</span>
            <span>转入编辑</span>
          </button>
          
          <button
            onClick={onClearResult}
            className="flex items-center space-x-1 px-2 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm rounded-md transition-colors"
          >
            <span>🗑️</span>
          </button>
        </div>
      </div>
    </div>
  );
};
