import React from 'react';

export const ResponsiveTest: React.FC = () => {
  return (
    <div className="container-responsive py-8">
      <div className="spacing-responsive">
        {/* 标题测试 */}
        <div className="text-center">
          <h1 className="text-responsive-title font-bold text-blue-600 mb-4">
            响应式测试页面
          </h1>
          <p className="text-responsive-subtitle text-gray-600">
            测试不同屏幕尺寸下的显示效果
          </p>
        </div>

        {/* 网格测试 */}
        <div className="grid-responsive">
          <div className="card-responsive bg-white rounded-lg shadow">
            <h3 className="text-responsive-body font-semibold mb-2">卡片 1</h3>
            <div className="image-preview-responsive bg-gray-100 rounded flex items-center justify-center">
              <span className="text-gray-500">图片预览区域</span>
            </div>
          </div>
          <div className="card-responsive bg-white rounded-lg shadow">
            <h3 className="text-responsive-body font-semibold mb-2">卡片 2</h3>
            <div className="image-preview-responsive bg-gray-100 rounded flex items-center justify-center">
              <span className="text-gray-500">图片预览区域</span>
            </div>
          </div>
        </div>

        {/* 模式选择器测试 */}
        <div className="mode-grid-responsive">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="mode-card-responsive bg-white rounded-lg shadow border flex flex-col justify-center items-center">
              <div className="icon-responsive mb-2">🎨</div>
              <span className="text-xs xs:text-sm font-medium">模式 {i}</span>
            </div>
          ))}
        </div>

        {/* 按钮组测试 */}
        <div className="button-group-responsive">
          <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            主要按钮
          </button>
          <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
            次要按钮
          </button>
          <button className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
            确认按钮
          </button>
        </div>

        {/* 屏幕尺寸指示器 */}
        <div className="text-center p-4 bg-gray-100 rounded">
          <div className="text-responsive-body">
            <span className="inline xs:hidden">XS (< 475px)</span>
            <span className="hidden xs:inline sm:hidden">XS (475px+)</span>
            <span className="hidden sm:inline md:hidden">SM (640px+)</span>
            <span className="hidden md:inline lg:hidden">MD (768px+)</span>
            <span className="hidden lg:inline xl:hidden">LG (1024px+)</span>
            <span className="hidden xl:inline 2xl:hidden">XL (1280px+)</span>
            <span className="hidden 2xl:inline">2XL (1536px+)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
