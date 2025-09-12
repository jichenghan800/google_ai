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
  const [theme, setTheme] = React.useState<string>(() => localStorage.getItem('theme') || 'light');
  const [lang, setLang] = React.useState<string>(() => localStorage.getItem('lang') || 'zh');

  React.useEffect(() => {
    try {
      localStorage.setItem('theme', theme);
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.setAttribute('data-theme', theme);
    } catch {}
  }, [theme]);

  React.useEffect(() => {
    try { localStorage.setItem('lang', lang); } catch {}
  }, [lang]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg h-full flex flex-col">
      {/* 顶部标题 + 副标题 + 操作 */}
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-xl font-semibold text-gray-900 leading-tight">创作画布</h3>
        <p className="text-sm text-gray-500 mt-1">选择您想要的图片比例</p>
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
      
      {/* 底部：放置“切换主题 / 切换语言”左右分布 */}
      <div className="px-6 py-4 border-t border-gray-100 rounded-b-lg">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 flex items-center justify-center shadow-sm"
            title="切换主题"
          >
            {theme === 'dark' ? (
              // Sun icon for light mode
              <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364l-1.414-1.414M7.05 7.05L5.636 5.636m12.728 0l-1.414 1.414M7.05 16.95l-1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              // Moon icon for dark mode
              <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 118.646 3.646 7 7 0 0020.354 15.354z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => setLang(l => (l === 'zh' ? 'en' : 'zh'))}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 flex items-center justify-center shadow-sm"
            title="切换语言"
          >
            {/* Globe icon */}
            <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 0c2.5 2 4 5.5 4 9s-1.5 7-4 9m0-18c-2.5 2-4 5.5-4 9s1.5 7 4 9m-7-9h14" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
