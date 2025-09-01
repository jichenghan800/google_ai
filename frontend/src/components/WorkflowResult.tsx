import React, { useState } from 'react';
import { ImageEditResult } from '../types/index.ts';

interface WorkflowResultProps {
  result: ImageEditResult;
  onNewTask: () => void;
}

export const WorkflowResult: React.FC<WorkflowResultProps> = ({ 
  result, 
  onNewTask 
}) => {
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [modalImage, setModalImage] = useState<{src: string, alt: string, title: string} | null>(null);

  const handleDownloadImage = () => {
    if (result.resultType === 'image') {
      const link = document.createElement('a');
      link.href = result.result;
      link.download = `ai-result-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const copyToClipboard = async () => {
    if (result.resultType === 'text') {
      try {
        await navigator.clipboard.writeText(result.result);
        alert('内容已复制到剪贴板');
      } catch (err) {
        console.error('复制失败:', err);
        alert('复制失败，请手动复制');
      }
    }
  };

  const handleImageClick = () => {
    if (result.resultType === 'image') {
      setModalImage({
        src: result.result,
        alt: 'AI处理结果',
        title: 'AI 处理结果'
      });
      setIsImageModalOpen(true);
    }
  };

  const handleOriginalImageClick = (imageUrl: string, imageName: string, index: number) => {
    setModalImage({
      src: imageUrl,
      alt: `原图 ${index + 1}`,
      title: `原图：${imageName}`
    });
    setIsImageModalOpen(true);
  };

  const handleCloseImageModal = () => {
    setIsImageModalOpen(false);
    setModalImage(null);
  };

  // 判断任务类型
  const getTaskType = () => {
    if (result.inputImages.length > 0 && result.prompt.trim()) {
      return { type: 'edit', label: '图片编辑', icon: '🎨' };
    } else if (result.inputImages.length > 0) {
      return { type: 'analyze', label: '图片分析', icon: '🔍' };
    } else {
      return { type: 'generate', label: '图片生成', icon: '✨' };
    }
  };

  const taskInfo = getTaskType();

  return (
    <>
      {/* 步骤3：结果展示 */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold mr-3">
              3
            </div>
            <h2 className="text-xl font-semibold text-gray-800">处理结果</h2>
          </div>
          <div className="flex items-center space-x-2 px-3 py-1 bg-green-50 text-green-700 rounded-full">
            <span className="text-lg">{taskInfo.icon}</span>
            <span className="font-medium">{taskInfo.label}</span>
          </div>
        </div>

        {/* AI 结果展示 */}
        <div className="mb-6">
          <h3 className="font-medium text-gray-800 mb-4">AI 处理结果</h3>
          
          {result.resultType === 'image' ? (
            <div className="space-y-6">
              {/* 如果有输入图片，显示对比 */}
              {result.inputImages.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-6">
                  <h4 className="font-medium text-gray-700 mb-4 flex items-center">
                    <span className="mr-2">📷</span>
                    原图与AI处理结果对比
                  </h4>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 原图区域 */}
                    <div className="space-y-3">
                      <h5 className="text-sm font-medium text-gray-600">原图 ({result.inputImages.length}张)</h5>
                      <div className="space-y-3">
                        {result.inputImages.map((img, index) => (
                          <div key={index} className="border rounded-lg overflow-hidden bg-white">
                            <div className="p-2 bg-gray-100 border-b">
                              <span className="text-xs text-gray-600">{img.originalName}</span>
                            </div>
                            <div className="p-4 flex justify-center">
                              {img.dataUrl ? (
                                <img
                                  src={img.dataUrl}
                                  alt={`原图 ${index + 1}`}
                                  className="max-w-full max-h-80 object-contain rounded cursor-pointer hover:shadow-lg transition-shadow"
                                  onClick={() => handleOriginalImageClick(img.dataUrl, img.originalName, index)}
                                  title="点击查看原图"
                                />
                              ) : (
                                <div className="text-gray-400 text-center">
                                  <svg className="mx-auto h-16 w-16 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  <p className="text-sm">原图数据不可用</p>
                                  <p className="text-xs">({(img.size / 1024 / 1024).toFixed(1)}MB)</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* AI处理结果区域 */}
                    <div className="space-y-3">
                      <h5 className="text-sm font-medium text-gray-600 flex items-center">
                        <span className="mr-1">✨</span>
                        AI 处理结果
                      </h5>
                      <div className="border rounded-lg overflow-hidden bg-white">
                        <div className="p-2 bg-gradient-to-r from-blue-50 to-purple-50 border-b">
                          <span className="text-xs text-blue-700 font-medium">AI 生成图片</span>
                        </div>
                        <div className="p-4 flex justify-center">
                          <img
                            src={result.result}
                            alt="AI处理结果"
                            className="max-w-full max-h-80 object-contain rounded cursor-pointer hover:shadow-lg transition-shadow"
                            onClick={handleImageClick}
                            title="点击查看原图"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* 如果没有输入图片，只显示生成结果 */}
              {result.inputImages.length === 0 && (
                <div className="relative inline-block max-w-full">
                  <img
                    src={result.result}
                    alt="AI生成结果"
                    className="max-w-full h-auto rounded-lg shadow-md border cursor-pointer hover:shadow-lg transition-shadow"
                    style={{ maxHeight: '500px' }}
                    onClick={handleImageClick}
                    title="点击查看原图"
                  />
                  {/* 放大图标提示 */}
                  <div className="absolute top-3 right-3 bg-black/50 text-white p-2 rounded opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </div>
                </div>
              )}
              
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleDownloadImage}
                  className="btn-primary flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>下载图片</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white border rounded-lg p-6 shadow-sm">
                <pre className="whitespace-pre-wrap text-gray-700 leading-relaxed font-sans">
                  {result.result}
                </pre>
              </div>
              
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={copyToClipboard}
                  className="btn-primary flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 002 2m0 0h2a1 1 0 011 1v3M9 12l2 2 4-4" />
                  </svg>
                  <span>复制文本</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 输入信息回顾 */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-gray-800 mb-3">输入内容回顾</h3>
          
          {result.prompt.trim() && (
            <div className="mb-3">
              <span className="text-sm font-medium text-gray-600">提示词：</span>
              <p className="text-gray-700 mt-1">{result.prompt}</p>
            </div>
          )}
          
          {result.inputImages.length > 0 && (
            <div className="mb-3">
              <span className="text-sm font-medium text-gray-600">上传的图片：</span>
              <div className="mt-1 space-y-1">
                {result.inputImages.map((img, index) => (
                  <div key={index} className="text-sm text-gray-600">
                    📷 {img.originalName} ({(img.size / 1024 / 1024).toFixed(1)}MB)
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="text-xs text-gray-500">
            处理时间：{new Date(result.createdAt).toLocaleString('zh-CN')} • 
            模型：{result.metadata?.model}
          </div>
        </div>

        {/* 技术信息 */}
        {result.metadata && (
          <div className="mb-6 p-4 border rounded-lg bg-gray-50">
            <h3 className="font-medium text-gray-800 mb-3">技术信息</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
              <div>
                <span className="font-medium">AI 模型：</span>
                <span className="ml-1">{result.metadata.model}</span>
              </div>
              <div>
                <span className="font-medium">输入图片数：</span>
                <span className="ml-1">{result.metadata.inputImageCount} 张</span>
              </div>
              {result.metadata.hasText && (
                <div className="text-green-600">
                  <span className="font-medium">✓ 包含文本回复</span>
                </div>
              )}
              {result.metadata.hasImage && (
                <div className="text-blue-600">
                  <span className="font-medium">✓ 包含图片回复</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex justify-center space-x-4">
          <button
            onClick={onNewTask}
            className="btn-primary flex items-center space-x-2 px-6 py-3"
          >
            <span className="text-lg">➕</span>
            <span>开始新任务</span>
          </button>
        </div>
      </div>

      {/* 图片放大模态框 */}
      {isImageModalOpen && modalImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={handleCloseImageModal}
        >
          <div className="relative max-w-[95vw] max-h-[95vh] w-auto h-auto">
            <img
              src={modalImage.src}
              alt={modalImage.alt}
              className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg"
              style={{ maxWidth: '95vw', maxHeight: '95vh' }}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={handleCloseImageModal}
              className="absolute top-2 right-2 bg-black/70 text-white p-2 rounded-full hover:bg-black/90 transition-colors z-10"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="absolute bottom-2 left-2 bg-black/70 text-white px-3 py-1.5 rounded text-sm">
              {modalImage.title} • 点击背景关闭
            </div>
          </div>
        </div>
      )}
    </>
  );
};