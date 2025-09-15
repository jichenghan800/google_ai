export interface PromptQualityReport {
  score: number; // 0-100
  reasons: string[];
}

// 轻量启发式评分：用于决定是否建议/自动优化（生成模块）
export function evaluatePromptQuality(input: string): PromptQualityReport {
  const text = (input || '').trim();
  if (!text) return { score: 0, reasons: ['空内容'] };

  const reasons: string[] = [];
  let score = 50; // 中位起点

  const length = text.length;
  if (length < 20) { score -= 20; reasons.push('过短'); }
  if (length > 200) { score += 5; }

  // 关键词/结构维度
  const hasScene = /场景|环境|背景|构图|光线|质感|材质|风格|情绪|氛围/.test(text);
  if (hasScene) score += 10; else { score -= 10; reasons.push('缺少场景/光线/风格等细节'); }

  // 仅关键词/名词列表（逗号/空格分隔）
  const commaRatio = (text.match(/[,，]/g) || []).length / Math.max(1, text.split(/\s+/).length);
  if (commaRatio > 0.2 && !/[。！？.!?]/.test(text)) { score -= 10; reasons.push('疑似关键词罗列'); }

  // 模糊或放权表达
  if (/随便|任意|自己发挥|类似|差不多|随意|任何|whatever/i.test(text)) { score -= 10; reasons.push('表述含糊'); }

  // 冲突/噪声参数
  if (/--ar\s*\d+:\d+/.test(text)) { score -= 2; reasons.push('包含尺寸参数（由画布控制）'); }

  // 用户显式禁止优化
  if (/不要优化|勿优化|保持原样|按我写的来/.test(text)) { score = 100; reasons.push('用户明确不需优化'); }

  score = Math.max(0, Math.min(100, score));
  return { score, reasons };
}

