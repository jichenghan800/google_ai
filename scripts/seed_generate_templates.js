#!/usr/bin/env node
// Seed 6 official generation templates (en/zh exact from docs) into backend via /api/templates
// Idempotent: match by nameEn+contentEn when adding.

const axios = require('axios');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001/api';

const TEMPLATES = [
  {
    nameEn: 'Photorealistic scenes',
    nameZh: '逼真的场景',
    emoji: '📷',
    contentEn: `A photorealistic [shot type] of [subject], [action or expression], set in
[environment]. The scene is illuminated by [lighting description], creating
a [mood] atmosphere. Captured with a [camera/lens details], emphasizing
[key textures and details]. The image should be in a [aspect ratio] format.`,
    contentZh: `模板：以[环境]为背景的[主题]、[动作或表情]的逼真[镜头类型]。场景由[灯光描述]照亮，营造[情绪]氛围。使用[相机/镜头细节]拍摄，突出[关键纹理和细节]。图像应采用[宽高比]格式。`
  },
  {
    nameEn: 'Sticker or mascot design',
    nameZh: '风格化插画和贴纸',
    emoji: '🧩',
    contentEn: `A [style] sticker of a [subject], featuring [key characteristics] and a
[color palette]. The design should have [line style] and [shading style].
The background must be transparent.`,
    contentZh: `模板：一个 [主题] 的 [风格] 贴纸，包含 [主要特征] 和 [配色方案]。设计应包含 [线条样式] 和 [阴影样式]。背景必须为白色。`
  },
  {
    nameEn: 'Text rendering (logo/poster)',
    nameZh: '文字渲染',
    emoji: '🔤',
    contentEn: `Create a [image type] for [brand/concept] with the text "[text to render]"
in a [font style]. The design should be [style description], with a
[color scheme].`,
    contentZh: `模板：为[品牌/概念]创建[图片类型]，并在[字体样式]中添加[待渲染文本]文本。设计应为[样式描述]，并搭配[配色方案]。`
  },
  {
    nameEn: 'Product mockups and commercial photography',
    nameZh: '产品模型和商业摄影',
    emoji: '📸',
    contentEn: `A high-resolution, studio-lit product photograph of a [product description]
on a [background surface/description]. The lighting is a [lighting setup,
e.g., three-point softbox setup] to [lighting purpose]. The camera angle is
a [angle type] to showcase [specific feature]. Ultra-realistic, with sharp
focus on [key detail]. [Aspect ratio].`,
    contentZh: `模板：一张高分辨率、工作室灯光下的产品照片，照片中[产品描述]位于[背景表面/描述]之上。灯光采用[照明设置，例如三点柔光箱设置]，以达到[照明目的]。拍摄角度采用[角度类型]，以展现[特定功能]。超逼真，清晰对焦[关键细节]。[宽高比]。`
  },
  {
    nameEn: 'Minimalist and negative space',
    nameZh: '极简风格和负空间设计',
    emoji: '◻️',
    contentEn: `A minimalist composition featuring a single [subject] positioned in the
[bottom-right/top-left/etc.] of the frame. The background is a vast, empty
[color] canvas, creating significant negative space. Soft, subtle lighting.
[Aspect ratio].`,
    contentZh: `模板：极简主义构图，单一[主体]位于画面[右下/左上/等等]。背景是一块巨大的空白[彩色]画布，营造出显著的负空间。柔和细腻的灯光。[宽高比]。`
  },
  {
    nameEn: 'Sequential art (comic panel / storyboard)',
    nameZh: '连续艺术（漫画分格 / 故事板）',
    emoji: '🗯️',
    contentEn: `A single comic book panel in a [art style] style. In the foreground,
[character description and action]. In the background, [setting details].
The panel has a [dialogue/caption box] with the text "[Text]". The lighting
creates a [mood] mood. [Aspect ratio].`,
    contentZh: `模板：采用[艺术风格]风格的单幅漫画画板。前景为[人物描述和动作]。背景为[场景详情]。画板内有一个[对话/标题框]，其中包含[文本]文字。灯光营造出[氛围]氛围。[宽高比]。`
  }
];

async function main() {
  const api = axios.create({ baseURL: API_BASE, timeout: 15000 });
  const cur = await api.get('/templates?category=generate').then(r => r.data?.data || []).catch(() => []);
  const byKey = new Map();
  for (const item of cur) {
    const key = `${((item.nameEn || item.name) || '').trim()}__${((item.contentEn || item.content) || '').trim()}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  let added = 0;
  let updated = 0;
  for (const t of TEMPLATES) {
    const key = `${t.nameEn.trim()}__${t.contentEn.trim()}`;
    const existing = byKey.get(key);
    const payload = {
      name: t.nameEn,
      content: t.contentEn,
      nameZh: t.nameZh,
      nameEn: t.nameEn,
      contentZh: t.contentZh,
      contentEn: t.contentEn,
      emoji: t.emoji
    };
    if (!existing) {
      let addedOk = false;
      await api.post('/templates', {
        ...payload,
        category: 'generate'
      }).then(res => {
        const created = res?.data?.data;
        if (created?.id) {
          byKey.set(key, created);
          addedOk = true;
        }
      }).catch(e => { console.error('Add failed:', t.nameEn, e?.message); });
      if (addedOk) added++;
      continue;
    }
    const needsUpdate = Object.entries(payload).some(([field, value]) => {
      const current = existing[field];
      return (current || '') !== value;
    });
    if (needsUpdate) {
      let updatedOk = false;
      console.log('Updating template', existing.id, 'with bilingual fields');
      await api.put(`/templates/${existing.id}`, payload).then(res => {
        const saved = res?.data?.data;
        if (saved) {
          byKey.set(key, saved);
          updatedOk = true;
        }
      }).catch(e => { console.error('Update failed:', t.nameEn, e?.message); });
      if (updatedOk) updated++;
    }
  }
  console.log(`Seed completed. Added ${added} new template(s), updated ${updated}.`);
}

main();
