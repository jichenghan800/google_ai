const normalizeTier = (tier) => {
  const val = String(tier || '').toLowerCase();
  if (val === 'admin') return 'admin';
  if (['vip', 'svip', 'user'].includes(val)) return val;
  return 'user';
};

const RESOLUTION_BY_TIER = {
  user: ['1K'],
  vip: ['1K', '2K'],
  svip: ['1K', '2K', '4K'],
  admin: ['1K', '2K', '4K']
};

const getAllowedResolutions = (tier) => {
  const key = normalizeTier(tier);
  return RESOLUTION_BY_TIER[key] || RESOLUTION_BY_TIER.user;
};

const guardResolution = (requestedResolution, tier) => {
  const allowed = getAllowedResolutions(tier);
  const normalized = typeof requestedResolution === 'string' ? requestedResolution.toUpperCase() : requestedResolution;
  if (!normalized) {
    return { resolved: null, allowed, downgraded: false };
  }
  if (allowed.includes(normalized)) {
    return { resolved: normalized, allowed, downgraded: false };
  }
  const fallback = allowed[allowed.length - 1];
  return { resolved: fallback, allowed, downgraded: true };
};

module.exports = {
  normalizeTier,
  getAllowedResolutions,
  guardResolution
};
