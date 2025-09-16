import React, { useState } from 'react';

interface TemplateInfo {
  name?: string;
  emoji?: string;
  display: string; // zh by default
  english?: string;
  remark?: string;
}

interface TemplateInfoBarProps {
  info: TemplateInfo;
  onClose: () => void;
}

// A compact, polished info bar that temporarily replaces the mode toggle.
// Shows selected template content (zh/en), supports copy & close.
export const TemplateInfoBar: React.FC<TemplateInfoBarProps> = ({ info, onClose }) => {
  const [lang, setLang] = useState<'zh' | 'en'>(info.display ? 'zh' : 'en');
  const hasEn = !!(info.english && info.english.trim());
  const currentText = lang === 'zh' ? (info.display || '') : (info.english || '');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(currentText);
    } catch {
      // ignore clipboard errors silently
    }
  };

  return (
    <div
      className="relative rounded-xl border border-sky-200/60 bg-gradient-to-r from-indigo-50 via-sky-50 to-emerald-50 shadow-lg"
      style={{
        backgroundImage:
          'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(56,189,248,0.08))',
      }}
    >
      <div className="px-4 py-3 sm:px-5 sm:py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white/70 border border-white/60 shadow flex items-center justify-center">
              <span className="text-lg sm:text-xl select-none">{info.emoji || '🧩'}</span>
            </div>
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-semibold text-gray-800 truncate">
                {info.name || '已选模板'}
              </div>
              {info.remark && (
                <div className="text-xs sm:text-sm text-gray-500 truncate">{info.remark}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {hasEn && (
              <div className="inline-flex rounded-md border border-sky-200 bg-white/60 backdrop-blur text-xs overflow-hidden">
                <button
                  className={`px-2 py-1 ${lang === 'zh' ? 'bg-sky-100 text-sky-800' : 'text-gray-600 hover:text-gray-900'}`}
                  onClick={() => setLang('zh')}
                  title="查看中文"
                >中</button>
                <button
                  className={`px-2 py-1 ${lang === 'en' ? 'bg-sky-100 text-sky-800' : 'text-gray-600 hover:text-gray-900'}`}
                  onClick={() => setLang('en')}
                  title="View English"
                >EN</button>
              </div>
            )}
            <button
              onClick={copy}
              className="inline-flex items-center gap-1 text-xs sm:text-sm px-2 py-1 rounded-md border border-emerald-200 bg-white/60 hover:bg-emerald-50 text-emerald-700 shadow-sm"
              title="复制内容"
            >
              <span>📋</span>
              <span>复制</span>
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1 text-xs sm:text-sm px-2 py-1 rounded-md border border-gray-200 bg-white/60 hover:bg-white text-gray-700 shadow-sm"
              title="返回模式选择"
            >
              <span>✖</span>
              <span className="hidden sm:inline">关闭</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="rounded-lg border border-gray-200 bg-white/70 backdrop-blur p-3 sm:p-4 overflow-auto max-h-40 sm:max-h-48">
          <pre
            className={`whitespace-pre-wrap break-words ${lang === 'en' ? 'font-mono text-gray-800' : 'text-gray-900'}`}
            style={{ lineHeight: 1.5 }}
          >{currentText}</pre>
        </div>

        {/* Footer hint */}
        <div className="mt-2 text-[11px] sm:text-xs text-gray-500 flex items-center gap-1">
          <span>提示：</span>
          <span>点击底部操作按钮开始处理，处理完成后将自动恢复模式切换。</span>
        </div>
      </div>
    </div>
  );
};

export default TemplateInfoBar;

