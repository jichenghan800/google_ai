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

// 图片编辑端点 - 支持1-2张图片上传，集成图片分析功能
router.post('/edit-images', upload.array('images', 2), async (req, res) => {
  try {
    const { sessionId, prompt, originalPrompt, aspectRatio, width, height, enableAnalysis = 'true' } = req.body;

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
    console.log(`Analysis enabled: ${enableAnalysis}`);
    
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
          originalPrompt: originalPrompt || prompt.trim(),
          inputImages: [],
          result: result.imageUrl,
          resultType: 'image',
          createdAt: Date.now(),
          metadata: {
            ...result.metadata,
            aspectRatio: aspectRatio || '1:1',
            dimensions: `${parseInt(width) || 1024}x${parseInt(height) || 1024}`,
            analysisUsed: false
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
    
    // 处理图片编辑 - 集成分析功能
    let finalPrompt = prompt.trim();
    let analysisData = null;
    
    // 如果启用了分析功能且有图片上传
    if (enableAnalysis === 'true' && req.files && req.files.length > 0) {
      console.log('🔍 Starting image analysis workflow...');
      
      try {
        // 分析第一张图片（主要图片）
        const primaryImage = req.files[0];
        console.log(`Analyzing primary image: ${primaryImage.originalname}`);
        
        const analysisResult = await vertexAIService.analyzeImage(primaryImage);
        
        if (analysisResult.success) {
          console.log('✅ Image analysis completed successfully');
          analysisData = analysisResult;
          
          // 融合分析结果和用户指令生成优化的编辑prompt
          console.log('🔄 Generating optimized edit prompt...');
          const promptResult = await vertexAIService.generateEditPrompt(
            analysisResult.analysis,
            prompt.trim()
          );
          
          if (promptResult.success) {
            finalPrompt = promptResult.editPrompt;
            console.log('✅ Edit prompt optimization completed');
            console.log(`Final prompt length: ${finalPrompt.length} characters`);
          } else {
            console.warn('⚠️ Edit prompt generation failed, using original prompt:', promptResult.error);
            // 继续使用原始prompt，不阻断流程
          }
        } else {
          console.warn('⚠️ Image analysis failed, falling back to system prompt optimization:', analysisResult.error);
          
          // 分析失败时，使用系统提示词优化用户输入
          console.log('🔄 Falling back to system prompt optimization...');
          try {
            const SYSTEM_PROMPTS = require('../config/systemPrompts');
            const fallbackPrompt = `你是一位专业的AI图片编辑提示词优化专家，擅长为Gemini 2.5 Flash Image Preview生成精确的图片编辑指令。

请基于图片编辑最佳实践，优化用户的编辑指令，使其更加精确和专业。

## 优化重点
1. **明确编辑指令**：清晰指定要添加/删除/修改的具体元素
2. **保持一致性**：强调保留原图的重要特征和风格
3. **局部编辑**：专注于指定区域的修改，避免影响其他部分
4. **自然融合**：确保新增或修改的元素与原图环境协调
5. **技术精度**：使用专业的编辑术语和指导

**用户输入：** "${prompt.trim()}"

请优化这个编辑指令，使其更加专业和精确。只返回优化后的提示词，用中文输出。`;

            const fallbackResult = await vertexAIService.generateText(fallbackPrompt);
            
            if (fallbackResult.success) {
              finalPrompt = fallbackResult.text;
              console.log('✅ Fallback system prompt optimization completed');
              console.log(`Fallback prompt length: ${finalPrompt.length} characters`);
            } else {
              console.warn('⚠️ Fallback optimization also failed, using original prompt');
              // 最终降级使用原始prompt
            }
          } catch (fallbackError) {
            console.error('❌ Fallback optimization error:', fallbackError);
            // 最终降级使用原始prompt
          }
        }
      } catch (analysisError) {
        console.error('❌ Analysis workflow error:', analysisError);
        
        // catch块中也使用降级优化
        console.log('🔄 Analysis failed completely, applying fallback system prompt optimization...');
        try {
          const fallbackPrompt = `你是一位专业的AI图片编辑提示词优化专家，擅长为Gemini 2.5 Flash Image Preview生成精确的图片编辑指令。

请基于图片编辑最佳实践，优化用户的编辑指令，使其更加精确和专业。

## 优化重点
1. **明确编辑指令**：清晰指定要添加/删除/修改的具体元素
2. **保持一致性**：强调保留原图的重要特征和风格
3. **局部编辑**：专注于指定区域的修改，避免影响其他部分
4. **自然融合**：确保新增或修改的元素与原图环境协调
5. **技术精度**：使用专业的编辑术语和指导

**用户输入：** "${prompt.trim()}"

请优化这个编辑指令，使其更加专业和精确。只返回优化后的提示词，用中文输出。`;

          const fallbackResult = await vertexAIService.generateText(fallbackPrompt);
          
          if (fallbackResult.success) {
            finalPrompt = fallbackResult.text;
            console.log('✅ Emergency fallback optimization completed');
            console.log(`Emergency fallback prompt length: ${finalPrompt.length} characters`);
          } else {
            console.warn('⚠️ All optimization attempts failed, using original prompt');
          }
        } catch (emergencyError) {
          console.error('❌ Emergency fallback also failed:', emergencyError);
          // 最终使用原始prompt
        }
      }
    } else {
      console.log('📝 Skipping analysis, using direct editing approach');
    }
    
    // 调用图片编辑服务
    console.log('🎨 Starting image editing with final prompt...');
    const result = await vertexAIService.editImages(req.files, finalPrompt);

    if (result.success) {
      // 创建编辑结果对象
      const editResult = {
        id: require('uuid').v4(),
        sessionId: sessionId,
        prompt: prompt.trim(),
        finalPrompt: finalPrompt, // 保存最终使用的prompt
        originalPrompt: originalPrompt || prompt.trim(),
        inputImages: (req.files || []).map(file => ({
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          dataUrl: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
        })),
        result: result.result,
        resultType: result.resultType,
        createdAt: Date.now(),
        metadata: {
          ...result.metadata,
          analysisUsed: enableAnalysis === 'true' && analysisData !== null,
          analysisData: analysisData ? {
            success: analysisData.success,
            analysisLength: analysisData.metadata?.analysisLength || 0,
            model: analysisData.metadata?.model || 'unknown'
          } : null,
          promptOptimization: finalPrompt !== prompt.trim() ? {
            originalLength: prompt.trim().length,
            optimizedLength: finalPrompt.length,
            improvementRatio: (finalPrompt.length / prompt.trim().length).toFixed(2)
          } : null
        }
      };

      // 保存编辑结果到会话历史中
      try {
        await sessionManager.addToEditHistory(sessionId, editResult);
        console.log(`✅ Edit result saved to session ${sessionId}`);
      } catch (sessionError) {
        console.error('Failed to save edit result to session:', sessionError);
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

// AI润色提示词端点 - 支持不同模块的专用提示词和图片分析
router.post('/polish-prompt', async (req, res) => {
  try {
    const { 
      sessionId, 
      originalPrompt, 
      aspectRatio, 
      customSystemPrompt, 
      promptType = 'generation',
      imageAnalysis // 新增：图片分析结果
    } = req.body;

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
    console.log(`Prompt type: ${promptType}`);
    console.log(`Using custom system prompt: ${customSystemPrompt ? 'Yes' : 'No'}`);
    console.log(`Image analysis available: ${imageAnalysis ? 'Yes' : 'No'}`);

    // 使用自定义系统提示词或根据类型选择默认提示词
    let polishSystemPrompt;
    
    if (customSystemPrompt && customSystemPrompt.trim()) {
      // 使用用户自定义的系统提示词
      polishSystemPrompt = `${customSystemPrompt}

宽高比信息: ${aspectRatio}`;
      
      // 如果有图片分析结果，添加到系统提示词中
      if (imageAnalysis && imageAnalysis.trim()) {
        polishSystemPrompt += `
图片分析结果: ${imageAnalysis}`;
      }
      
      polishSystemPrompt += `
用户输入: "${originalPrompt}"

请根据以上要求优化提示词。如果有图片分析结果，请将图片分析信息与用户指令融合，生成保持原图特征的专业编辑提示词。`;
    } else {
      // 导入系统提示词配置
      const SYSTEM_PROMPTS = require('../config/systemPrompts');
      
      if (promptType === 'editing') {
        // 使用编辑模块的提示词，支持图片分析结果
        polishSystemPrompt = `你是一位专业的AI图片编辑提示词优化专家，擅长为Gemini 2.5 Flash Image Preview生成精确的图片编辑指令。

请基于图片编辑最佳实践，优化用户的编辑指令，使其更加精确和专业。

## 优化重点
1. **明确编辑指令**：清晰指定要添加/删除/修改的具体元素
2. **保持一致性**：强调保留原图的重要特征和风格
3. **局部编辑**：专注于指定区域的修改，避免影响其他部分
4. **自然融合**：确保新增或修改的元素与原图环境协调
5. **技术精度**：使用专业的编辑术语和指导

**用户输入：** "${originalPrompt}"
**目标格式：** ${aspectRatio}`;

        // 如果有图片分析结果，添加到系统提示词中
        if (imageAnalysis && imageAnalysis.trim()) {
          polishSystemPrompt += `
**原图分析结果：** ${imageAnalysis}

请结合原图分析结果和用户编辑指令，生成保持原图重要特征的专业编辑提示词。确保编辑后的图片与原图风格、光照、构图保持一致。`;
        }

        polishSystemPrompt += `

请优化这个编辑指令，使其更加专业和精确。只返回优化后的提示词，用中文输出。`;
      } else {
        // 使用图片生成模块的提示词
        const aspectRatioInfo = SYSTEM_PROMPTS.ASPECT_RATIO_INFO;
        const ratioInfo = aspectRatioInfo[aspectRatio] || { name: '标准比例', composition: 'balanced composition' };

        polishSystemPrompt = SYSTEM_PROMPTS.IMAGE_GENERATION_OPTIMIZATION
          .replace('{{ASPECT_RATIO}}', `${aspectRatio} (${ratioInfo.name}) - ${ratioInfo.composition}`)
          .replace('{{USER_INPUT}}', originalPrompt);
      }
    }

    console.log('🔧 Polish System Prompt 构建完成:');
    console.log(`长度: ${polishSystemPrompt.length} 字符`);
    console.log(`包含图片分析: ${imageAnalysis ? 'Yes' : 'No'}`);
    if (imageAnalysis) {
      console.log(`分析结果长度: ${imageAnalysis.length} 字符`);
    }
    
    // 调用AI服务进行润色
    console.log('📤 发送到 Flash 2.5 Lite 进行提示词优化...');
    const result = await vertexAIService.generateText(polishSystemPrompt);

    if (result.success) {
      const polishedPrompt = result.text;
      console.log('✅ 提示词优化完成:');
      console.log(`原提示词长度: ${originalPrompt.length} 字符`);
      console.log(`优化后长度: ${polishedPrompt.length} 字符`);

      res.json({
        success: true,
        data: {
          originalPrompt: originalPrompt,
          polishedPrompt: polishedPrompt,
          aspectRatio: aspectRatio,
          promptType: promptType,
          customSystemPrompt: !!customSystemPrompt,
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

// 智能分析编辑端点 - 一次调用直接生成优化编辑指令
router.post('/intelligent-analysis-editing', upload.single('image'), async (req, res) => {
  try {
    const { sessionId, userInstruction } = req.body;

    // 验证必需字段
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    if (!userInstruction || userInstruction.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'User instruction is required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Image is required for intelligent analysis editing'
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

    console.log(`Processing intelligent analysis editing for session ${sessionId}`);
    console.log(`Image: ${req.file.originalname} (${req.file.mimetype}, ${req.file.size} bytes)`);
    console.log(`User instruction: ${userInstruction}`);
    
    // 调用智能分析编辑服务
    const result = await vertexAIService.intelligentAnalysisEditing(req.file, userInstruction.trim());

    if (result.success) {
      res.json({
        success: true,
        data: {
          editPrompt: result.editPrompt,
          userInstruction: userInstruction.trim(),
          metadata: result.metadata,
          timestamp: new Date().toISOString()
        },
        message: 'Intelligent analysis editing completed successfully'
      });

    } else {
      throw new Error(result.error || 'Intelligent analysis editing failed');
    }

  } catch (error) {
    console.error('Error in intelligent analysis editing endpoint:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'File too large',
        message: 'Image file must be smaller than 10MB'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided',
        message: 'Please upload an image file'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to process intelligent analysis editing',
      message: error.message
    });
  }
});

module.exports = router;