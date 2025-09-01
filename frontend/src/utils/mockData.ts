import { GeneratedImage } from '../types/index.ts';

export const sampleImages: GeneratedImage[] = [
  {
    id: '1',
    prompt: '一只可爱的小猫咪坐在彩虹上，背景是星空',
    imageUrl: 'https://via.placeholder.com/512x512/ff6b6b/ffffff?text=Sample+1',
    parameters: {
      aspectRatio: '1:1',
      style: 'cartoon',
      quality: 'high'
    },
    createdAt: Date.now() - 3600000,
    status: 'completed'
  },
  {
    id: '2', 
    prompt: '未来城市的夜景，有飞行汽车和霓虹灯',
    imageUrl: 'https://via.placeholder.com/512x512/4ecdc4/ffffff?text=Sample+2',
    parameters: {
      aspectRatio: '16:9',
      style: 'realistic',
      quality: 'high'
    },
    createdAt: Date.now() - 7200000,
    status: 'completed'
  }
];

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));