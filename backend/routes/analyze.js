const express = require('express');
const multer = require('multer');
const router = express.Router();
const vertexAIService = require('../services/vertexAI');
const sessionManager = require('../services/sessionManager');

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

// 分析上传的图片
router.post('/analyze-image', upload.single('image'), async (req, res) => {
  try {
    const { sessionId, prompt } = req.body;

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

    // 分析图片
    const analysisPrompt = prompt || "请详细分析这张图片，描述你看到的内容、物体、场景、颜色、情感等各个方面。";
    
    const result = await vertexAIService.analyzeImage(
      req.file.buffer, 
      req.file.mimetype, 
      analysisPrompt
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
    console.error('Error in image analysis endpoint:', error);
    
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
      message: error.message
    });
  }
});

// 批量分析多张图片
router.post('/analyze-images', upload.array('images', 5), async (req, res) => {
  try {
    const { sessionId, prompt } = req.body;

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

    const analysisPrompt = prompt || "请详细分析这张图片，描述你看到的内容、物体、场景、颜色、情感等各个方面。";
    const results = [];

    // 并行分析所有图片
    const analysisPromises = req.files.map(async (file, index) => {
      try {
        const result = await vertexAIService.analyzeImage(
          file.buffer,
          file.mimetype,
          analysisPrompt
        );

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