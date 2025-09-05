const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

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
