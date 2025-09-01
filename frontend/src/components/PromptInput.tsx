import React, { useState } from 'react';
import { ImageGenerationParams } from '../types/index.ts';

interface PromptInputProps {
  onGenerate: (prompt: string, parameters: ImageGenerationParams) => void;
  isGenerating: boolean;
  currentSettings: ImageGenerationParams;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  onGenerate,
  isGenerating,
  currentSettings
}) => {
  const [prompt, setPrompt] = useState('');
  const [settings, setSettings] = useState<ImageGenerationParams>(currentSettings);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !isGenerating) {
      onGenerate(prompt.trim(), settings);
    }
  };


  const styles = [
    { label: '自然', value: 'natural' },
    { label: '艺术', value: 'artistic' },
    { label: '卡通', value: 'cartoon' },
    { label: '写实', value: 'realistic' },
    { label: '抽象', value: 'abstract' },
  ];

  const qualities = [
    { label: '草图', value: 'draft' },
    { label: '标准', value: 'standard' },
    { label: '高质量', value: 'high' },
  ];

  return (
    <div className="card p-6 mb-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
            描述您想要生成的图片
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例如：一只可爱的小猫坐在彩虹色的云朵上，周围有星星闪烁..."
            className="input-field h-24 resize-none"
            maxLength={1000}
            disabled={isGenerating}
          />
          <div className="mt-1 text-right text-sm text-gray-500">
            {prompt.length}/1000
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              风格
            </label>
            <select
              value={settings.style}
              onChange={(e) => setSettings({ ...settings, style: e.target.value })}
              className="input-field"
              disabled={isGenerating}
            >
              {styles.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              质量
            </label>
            <select
              value={settings.quality}
              onChange={(e) => setSettings({ ...settings, quality: e.target.value as 'draft' | 'standard' | 'high' })}
              className="input-field"
              disabled={isGenerating}
            >
              {qualities.map((quality) => (
                <option key={quality.value} value={quality.value}>
                  {quality.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            type="submit"
            disabled={!prompt.trim() || isGenerating}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 px-8 py-3"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
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
                <span>生成中...</span>
              </>
            ) : (
              <>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span>生成图片</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};