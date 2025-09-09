# 持续编辑模式优化提示词问题修复

## 问题描述
在图片编辑模块中，当持续编辑按钮生效的情况下，点击"优化提示词"会错误地清空修改中的图片。

## 问题原因
在 `UnifiedWorkflow.tsx` 的 `handlePolishPrompt` 函数中，无论什么情况下都会调用 `onClearResult()` 来清除当前结果。但是在持续编辑模式下，当前结果是用户正在编辑的图片，不应该被清空。

## 修复方案
在两个关键位置添加了 `!isContinueEditMode` 的条件判断：

### 1. 优化提示词开始时的清理逻辑
**位置**: `handlePolishPrompt` 函数第850行
**修改前**:
```javascript
// 清除当前结果，避免使用旧的生成结果
if (onClearResult) {
  onClearResult();
}
```

**修改后**:
```javascript
// 清除当前结果，避免使用旧的生成结果
// 但在持续编辑模式下不清除，因为用户正在编辑当前结果
if (onClearResult && !isContinueEditMode) {
  onClearResult();
}
```

### 2. 智能分析内容政策违规时的清理逻辑
**位置**: `handlePolishPrompt` 函数第929行
**修改前**:
```javascript
// 清除当前结果，让错误信息显示在结果区域
if (onClearResult) {
  onClearResult();
}
```

**修改后**:
```javascript
// 清除当前结果，让错误信息显示在结果区域
// 但在持续编辑模式下不清除，因为用户正在编辑当前结果
if (onClearResult && !isContinueEditMode) {
  onClearResult();
}
```

## 修复效果
- ✅ 持续编辑模式下，点击"优化提示词"不再清空修改中的图片
- ✅ 保持原有的优化提示词功能正常工作
- ✅ 非持续编辑模式下的行为保持不变
- ✅ 错误处理逻辑保持完整

## 测试建议
1. 生成一张图片
2. 点击"持续编辑"按钮进入持续编辑模式
3. 输入新的编辑指令
4. 点击"优化提示词"按钮
5. 验证右侧的"修改中..."图片没有被清空
6. 验证提示词被正确优化

## 相关文件
- `/frontend/src/components/UnifiedWorkflow.tsx`

## 修复时间
2025-09-09
