const express = require('express');
const multer = require('multer');
const router = express.Router();
const vertexAIService = require('../services/vertexAI');
const sessionManager = require('../services/sessionManager');
const authService = require('../services/authService');

// 配置multer用于处理文件上传
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB限制
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片文件
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

router.use(authService.attachUserSoft);

// 分析上传的图片
router.post('/analyze-image', upload.single('image'), async (req, res) => {
  try {
    const { sessionId, prompt, customSystemPrompt, scenario } = req.body;
    const DEBUG = process.env.DEBUG_AI === '1' || process.env.DEBUG_AI === 'true';

    // 验证必需字段
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file uploaded'
      });
    }

    // 验证会话存在
    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    if (session.userId && req.user && session.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    // 分析图片：不在路由层面回退默认提示词，由服务层统一处理
    const analysisPrompt = (typeof prompt === 'string' ? prompt : '').trim();

    const result = await vertexAIService.analyzeImage(
      req.file.buffer,
      req.file.mimetype,
      { prompt: analysisPrompt, customSystemPrompt, scenario }
    );

    if (result.success) {
      // 创建分析结果对象
      const analysisResult = {
        id: require('uuid').v4(),
        sessionId: sessionId,
        analysis: result.analysis,
        prompt: analysisPrompt,
        imageInfo: {
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size
        },
        createdAt: Date.now(),
        metadata: result.metadata
      };

      // 将分析结果添加到会话历史中（可以扩展一个新的字段存储分析历史）
      // 这里先简单存储，后续可以优化
      
      res.json({
        success: true,
        data: analysisResult,
        message: 'Image analysis completed successfully'
      });

    } else {
      throw new Error(result.error || 'Image analysis failed');
    }

  } catch (error) {
    console.error('Error in image analysis endpoint:', error?.message || error);
    if (process.env.DEBUG_AI === '1' || process.env.DEBUG_AI === 'true') {
      console.error('[API][Analyze] Error details', {
        name: error?.name,
        message: error?.message,
        code: error?.code,
        status: error?.status,
        details: error?.details,
        stack: error?.stack,
      });
    }
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'File too large',
        message: 'Image file must be smaller than 10MB'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to analyze image',
      message: error.message || error.error || 'Internal server error',
      originalError: typeof error === 'object' ? JSON.stringify(error) : String(error)
    });
  }
});

// 批量分析多张图片
router.post('/analyze-images', upload.array('images', 5), async (req, res) => {
  try {
    const { sessionId, prompt, customSystemPrompt, scenario } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No image files uploaded'
      });
    }

    // 验证会话存在
    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    if (session.userId && req.user && session.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const analysisPrompt = (typeof prompt === 'string' ? prompt : '').trim();
    const results = [];

    // 并行分析所有图片
    const analysisPromises = req.files.map(async (file, index) => {
      try {
        console.log(`🔍 开始分析图片 ${index + 1}: ${file.originalname}`);
        console.log(`📊 图片信息: ${file.mimetype}, ${file.size} bytes`);
        
        const result = await vertexAIService.analyzeImage(
          file.buffer,
          file.mimetype,
          { prompt: analysisPrompt, customSystemPrompt, scenario }
        );

        console.log(`✅ 图片 ${index + 1} 分析完成: ${result.success ? '成功' : '失败'}`);
        if (result.success) {
          console.log(`📝 分析结果长度: ${result.analysis.length} 字符`);
        }

        return {
          index,
          success: result.success,
          analysis: result.analysis,
          imageInfo: {
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size
          },
          metadata: result.metadata
        };
      } catch (error) {
        return {
          index,
          success: false,
          error: error.message || 'Analysis failed',
          imageInfo: {
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size
          }
        };
      }
    });

    const analysisResults = await Promise.all(analysisPromises);

    res.json({
      success: true,
      data: {
        results: analysisResults,
        totalImages: req.files.length,
        successCount: analysisResults.filter(r => r.success).length,
        failureCount: analysisResults.filter(r => !r.success).length
      },
      message: 'Batch image analysis completed'
    });

  } catch (error) {
    console.error('Error in batch image analysis endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze images',
      message: error.message
    });
  }
});

// 获取支持的图片格式信息
router.get('/supported-formats', (req, res) => {
  res.json({
    success: true,
    data: {
      supportedMimeTypes: [
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'image/gif',
        'image/webp',
        'image/bmp'
      ],
      maxFileSize: '10MB',
      maxFiles: 5,
      recommendedFormats: ['JPEG', 'PNG', 'WebP']
    }
  });
});

module.exports = router;
