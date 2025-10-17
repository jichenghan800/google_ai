const NANO_EMOJI_MAP: Record<string, string> = {
  '3D Figurine': '🧍',
  'Funko Pop Figure': '📦',
  'LEGO Minifigure': '🧱',
  'Crochet Doll': '🧶',
  'Anime to Cosplay': '🎭',
  'Cute Plushie': '🧸',
  'Acrylic Keychain': '🔑',
  'HD Enhance': '🔍',
  'Pose Reference': '💃',
  'To Photorealistic': '🪄',
  'Fashion Magazine': '📸',
  'Hyper-realistic': '✨',
  'Architecture Model': '🏗️',
  'Product Render': '💡',
  'Soda Can Design': '🥤',
  'Industrial Design Render': '🛋️',
  'Color Palette Swap': '🎨',
  'Line Art Drawing': '✍️',
  'Painting Process': '🖼️',
  'Marker Sketch': '🖊️',
  'Add Illustration': '🧑‍🎨',
  'Cyberpunk': '🤖',
  'Van Gogh Style': '🌌',
  'Isolate & Enhance': '🎯',
  '3D Screen Effect': '📺',
  'Makeup Analysis': '💄',
  'Change Background': '🪩',
};

type TemplateLike = {
  emoji?: string;
  name?: string;
  nameZh?: string;
  nameEn?: string;
};

export const resolveTemplateEmoji = (template: TemplateLike): string => {
  const explicit = template?.emoji?.trim();
  if (explicit) return explicit;

  const key = (template?.nameEn || template?.name || '').trim();
  if (key && NANO_EMOJI_MAP[key]) {
    return NANO_EMOJI_MAP[key];
  }

  const fallbackLabel = (template?.nameZh || template?.name || template?.nameEn || '').trim();
  if (fallbackLabel) {
    return fallbackLabel.slice(0, 1);
  }

  return '';
};

export default resolveTemplateEmoji;
