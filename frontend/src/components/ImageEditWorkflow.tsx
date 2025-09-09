import React, { useState, useCallback } from 'react';
import { ImageEditResult } from '../types/index';
import { ImageUploadArea } from './ImageUploadArea';
import { ImageComparison } from './ImageComparison';
import { ImagePreviewModal } from './ImagePreviewModal';
import { ImageEditResultDisplay } from './ImageEditResultDisplay';
import { ImageEditGallery } from './ImageEditGallery';

interface ImageEditWorkflowProps {
  sessionId: string | null;
  onProcessComplete?: (result: ImageEditResult) => void;
  isProcessing?: boolean;
  editHistory?: ImageEditResult[];
}

export const ImageEditWorkflow: React.FC<ImageEditWorkflowProps> = ({
  sessionId,
  onProcessComplete,
  isProcessing = false,
  editHistory = []
}) => {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [currentResult, setCurrentResult] = useState<ImageEditResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isContinueEditMode, setIsContinueEditMode] = useState(false);
  
  // 图片预览模态框状态
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageTitle, setPreviewImageTitle] = useState<string>('');
  const [previewImageType, setPreviewImageType] = useState<'before' | 'after'>('before');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // 处理文件选择
  const handleFilesSelected = useCallback(async (files: File[]) => {
    setUploadedFiles(files);
    
    // 生成预览
    const previews = await Promise.all(
      files.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
      })
    );
    
    setImagePreviews(previews);
  }, []);

  // 清空上传的文件
  const handleClearFiles = useCallback(() => {
    setUploadedFiles([]);
    setImagePreviews([]);
  }, []);

  // 打开图片预览
  const openImagePreview = useCallback((imageUrl: string, title: string, type: 'before' | 'after' = 'before') => {
    setPreviewImageUrl(imageUrl);
    setPreviewImageTitle(title);
    setPreviewImageType(type);
    setIsPreviewOpen(true);
  }, []);

  // 关闭图片预览
  const closeImagePreview = useCallback(() => {
    setIsPreviewOpen(false);
    setPreviewImageUrl(null);
  }, []);

  // 提交编辑请求
  const handleSubmit = async () => {
    if (!sessionId || uploadedFiles.length === 0 || !prompt.trim()) {
      return;
    }

    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('sessionId', sessionId);
      formData.append('prompt', prompt.trim());
      
      uploadedFiles.forEach((file) => {
        formData.append('images', file);
      });

      const response = await fetch('/api/edit/image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('编辑请求失败');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        const result: ImageEditResult = {
          ...data.data,
          inputImages: data.data.inputImages.map((img: any, index: number) => ({
            ...img,
            dataUrl: imagePreviews[index]
          }))
        };
        
        setCurrentResult(result);
        
        if (onProcessComplete) {
          onProcessComplete(result);
        }
      }
    } catch (error) {
      console.error('编辑失败:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // 持续编辑处理
  const handleContinueEdit = useCallback(() => {
    setIsContinueEditMode(!isContinueEditMode);
  }, [isContinueEditMode]);

  // 关闭结果显示
  const handleCloseResult = useCallback(() => {
    setShowResult(false);
    setCurrentResult(null);
  }, []);

  // 点击历史记录
  const handleHistoryClick = useCallback((result: ImageEditResult) => {
    setCurrentResult(result);
    setShowResult(true);
  }, []);

  if (showResult && currentResult) {
    return (
      <>
        <ImageEditResultDisplay
          result={currentResult}
          onClose={handleCloseResult}
          onContinueEdit={handleContinueEdit}
        />
        
        <ImagePreviewModal
          imageUrl={previewImageUrl}
          title={previewImageTitle}
          type={previewImageType}
          isOpen={isPreviewOpen}
          onClose={closeImagePreview}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* 主要编辑区域 */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center space-x-2">
          <span>🎨</span>
          <span>图片编辑</span>
        </h2>

        {uploadedFiles.length === 0 ? (
          <ImageUploadArea
            onFilesSelected={handleFilesSelected}
            maxFiles={2}
            disabled={isProcessing}
          />
        ) : (
          <div className="space-y-6">
            {/* 图片对比显示 */}
            <ImageComparison
              beforeImages={imagePreviews}
              afterImage={currentResult?.result}
              onImagePreview={openImagePreview}
              onUpload={() => document.querySelector('input[type="file"]')?.click()}
              onClear={handleClearFiles}
              onContinueEdit={handleContinueEdit}
              isProcessing={isProcessing}
              isContinueEditMode={isContinueEditMode}
              currentResult={currentResult}
            />
            
            {/* 隐藏的文件输入 */}
            <input
              type="file"
              className="hidden"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) {
                  handleFilesSelected(files);
                }
              }}
            />

            {/* 编辑指令输入 */}
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700">
                编辑指令
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述你想要对图片进行的修改，例如：将背景改为蓝天白云、去除图片中的文字、调整图片亮度等..."
                className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={4}
                disabled={isProcessing}
              />
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-between items-center">
              <button
                onClick={handleClearFiles}
                disabled={isProcessing}
                className="btn-secondary flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>重新上传</span>
              </button>

              <button
                onClick={handleSubmit}
                disabled={isProcessing || !prompt.trim()}
                className="btn-primary flex items-center space-x-2"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>处理中...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>开始编辑</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 编辑历史 */}
      {editHistory.length > 0 && (
        <ImageEditGallery
          editHistory={editHistory}
          onResultClick={handleHistoryClick}
        />
      )}

      {/* 图片预览模态框 */}
      <ImagePreviewModal
        imageUrl={previewImageUrl}
        title={previewImageTitle}
        type={previewImageType}
        isOpen={isPreviewOpen}
        onClose={closeImagePreview}
      />
    </div>
  );
};
