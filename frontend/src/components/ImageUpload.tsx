import React, { useState, useRef } from 'react';
import { ImageAnalysisResult } from '../types/index.ts';

interface ImageUploadProps {
  onAnalysisComplete: (result: ImageAnalysisResult) => void;
  sessionId: string | null;
  isAnalyzing?: boolean;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  onAnalysisComplete,
  sessionId,
  isAnalyzing = false
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFile = (file: File) => {
    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件');
      return;
    }

    // 验证文件大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('图片文件不能超过10MB');
      return;
    }

    // 存储文件对象
    setUploadedFile(file);

    // 预览图片
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setUploadedImage(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const uploadAndAnalyze = async (file: File) => {
    if (!sessionId) {
      alert('会话未初始化，请刷新页面重试');
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('sessionId', sessionId);
      if (customPrompt.trim()) {
        formData.append('prompt', customPrompt.trim());
      }

      const response = await fetch('/api/analyze/analyze-image', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        onAnalysisComplete({
          ...result.data,
          imagePreview: uploadedImage
        });
      } else {
        throw new Error(result.error || '图片分析失败');
      }

    } catch (error: any) {
      console.error('图片上传分析失败:', error);
      alert(`图片分析失败: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAnalyzeClick = () => {
    // 优先使用存储的文件对象，否则从文件输入获取
    const file = uploadedFile || fileInputRef.current?.files?.[0];
    if (file) {
      uploadAndAnalyze(file);
    } else {
      alert('请先选择要分析的图片');
    }
  };

  const clearImage = () => {
    setUploadedImage(null);
    setUploadedFile(null);
    setCustomPrompt('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="card p-6 mb-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">图片分析</h2>
      
      {!uploadedImage ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 ${
            dragActive
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
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
            拖拽图片到这里或点击上传
          </p>
          <p className="text-sm text-gray-500 mb-4">
            支持 JPG, PNG, GIF, WebP 等格式，最大 10MB
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isAnalyzing}
          >
            选择图片
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleFileInput}
          />
        </div>
      ) : (
        <div>
          {/* 图片预览 */}
          <div className="mb-4">
            <img
              src={uploadedImage}
              alt="上传的图片"
              className="max-w-full h-auto max-h-64 mx-auto rounded-lg shadow-md"
            />
          </div>
          
          {/* 自定义分析提示 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              自定义分析要求（可选）
            </label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="例如：请重点分析图片中的色彩搭配和构图特点..."
              className="input-field h-20 resize-none"
              disabled={isUploading || isAnalyzing}
            />
          </div>
          
          {/* 操作按钮 */}
          <div className="flex justify-center space-x-3">
            <button
              onClick={handleAnalyzeClick}
              className="btn-primary flex items-center space-x-2"
              disabled={isUploading || isAnalyzing || !sessionId}
            >
              {isUploading || isAnalyzing ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>分析中...</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <span>分析图片</span>
                </>
              )}
            </button>
            
            <button
              onClick={clearImage}
              className="btn-secondary"
              disabled={isUploading || isAnalyzing}
            >
              重新上传
            </button>
          </div>
        </div>
      )}
    </div>
  );
};