# 图片编辑模块修复说明

## 问题描述
在图片编辑功能中，当生成新图片后，左侧"修改前"的原图预览会发生变化，导致修改前和修改后两张图片的高宽比不一致。

## 问题原因
在 `UnifiedWorkflow.tsx` 组件的 `switchPreviewImage` 函数中，当从"修改后"切换到"修改前"时，代码使用了 `imagePreviews[0]`，这个数组在图片编辑过程中可能被修改，导致原图预览发生变化。

## 修复方案
1. **添加原始图片引用状态**：
   ```typescript
   const [originalImageRef, setOriginalImageRef] = useState<string>('');
   ```

2. **在图片上传时保存原始图片引用**：
   ```typescript
   // 保存第一张图片作为原始图片引用（用于预览切换）
   if (finalPreviews.length > 0 && !originalImageRef) {
     setOriginalImageRef(finalPreviews[0]);
   }
   ```

3. **修改预览切换逻辑**：
   ```typescript
   const switchPreviewImage = () => {
     if (previewImageType === 'before' && currentResult) {
       // 从修改前切换到修改后
       setPreviewImageUrl(currentResult.result);
       setPreviewImageTitle(isContinueEditMode ? '修改中...' : '修改后');
       setPreviewImageType('after');
     } else if (previewImageType === 'after' && originalImageRef) {
       // 从修改后切换到修改前 - 使用保存的原始图片引用
       setPreviewImageUrl(originalImageRef);
       setPreviewImageTitle('修改前');
       setPreviewImageType('before');
     }
   };
   ```

4. **在相关操作中维护原始图片引用**：
   - 清除图片时清除引用
   - 移除图片时更新引用
   - 继续编辑模式时设置引用

## 修复效果
- ✅ 修改前的原图预览保持不变
- ✅ 修改前后图片高宽比保持一致
- ✅ 图片预览切换功能正常工作
- ✅ 不影响其他功能的正常使用

## 测试建议
1. 上传一张图片进行编辑
2. 生成编辑结果后，点击预览查看修改前后对比
3. 使用左右箭头切换预览，确认修改前的图片保持不变
4. 测试多次编辑同一张图片的场景
5. 测试继续编辑模式的图片预览功能
