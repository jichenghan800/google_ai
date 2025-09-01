const express = require('express');
const multer = require('multer');
const router = express.Router();
const vertexAIService = require('../services/vertexAI');
const sessionManager = require('../services/sessionManager');

// 配置multer用于处理多文件上传
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB限制
    files: 2 // 最多2个文件
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

// 图片编辑端点 - 支持1-2张图片上传
router.post('/edit-images', upload.array('images', 2), async (req, res) => {
  try {
    const { sessionId, prompt, originalPrompt, aspectRatio, width, height } = req.body;

    // 验证必需字段
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    if (!prompt || prompt.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    // 图片不是必需的，但如果提供了，最多2张
    if (req.files && req.files.length > 2) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 2 images allowed'
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

    console.log(`Processing image editing request for session ${sessionId}`);
    console.log(`Number of images: ${req.files ? req.files.length : 0}`);
    console.log(`Prompt: ${prompt}`);
    console.log(`Aspect ratio: ${aspectRatio}, Size: ${width}x${height}`);
    
    // 如果没有上传图片，这是图片生成请求
    if (!req.files || req.files.length === 0) {
      console.log('No images uploaded, treating as image generation request');
      
      // 构建生成参数
      const generationParams = {
        aspectRatio: aspectRatio || '1:1',
        width: parseInt(width) || 1024,
        height: parseInt(height) || 1024,
        style: 'natural',
        quality: 'high'
      };
      
      // 调用图片生成服务
      const result = await vertexAIService.generateImage(prompt.trim(), generationParams);
      
      if (result.success) {
        // 创建生成结果对象
        const editResult = {
          id: require('uuid').v4(),
          sessionId: sessionId,
          prompt: prompt.trim(),
          originalPrompt: originalPrompt || prompt.trim(), // 保留原始提示词，如果未提供则使用当前提示词
          inputImages: [],
          result: result.imageUrl,
          resultType: 'image',
          createdAt: Date.now(),
          metadata: {
            ...result.metadata,
            aspectRatio: aspectRatio || '1:1',
            dimensions: `${parseInt(width) || 1024}x${parseInt(height) || 1024}`
          }
        };

        // 保存生成结果到会话历史中
        try {
          await sessionManager.addToEditHistory(sessionId, editResult);
          console.log(`✅ Generation result saved to session ${sessionId}`);
        } catch (sessionError) {
          console.error('Failed to save generation result to session:', sessionError);
        }

        res.json({
          success: true,
          data: editResult,
          message: 'Image generation completed successfully'
        });
        return;
      } else {
        throw new Error(result.error || 'Image generation failed');
      }
    }
    
    // 处理图片编辑
    const result = await vertexAIService.editImages(
      req.files,
      prompt.trim()
    );

    if (result.success) {
      // 创建编辑结果对象
      const editResult = {
        id: require('uuid').v4(),
        sessionId: sessionId,
        prompt: prompt.trim(),
        inputImages: (req.files || []).map(file => ({
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          dataUrl: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
        })),
        result: result.result, // 可能是文字描述或新图片
        resultType: result.resultType, // 'text' 或 'image'
        createdAt: Date.now(),
        metadata: result.metadata
      };

      // 保存编辑结果到会话历史中
      try {
        await sessionManager.addToEditHistory(sessionId, editResult);
        console.log(`✅ Edit result saved to session ${sessionId}`);
      } catch (sessionError) {
        console.error('Failed to save edit result to session:', sessionError);
        // 即使保存到会话失败，也返回编辑结果
      }

      res.json({
        success: true,
        data: editResult,
        message: 'Image editing completed successfully'
      });

    } else {
      throw new Error(result.error || 'Image editing failed');
    }

  } catch (error) {
    console.error('Error in image editing endpoint:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'File too large',
        message: 'Image files must be smaller than 10MB each'
      });
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({
        success: false,
        error: 'Too many files',
        message: 'Maximum 2 images allowed'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to process image editing',
      message: error.message
    });
  }
});

