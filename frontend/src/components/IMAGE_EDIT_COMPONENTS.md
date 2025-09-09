# 图片编辑组件说明

从旧前端提取的图片编辑模块，包含完整的"修改前"和"修改后"对比显示功能。

## 核心组件

### 1. ImageEditWorkflow - 主工作流组件
完整的图片编辑工作流，包含上传、编辑、结果显示等所有功能。

```tsx
import { ImageEditWorkflow } from './components/ImageEditWorkflow';

<ImageEditWorkflow
  sessionId={sessionId}
  onProcessComplete={handleProcessComplete}
  isProcessing={isProcessing}
  editHistory={editHistory}
/>
```

### 2. ImageComparison - 图片对比显示组件
并排显示"修改前"和"修改后"的图片，支持多图网格布局。

```tsx
import { ImageComparison } from './components/ImageComparison';

<ImageComparison
  beforeImages={imagePreviews}
  afterImage={result?.result}
  onImagePreview={openImagePreview}
  onUpload={handleUpload}
  onClear={handleClear}
  isProcessing={isProcessing}
  currentResult={currentResult}
/>
```

### 3. ImagePreviewModal - 图片预览模态框
支持"before"和"after"类型的图片预览，包含下载功能。

```tsx
import { ImagePreviewModal } from './components/ImagePreviewModal';

<ImagePreviewModal
  imageUrl={previewImageUrl}
  title={previewImageTitle}
  type={previewImageType} // 'before' | 'after'
  isOpen={isPreviewOpen}
  onClose={closeImagePreview}
/>
```

### 4. ImageEditResultDisplay - 编辑结果展示组件
完整的编辑结果显示，包含图片对比、操作按钮和元数据。

```tsx
import { ImageEditResultDisplay } from './components/ImageEditResultDisplay';

<ImageEditResultDisplay
  result={currentResult}
  onClose={handleCloseResult}
  onContinueEdit={handleContinueEdit}
/>
```

### 5. ImageEditGallery - 编辑历史画廊
显示历史编辑记录的网格画廊。

```tsx
import { ImageEditGallery } from './components/ImageEditGallery';

<ImageEditGallery
  editHistory={editHistory}
  onResultClick={handleHistoryClick}
/>
```

### 6. ImageUploadArea - 图片上传区域
支持拖拽上传的图片选择组件。

```tsx
import { ImageUploadArea } from './components/ImageUploadArea';

<ImageUploadArea
  onFilesSelected={handleFilesSelected}
  maxFiles={2}
  disabled={isProcessing}
/>
```

## 关键功能特性

### 图片对比显示
- ✅ 支持1-4张图片的网格布局
- ✅ 响应式设计，移动端友好
- ✅ 点击图片放大预览
- ✅ "修改前"和"修改后"并排显示

### 图片预览功能
- ✅ 全屏模态框预览
- ✅ 支持before/after类型区分
- ✅ 一键下载功能
- ✅ 键盘ESC关闭支持

### 状态管理
- ✅ 图片上传状态管理
- ✅ 编辑结果状态管理
- ✅ 处理中状态显示
- ✅ 错误处理

### 用户交互
- ✅ 拖拽上传支持
- ✅ 继续编辑功能
- ✅ 历史记录查看
- ✅ 图片删除和清空

## 数据类型

主要使用的TypeScript接口：

```typescript
interface ImageEditResult {
  id: string;
  sessionId: string;
  prompt: string;
  inputImages: {
    originalName: string;
    mimeType: string;
    size: number;
    dataUrl?: string;
  }[];
  result: string;
  resultType: 'text' | 'image';
  createdAt: number;
  metadata?: {
    model: string;
    inputImageCount: number;
    hasText: boolean;
    hasImage: boolean;
  };
}
```

## 使用示例

完整的使用示例请参考 `ImageEditExample.tsx` 文件。

## 样式要求

组件使用Tailwind CSS，需要确保以下类可用：
- `card` - 卡片样式
- `btn-primary` - 主要按钮样式  
- `btn-secondary` - 次要按钮样式

## API接口

组件需要以下API端点：
- `POST /api/sessions/create` - 创建会话
- `POST /api/edit/image` - 提交编辑请求
- `GET /api/edit/history/:sessionId` - 获取编辑历史

## 响应式布局

- 移动端：单列布局，图片堆叠显示
- 桌面端：双列布局，修改前后并排显示
- 支持不同屏幕尺寸的网格布局自适应
