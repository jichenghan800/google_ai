const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const {
  isEmailAuthEnabled,
  parseAllowedSuffixes,
  isEmailAllowed,
  getOrCreateUserByEmail,
  createLoginToken,
  consumeLoginToken,
  signJwt,
  setAuthCookie,
  clearAuthCookie,
  attachUserSoft
} = require('../services/authService');
const emailService = require('../services/emailService');

// 系统提示词存储文件路径
const PROMPTS_FILE = path.join(__dirname, '../data/system-prompts.json');

// 确保数据目录存在
const ensureDataDir = async () => {
  const dataDir = path.dirname(PROMPTS_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
};

// 登录配置（前端可读取）
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      emailAuthEnabled: isEmailAuthEnabled(),
      allowedEmailSuffixes: parseAllowedSuffixes()
    }
  });
});

// 请求登录链接
router.post('/request-link', async (req, res) => {
  try {
    if (!isEmailAuthEnabled()) {
      return res.status(503).json({ success: false, error: 'Email auth disabled' });
    }

    const { email, redirectUrl } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    if (!isEmailAllowed(email)) {
      return res.status(400).json({ success: false, error: 'Email suffix not allowed' });
    }

    const loginBase = redirectUrl || process.env.LOGIN_LINK_BASE_URL;
    if (!loginBase) {
      return res.status(500).json({ success: false, error: 'LOGIN_LINK_BASE_URL not configured' });
    }

    const user = await getOrCreateUserByEmail(email);
    const { token, expiresAt } = await createLoginToken(user.id);
    const link = `${loginBase}${loginBase.includes('?') ? '&' : '?'}token=${token}`;
    const result = await emailService.sendLoginLink({ to: email, link });

    res.json({
      success: true,
      data: {
        sent: result.sent,
        expiresAt,
        previewLink: result.preview
      }
    });
  } catch (error) {
    console.error('request-link error:', error);
    res.status(500).json({ success: false, error: 'Failed to send login link', message: error.message });
  }
});

const handleCallback = async (req, res) => {
  try {
    if (!isEmailAuthEnabled()) {
      return res.status(503).json({ success: false, error: 'Email auth disabled' });
    }
    const token = req.body?.token || req.query?.token;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }
    const result = await consumeLoginToken(token);
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error || 'Invalid token' });
    }
    const jwtToken = signJwt(result.user);
    setAuthCookie(res, jwtToken);
    res.json({
      success: true,
      data: {
        token: jwtToken,
        user: {
          id: result.user.id,
          email: result.user.email,
          displayName: result.user.displayName || result.user.email.split('@')[0],
          role: result.user.role || 'user',
          tier: result.user.tier || 'user'
        }
      }
    });
  } catch (error) {
    console.error('auth callback error:', error);
    res.status(500).json({ success: false, error: 'Login failed', message: error.message });
  }
};

router.post('/callback', handleCallback);
router.get('/callback', handleCallback);

// 当前用户
router.get('/me', attachUserSoft, (req, res) => {
  const enabled = isEmailAuthEnabled();
  if (!enabled) {
    return res.json({ success: true, data: { emailAuthEnabled: false, user: null } });
  }
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthenticated' });
  }
  res.json({
    success: true,
    data: {
      emailAuthEnabled: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        displayName: req.user.displayName || req.user.email?.split('@')[0],
        role: req.user.role || 'user',
        tier: req.user.tier || 'user'
      }
    }
  });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

// 验证模板管理密码
router.post('/verify-template-password', (req, res) => {
  try {
    const { password } = req.body;
    const correctPassword = process.env.TEMPLATE_ADMIN_PASSWORD || 'admin123';
    
    if (password === correctPassword) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, message: '密码错误' });
    }
  } catch (error) {
    console.error('Password verification error:', error);
    res.status(500).json({ success: false, message: '验证失败' });
  }
});

// 获取系统提示词
router.get('/system-prompts', async (req, res) => {
  try {
    await ensureDataDir();
    try {
      const data = await fs.readFile(PROMPTS_FILE, 'utf8');
      res.json({ success: true, data: JSON.parse(data) });
    } catch {
      // 文件不存在，返回默认值
      res.json({ success: true, data: {} });
    }
  } catch (error) {
    console.error('Get system prompts error:', error);
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

// 保存系统提示词
router.post('/system-prompts', async (req, res) => {
  try {
    const { password, prompts } = req.body;
    const correctPassword = process.env.TEMPLATE_ADMIN_PASSWORD || 'admin123';
    
    if (password !== correctPassword) {
      return res.status(401).json({ success: false, message: '密码错误' });
    }

    await ensureDataDir();
    await fs.writeFile(PROMPTS_FILE, JSON.stringify(prompts, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Save system prompts error:', error);
    res.status(500).json({ success: false, message: '保存失败' });
  }
});

module.exports = router;