// AI润色提示词端点
router.post('/polish-prompt', async (req, res) => {
  try {
    const { sessionId, originalPrompt, aspectRatio, customSystemPrompt } = req.body;

    // 验证必需字段
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    if (!originalPrompt || originalPrompt.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Original prompt is required'
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

    console.log(`Polishing prompt for session ${sessionId}`);
    console.log(`Original prompt: ${originalPrompt}`);
    console.log(`Target aspect ratio: ${aspectRatio}`);
    console.log(`Using custom system prompt: ${customSystemPrompt ? 'Yes' : 'No'}`);

    // 使用自定义系统提示词或默认提示词
    let polishSystemPrompt;
    
    if (customSystemPrompt && customSystemPrompt.trim()) {
      // 使用用户自定义的系统提示词
      polishSystemPrompt = `${customSystemPrompt}

宽高比信息: ${aspectRatio}
用户输入: "${originalPrompt}"

请根据以上要求优化提示词。`;
    } else {
      // 使用默认的硬编码系统提示词
      const aspectRatioInfo = {
        '1:1': {
          name: 'Square format',
          composition: 'center-focused, balanced compositions'
        },
        '4:3': {
          name: 'Landscape format',
          composition: 'horizon-based, scenic layouts'
        },
        '3:4': {
          name: 'Portrait format',
          composition: 'vertical emphasis, subject-focused'
        },
        '16:9': {
          name: 'Widescreen format',
          composition: 'cinematic, panoramic views'
        },
        '9:16': {
          name: 'Vertical format',
          composition: 'mobile-optimized, story format'
        }
      };

      const ratioInfo = aspectRatioInfo[aspectRatio] || { name: '标准比例', composition: 'balanced composition' };

      polishSystemPrompt = `You are a professional AI image generation prompt optimizer specializing in Gemini 2.5 Flash (Nano Banana). Your expertise is transforming simple descriptions into narrative, coherent scene descriptions that leverage the model's deep language understanding.

FUNDAMENTAL PRINCIPLE: Describe the scene, don't just list keywords. Create flowing, descriptive paragraphs that tell a story rather than disconnected words.

GEMINI TEMPLATE STRUCTURE (Template_1):
"A [style] [shot type] of [subject], [action/expression], set in [environment]. The scene is illuminated by [lighting description], creating a [mood] atmosphere. Captured with a [camera/lens details], emphasizing [key textures and details]. The image should be in a ${aspectRatio} format."

OPTIMIZATION REQUIREMENTS:
1. Transform any keyword lists into coherent narrative descriptions
2. Maintain the user's original intent while adding contextual richness
3. Use professional photography and artistic terminology
4. Apply aspect ratio-specific composition guidance: ${ratioInfo.composition}
5. Create atmospheric depth with lighting and mood descriptions
6. Include technical camera specifications for photorealistic results
7. Emphasize texture, detail, and visual storytelling elements
8. 用中文输出优化后的提示词

ASPECT RATIO: ${aspectRatio} (${ratioInfo.name})
COMPOSITION GUIDANCE: ${ratioInfo.composition}

USER INPUT: "${originalPrompt}"

Transform this input into a professional, narrative-driven prompt following Gemini's best practices. Focus on scene description and visual storytelling for ${aspectRatio} format. Return only the optimized prompt without explanations.`;
    }

    // 调用AI服务进行润色
    const result = await vertexAIService.generateText(polishSystemPrompt);

    if (result.success) {
      const polishedPrompt = result.text;

      res.json({
        success: true,
        data: {
          originalPrompt: originalPrompt,
          polishedPrompt: polishedPrompt,
          aspectRatio: aspectRatio,
          timestamp: new Date().toISOString()
        },
        message: 'Prompt polished successfully'
      });

    } else {
      throw new Error('Failed to polish prompt');
    }

  } catch (error) {
    console.error('Error in polish prompt endpoint:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to polish prompt',
      message: error.message || 'Internal server error'
    });
  }
});

module.exports = router;