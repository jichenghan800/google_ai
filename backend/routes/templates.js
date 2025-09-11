const express = require('express');
const router = express.Router();
const SYSTEM_PROMPTS = require('../config/systemPrompts');
const redis = require('redis');

// Redis客户端
const redisClient = redis.createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
});

// 连接Redis
redisClient.connect().catch(console.error);

const TEMPLATES_KEY = 'prompt_templates';

// 初始化默认模板到Redis
const initializeTemplates = async () => {
  try {
    const exists = await redisClient.exists(TEMPLATES_KEY);
    if (!exists) {
      await redisClient.set(TEMPLATES_KEY, JSON.stringify(SYSTEM_PROMPTS.PROMPT_TEMPLATES));
    }
  } catch (error) {
    console.error('Error initializing templates:', error);
  }
};

// 获取模板
const getTemplatesFromRedis = async () => {
  try {
    const data = await redisClient.get(TEMPLATES_KEY);
    return data ? JSON.parse(data) : SYSTEM_PROMPTS.PROMPT_TEMPLATES;
  } catch (error) {
    console.error('Error getting templates from Redis:', error);
    return SYSTEM_PROMPTS.PROMPT_TEMPLATES;
  }
};

// 保存模板
const saveTemplatesToRedis = async (templates) => {
  try {
    await redisClient.set(TEMPLATES_KEY, JSON.stringify(templates));
  } catch (error) {
    console.error('Error saving templates to Redis:', error);
  }
};

// 初始化
initializeTemplates();

// 获取所有模板
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    
    let templates = await getTemplatesFromRedis();
    
    // 根据类别过滤
    if (category && category !== 'all') {
      templates = templates.filter(t => t.category === category);
    }
    
    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates'
    });
  }
});

// 添加新模板
router.post('/', async (req, res) => {
  try {
    const { name, content, category } = req.body;
    
    if (!name || !content || !category) {
      return res.status(400).json({
        success: false,
        error: 'Name, content and category are required'
      });
    }
    
    const templates = await getTemplatesFromRedis();
    const newTemplate = {
      id: Date.now().toString(),
      name,
      content,
      category
    };
    
    templates.push(newTemplate);
    await saveTemplatesToRedis(templates);
    
    res.json({
      success: true,
      data: newTemplate
    });
  } catch (error) {
    console.error('Error adding template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add template'
    });
  }
});

// 更新模板
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, content } = req.body;
    
    const templates = await getTemplatesFromRedis();
    const templateIndex = templates.findIndex(t => t.id === id);
    
    if (templateIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }
    
    templates[templateIndex] = {
      ...templates[templateIndex],
      name,
      content
    };
    
    await saveTemplatesToRedis(templates);
    
    res.json({
      success: true,
      data: templates[templateIndex]
    });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update template'
    });
  }
});

// 删除模板
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const templates = await getTemplatesFromRedis();
    const templateIndex = templates.findIndex(t => t.id === id);
    
    if (templateIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }
    
    templates.splice(templateIndex, 1);
    await saveTemplatesToRedis(templates);
    
    res.json({
      success: true
    });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete template'
    });
  }
});

// 重新排序模板
router.put('/reorder', async (req, res) => {
  try {
    const { ids = [], category } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids must be a non-empty array' });
    }

    let templates = await getTemplatesFromRedis();

    // 仅对指定类别的模板进行排序（默认：edit）
    const targetCategory = category || 'edit';
    const categoryTemplates = templates.filter(t => t.category === targetCategory);
    const otherTemplates = templates.filter(t => t.category !== targetCategory);

    // 构建映射，按传入顺序重排
    const map = new Map(categoryTemplates.map(t => [t.id, t]));
    const reordered = ids.map(id => map.get(id)).filter(Boolean);

    // 如果有遗漏的（例如新加但未在ids中），保持原有相对顺序追加到末尾
    const missing = categoryTemplates.filter(t => !ids.includes(t.id));
    const finalCategory = [...reordered, ...missing];

    // 将排序后的目标类别模板替换回原数组，保留其它类别原顺序
    const indices = templates.map((t, i) => ({ t, i })).filter(x => x.t.category === targetCategory).map(x => x.i);
    templates = templates.slice();
    finalCategory.forEach((tpl, idx) => {
      const targetIndex = indices[idx];
      if (typeof targetIndex === 'number') {
        templates[targetIndex] = tpl;
      }
    });

    await saveTemplatesToRedis(templates);
    res.json({ success: true, data: finalCategory });
  } catch (error) {
    console.error('Error reordering templates:', error);
    res.status(500).json({ success: false, error: 'Failed to reorder templates' });
  }
});

module.exports = router;
