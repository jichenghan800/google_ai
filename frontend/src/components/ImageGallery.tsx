import React from 'react';
import { GeneratedImage } from '../types/index.ts';

interface ImageGalleryProps {
  images: GeneratedImage[];
  onImageClick: (image: GeneratedImage) => void;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({ images, onImageClick }) => {
  console.log('🖼️ ImageGallery rendered with images:', images?.length || 0, 'images');
  console.log('📋 First few images:', images?.slice(0, 3));

  if (images.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="text-gray-400 mb-4">
          <svg className="mx-auto h-24 w-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-500 mb-2">还没有生成的图片</h3>
        <p className="text-gray-400">输入描述并点击生成图片开始创作</p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">生成历史</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((image) => (
          <div
            key={image.id}
            className="group relative cursor-pointer overflow-hidden rounded-lg bg-gray-100 transition-transform duration-200 hover:scale-105"
            onClick={() => onImageClick(image)}
          >
            <div className="aspect-square w-full">
              <img
                src={image.imageUrl}
                alt={image.prompt}
                className="h-full w-full object-cover transition-opacity duration-200 group-hover:opacity-90"
                loading="lazy"
              />
            </div>
            
            {/* Overlay with prompt */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-white text-sm line-clamp-2 font-medium">
                  {image.prompt}
                </p>
                <p className="text-white/80 text-xs mt-1">
                  {new Date(image.createdAt).toLocaleString('zh-CN')}
                </p>
              </div>
            </div>

            {/* Status indicator */}
            <div className="absolute top-2 right-2">
              {image.status === 'completed' ? (
                <div className="bg-green-500 text-white p-1 rounded-full">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="bg-red-500 text-white p-1 rounded-full">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {images.length > 0 && (
        <div className="mt-4 text-center text-sm text-gray-500">
          共 {images.length} 张图片
        </div>
      )}
    </div>
  );
};