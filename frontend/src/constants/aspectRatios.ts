import { AspectRatioOption } from '../types/index';

export const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  {
    id: '1024x1024',
    label: '方图',
    labelZh: '方图',
    labelEn: 'Square',
    description: '1024×1024',
    width: 1024,
    height: 1024,
    icon: '',
    useCase: 'Square format',
  },
  {
    id: '1344x768',
    label: '横图',
    labelZh: '横图',
    labelEn: 'Landscape',
    description: '1344×768',
    width: 1344,
    height: 768,
    icon: '',
    useCase: 'Landscape format',
  },
  {
    id: '768x1344',
    label: '竖图',
    labelZh: '竖图',
    labelEn: 'Portrait',
    description: '768×1344',
    width: 768,
    height: 1344,
    icon: '',
    useCase: 'Portrait format',
  },
];

export type AspectRatioOptionType = typeof ASPECT_RATIO_OPTIONS[number];
