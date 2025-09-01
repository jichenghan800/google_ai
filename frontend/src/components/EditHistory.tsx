import React, { useState } from 'react';
import { ImageEditResult } from '../types/index.ts';
import { EditResult } from './EditResult.tsx';

interface EditHistoryProps {
  editHistory: ImageEditResult[];
  onSelectEdit: (editResult: ImageEditResult) => void;
}

export const EditHistory: React.FC<EditHistoryProps> = ({ 
  editHistory, 
  onSelectEdit 
}) => {
  const [selectedEdit, setSelectedEdit] = useState<ImageEditResult | null>(null);

  const handleSelectEdit = (editResult: ImageEditResult) => {
    setSelectedEdit(editResult);
    onSelectEdit(editResult);
  };

  const handleCloseEdit = () => {
    setSelectedEdit(null);
  };

  if (editHistory.length === 0) {
    return (
      <div className="card p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">📚 编辑历史</h2>
        <div className="text-center py-8">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-600 mb-2">还没有编辑记录</h3>
          <p className="text-gray-500">上传图片并开始编辑后，您的编辑历史将显示在这里</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">📚 编辑历史</h2>
          <span className="text-sm text-gray-500">{editHistory.length} 个编辑记录</span>
        </div>
        
        <div className="space-y-3">
          {editHistory.map((editResult) => (
            <div
              key={editResult.id}
              className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => handleSelectEdit(editResult)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      editResult.resultType === 'image' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {editResult.resultType === 'image' ? '🖼️ 图片' : '📝 文本'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {editResult.inputImages.length} 张输入图片
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(editResult.createdAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-700 mb-2 line-clamp-2">
                    <span className="font-medium">指令:</span> {editResult.prompt}
                  </p>
                  
                  {editResult.resultType === 'text' && (
                    <p className="text-sm text-gray-600 line-clamp-3">
                      <span className="font-medium">结果:</span> {editResult.result.substring(0, 150)}...
                    </p>
                  )}
                </div>
                
                {editResult.resultType === 'image' && (
                  <div className="ml-4 flex-shrink-0">
                    <img
                      src={editResult.result}
                      alt="编辑结果预览"
                      className="w-16 h-16 object-cover rounded border"
                    />
                  </div>
                )}
              </div>
              
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  <span>模型: {editResult.metadata?.model}</span>
                  {editResult.metadata?.hasText && (
                    <span className="text-green-600">✓ 文本</span>
                  )}
                  {editResult.metadata?.hasImage && (
                    <span className="text-blue-600">✓ 图片</span>
                  )}
                </div>
                
                <button className="text-primary-600 hover:text-primary-800 text-sm font-medium">
                  查看详情 →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 显示选中的编辑结果 */}
      {selectedEdit && (
        <EditResult
          result={selectedEdit}
          onClose={handleCloseEdit}
        />
      )}
    </>
  );
};