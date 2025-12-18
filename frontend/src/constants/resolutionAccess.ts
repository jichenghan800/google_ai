import { UserTier } from '../types';

export const normalizeTier = (tier?: string | null): UserTier => {
  const val = String(tier || '').toLowerCase();
  if (val === 'admin') return 'admin';
  if (val === 'svip') return 'svip';
  if (val === 'vip') return 'vip';
  return 'user';
};

const RES_BY_TIER: Record<UserTier, string[]> = {
  user: ['1K'],
  vip: ['1K', '2K'],
  svip: ['1K', '2K', '4K'],
  admin: ['1K', '2K', '4K']
};

export const getAllowedResolutionsForTier = (tier: UserTier): string[] => {
  return RES_BY_TIER[tier] || RES_BY_TIER.user;
};
