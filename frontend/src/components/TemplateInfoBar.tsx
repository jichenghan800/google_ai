import React from 'react';

interface TemplateInfo {
  name?: string;
  emoji?: string;
  display: string; // zh by default
  english?: string;
  remark?: string;
}

interface TemplateInfoBarProps { info: TemplateInfo }

// Single-line info bar: emoji + name + content, truncated.
export const TemplateInfoBar: React.FC<TemplateInfoBarProps> = ({ info }) => {
  const title = info.name || '模板';
  const emoji = info.emoji || '🧩';
  const content = info.display || '';
  return (
    <div
      className="rounded-lg border border-sky-200 bg-white/70 shadow-sm px-3 py-2 overflow-hidden"
      style={{ backdropFilter: 'blur(6px)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="select-none">{emoji}</span>
        <span className="text-gray-800 font-medium truncate max-w-[20%] sm:max-w-[25%] md:max-w-[30%]">
          {title}
        </span>
        <span className="text-gray-400">|</span>
        <span className="text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis flex-1">
          {content}
        </span>
      </div>
    </div>
  );
};

export default TemplateInfoBar;
