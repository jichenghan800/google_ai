import React, { useState, useRef } from 'react';
import { ImageEditResult } from '../types/index.ts';

interface ImageEditProps {
  onEditComplete: (result: ImageEditResult) => void;
  sessionId: string | null;
  isEditing?: boolean;
}

export const ImageEdit: React.FC<ImageEditProps> = ({
  onEditComplete,
  sessionId,
  isEditing = false
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number}[]>([]);
  const [prompt, setPrompt] = useState('');
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
    handleFiles(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      handleFiles(Array.from(files));
    }
  };

  const handleFiles = (files: File[]) => {
    // 限制最多2个文件
    const validFiles = files.slice(0, 2).filter(file => {
      if (!file.type.startsWith('image/')) {
        alert(`文件 ${file.name} 不是图片格式`);
        return false;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        alert(`文件 ${file.name} 超过10MB限制`);
        return false;
      }
      
      return true;
    });

    if (validFiles.length === 0) return;

    // 追加新文件到现有文件列表，最多2个
    setUploadedFiles(prevFiles => {
      const combinedFiles = [...prevFiles, ...validFiles];
      const limitedFiles = combinedFiles.slice(0, 2);
      
      if (combinedFiles.length > 2) {
        alert(`最多只能上传2张图片，已保留前${limitedFiles.length}张`);
      }
      
      return limitedFiles;
    });

    // 生成新图片的预览
    const newPreviews: string[] = [];
    const newDimensions: {width: number, height: number}[] = [];
    const promises = validFiles.map((file, index) => {
      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            const img = new Image();
            img.onload = () => {
              newPreviews[index] = e.target.result as string;
              newDimensions[index] = { width: img.width, height: img.height };
              console.log(`图片 ${index + 1} 尺寸:`, img.width, 'x', img.height, '是否横图:', img.width > img.height);
              resolve();
            };
            img.src = e.target.result as string;
          }
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(promises).then(() => {
      console.log('所有图片加载完成，新尺寸:', newDimensions);
      setImagePreviews(prevPreviews => {
        const combinedPreviews = [...prevPreviews, ...newPreviews];
        return combinedPreviews.slice(0, 2);
      });
      setImageDimensions(prevDimensions => {
        const combinedDimensions = [...prevDimensions, ...newDimensions];
        const finalDimensions = combinedDimensions.slice(0, 2);
        console.log('设置最终尺寸数组:', finalDimensions);
        return finalDimensions;
      });
    });
  };

  const removeImage = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);
    const newDimensions = imageDimensions.filter((_, i) => i !== index);
    
    setUploadedFiles(newFiles);
    setImagePreviews(newPreviews);
    setImageDimensions(newDimensions);
    
    // 清除文件输入
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleEditSubmit = async () => {
    if (!sessionId) {
      alert('会话未初始化，请刷新页面重试');
      return;
    }

    if (uploadedFiles.length === 0) {
      alert('请至少上传一张图片');
      return;
    }

    if (!prompt.trim()) {
      alert('请输入编辑指令');
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      
      // 添加图片文件
      uploadedFiles.forEach((file, index) => {
        formData.append('images', file);
      });
      
      formData.append('sessionId', sessionId);
      formData.append('prompt', prompt.trim());

      const response = await fetch('/api/edit/edit-images', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        onEditComplete(result.data);
        
        // 清除表单
        setUploadedFiles([]);
        setImagePreviews([]);
        setImageDimensions([]);
        setPrompt('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        throw new Error(result.error || '图片编辑失败');
      }

    } catch (error: any) {
      console.error('图片编辑失败:', error);
      alert(`图片编辑失败: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const clearAll = () => {
    setUploadedFiles([]);
    setImagePreviews([]);
    setImageDimensions([]);
    setPrompt('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="card p-6 mb-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">🎨 图片编辑</h2>
      <p className="text-gray-600 mb-4">上传1-2张图片，然后输入编辑指令，AI将为您提供编辑建议或生成新图片</p>
      
      {/* 文件上传区域 */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          上传图片 (最多2张)
        </label>
        
        {imagePreviews.length === 0 ? (
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 ${
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
              支持 JPG, PNG, GIF, WebP 等格式，最大 10MB，最多2张
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isEditing}
            >
              选择图片
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              multiple
              max={2}
              onChange={handleFileInput}
            />
          </div>
        ) : (
          <div>
            {/* 图片预览 */}
            <div className={`gap-4 mb-4 ${
              (() => {
                const isVertical = imagePreviews.length === 2 && 
                  imageDimensions.length === 2 && 
                  imageDimensions[0].width > imageDimensions[0].height && 
                  imageDimensions[1].width > imageDimensions[1].height;
                console.log('布局判断:', { 
                  预览数量: imagePreviews.length, 
                  尺寸数量: imageDimensions.length, 
                  尺寸数据: imageDimensions,
                  是否上下排列: isVertical 
                });
                return isVertical ? 'grid grid-cols-1' : 'grid grid-cols-2';
              })()
            }`} style={{height: '400px'}}>
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative group h-full">
                  <div className="w-full h-full overflow-hidden rounded-lg border-2 border-gray-200 bg-gray-100 flex items-center justify-center">
                    <img
                      src={preview}
                      alt={`预览图片 ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 bg-red-500 text-white w-9 h-9 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600 flex items-center justify-center"
                    disabled={isUploading || isEditing}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  {/* 移除左下角文件名显示，保持画面简洁 */}
                </div>
              ))}
            </div>
            
            <div className="flex justify-center space-x-2">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isEditing || imagePreviews.length >= 2}
              >
                {imagePreviews.length >= 2 ? '已达上限' : '添加更多图片'}
              </button>
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={clearAll}
                disabled={isUploading || isEditing}
              >
                清除所有
              </button>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              multiple
              max={2}
              onChange={handleFileInput}
            />
          </div>
        )}
      </div>

      {/* 编辑指令输入 */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          编辑指令 *
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="例如：将这张图片转换为油画风格，或者分析两张图片的相似性..."
          className="input-field h-24 resize-none"
          disabled={isUploading || isEditing}
          maxLength={500}
        />
        <div className="text-right text-xs text-gray-500 mt-1">
          {prompt.length}/500
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-center space-x-3">
        <button
          onClick={handleEditSubmit}
          className="btn-primary flex items-center space-x-2"
          disabled={isUploading || isEditing || !sessionId || uploadedFiles.length === 0 || !prompt.trim()}
        >
          {isUploading || isEditing ? (
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
              <span>处理中...</span>
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 011-1h1a2 2 0 100-4H7a1 1 0 01-1-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"
                />
              </svg>
              <span>开始编辑</span>
            </>
          )}
        </button>
        
        {(uploadedFiles.length > 0 || prompt.trim()) && (
          <button
            onClick={clearAll}
            className="btn-secondary"
            disabled={isUploading || isEditing}
          >
            清空重置
          </button>
        )}
      </div>
    </div>
  );
};
