const express = require('express');
const multer = require('multer');
const os = require('os');
const path = require('path');
const router = express.Router();
const vertexAIService = require('../services/vertexAI');
const sessionManager = require('../services/sessionManager');
const redis = require('redis');

// 配置multer用于处理多文件上传
const storage = multer.memoryStorage();
// 统一图片文件过滤器
const imageFileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

// 保持既有“编辑执行”端点的 2 张限制
const uploadLimited2 = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 2 },
  fileFilter: imageFileFilter,
});

// 为“智能分析编辑”移除张数限制（仅限制单张大小）
const uploadNoLimit = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

// 为“图片编辑执行”提供磁盘存储且不限制张数（仅限制单张大小）
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.UPLOAD_TMP_DIR || os.tmpdir();
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const base = (file.originalname || 'image').replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, `${Date.now()}_${base}`);
  }
});
const uploadNoLimitDisk = multer({
  storage: diskStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

// 图片编辑端点 - 支持1-2张图片上传，集成图片分析功能
router.post('/edit-images', uploadNoLimitDisk.array('images'), async (req, res) => {
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

    // 图片不是必需的；如提供，不再限制张数（单张大小已由multer限制）

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
        
        const analysisResult = await vertexAIService.analyzeImage(primaryImage.buffer, primaryImage.mimetype);
        
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
      // 检查是否是内容政策违规
      if (result.error === 'Content policy violation' || result.policyViolation) {
        return res.status(400).json({
          success: false,
          error: 'Content policy violation',
          message: result.message || '图片编辑请求被拒绝：内容不符合AI安全政策。请检查图片是否包含敏感内容，或修改编辑指令。',
          details: result.details || '模型拒绝处理此图片编辑请求，可能原因：图片内容敏感、编辑指令不当等。',
          originalResponse: result.originalError || result.error, // 添加原始回复
          policyViolation: true
        });
      }
      
      throw new Error(result.error || 'Image editing failed');
    }

  } catch (error) {
    console.error('Error in image editing endpoint:', error);
    
    // 检查是否是AI拒绝生成图片的错误
    if (error.message && error.message.includes('AI refused to generate image')) {
      return res.status(400).json({
        success: false,
        error: 'AI generation refused',
        message: 'AI模型拒绝生成此图片，可能包含敏感内容',
        details: '建议：\n• 调整提示词内容\n• 避免使用可能被视为敏感的词汇\n• 尝试更换描述方式',
        aiRefusal: true,
        originalResponse: error.message
      });
    }
    
    // 检查是否是内容政策违规错误
    if (error.message === 'Content policy violation') {
      return res.status(400).json({
        success: false,
        error: 'Content policy violation',
        message: '图片编辑请求被拒绝：内容不符合AI安全政策。请检查图片是否包含敏感内容，或修改编辑指令。',
        details: '模型拒绝处理此图片编辑请求，可能原因：图片内容敏感、编辑指令不当等。',
        policyViolation: true
      });
    }
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'File too large',
        message: 'Image files must be smaller than 10MB each'
      });
    }

    // 不再处理 LIMIT_FILE_COUNT（未设置 files 上限）
    
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
      imageAnalysis, // 新增：图片分析结果
      scenario // 新增：自定义场景
    } = req.body;

    // 验证必需字段
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    // 允许生成模板填充时 originalPrompt 为空；
    // 保持其他路径的原校验
    if ((!originalPrompt || (typeof originalPrompt !== 'string') || originalPrompt.trim() === '')
        && !(req.body && (req.body.useTemplateFiller || (req.body.promptType === 'generation' && req.body.customSystemPrompt)))) {
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
    console.log(`Custom scenario: ${scenario ? 'Yes' : 'No'}`);

    // 使用自定义系统提示词或根据类型选择默认提示词
    let polishSystemPrompt;
    
    if (customSystemPrompt && customSystemPrompt.trim()) {
      // 使用用户自定义的系统提示词
      const SYSTEM_PROMPTS = require('../config/systemPrompts');
      if (promptType === 'generation' && req.body.useTemplateFiller) {
        // 将“模板填充系统提示词”与所选模板拼接，驱动 gemini-2.5-flash-lite 产出中文提示词
        let filler = SYSTEM_PROMPTS.GENERATION_TEMPLATE_FILLER_SYSTEM || '';
        let overrideUsed = false;
        try {
          const raw = await uiRedis.get(UI_SETTINGS_KEY);
          if (raw) {
            const data = JSON.parse(raw);
            if (data && typeof data.generationTemplateFillerSystemPrompt === 'string' && data.generationTemplateFillerSystemPrompt.trim()) {
              filler = data.generationTemplateFillerSystemPrompt;
              overrideUsed = true;
            }
          }
        } catch (e) { /* ignore */ }
        console.log('[TemplateFill] building', {
          templateName: req.body.templateName || null,
          aspectRatio,
          userBriefEmpty: !originalPrompt,
          templateLen: (customSystemPrompt || '').length,
          overrideSystemPrompt: overrideUsed
        });
        polishSystemPrompt = `${filler}

TEMPLATE:
${customSystemPrompt}

ASPECT_RATIO: ${aspectRatio}
USER_BRIEF: "${originalPrompt}"
${req.body.templateName ? `\nTEMPLATE_NAME: ${req.body.templateName}` : ''}`;
      } else {
        polishSystemPrompt = `${customSystemPrompt}

宽高比信息: ${aspectRatio}`;
        if (scenario && scenario.trim()) {
          polishSystemPrompt += `
自定义场景: ${scenario.trim()}`;
        }
        // 如果有图片分析结果，添加到系统提示词中
        if (imageAnalysis && imageAnalysis.trim()) {
          polishSystemPrompt += `
图片分析结果: ${imageAnalysis}`;
        }
        polishSystemPrompt += `
用户输入: "${originalPrompt}"

请根据以上要求优化提示词。如果有图片分析结果，请将图片分析信息与用户指令融合，生成保持原图特征的专业编辑提示词。`;
      }
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
        if (scenario && scenario.trim()) {
          polishSystemPrompt += `
自定义场景: ${scenario.trim()}`;
        }
      } else {
        // 使用图片生成模块的提示词
        const aspectRatioInfo = SYSTEM_PROMPTS.ASPECT_RATIO_INFO;
        const ratioInfo = aspectRatioInfo[aspectRatio] || { name: '标准比例', composition: 'balanced composition' };

        polishSystemPrompt = SYSTEM_PROMPTS.IMAGE_GENERATION_OPTIMIZATION
          .replace('{{ASPECT_RATIO}}', `${aspectRatio} (${ratioInfo.name}) - ${ratioInfo.composition}`)
          .replace('{{USER_INPUT}}', originalPrompt);
        if (scenario && scenario.trim()) {
          polishSystemPrompt += `
自定义场景: ${scenario.trim()}`;
        }
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

// 智能分析编辑端点 - 一次调用直接生成优化编辑指令 - 支持多图
router.post('/intelligent-analysis-editing', uploadNoLimit.array('images'), async (req, res) => {
  try {
    const { sessionId, userInstruction, customSystemPrompt } = req.body;

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

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one image is required for intelligent analysis editing'
      });
    }

    // 不再限制图片张数；如需保护内存，可考虑改用磁盘存储或增加软上限

    // 验证会话存在
    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    console.log(`Processing intelligent analysis editing for session ${sessionId}`);
    console.log(`Images: ${req.files.length} file(s)`);
    req.files.forEach((file, index) => {
      console.log(`  Image ${index + 1}: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);
    });
    console.log(`User instruction: ${userInstruction}`);
    console.log(`Custom system prompt: ${customSystemPrompt ? 'Yes' : 'No'} (${customSystemPrompt ? customSystemPrompt.length : 0} chars)`);
    
    // 调用智能分析编辑服务 - 传递图片数组和自定义系统提示词
    const result = await vertexAIService.intelligentAnalysisEditing(req.files, userInstruction.trim(), customSystemPrompt);

    if (result.success) {
      res.json({
        success: true,
        data: {
          editPrompt: result.editPrompt,
          userInstruction: userInstruction.trim(),
          imageCount: req.files.length,
          processingMode: req.files.length > 1 ? 'multi-image-composition' : 'single-image-editing',
          metadata: result.metadata,
          timestamp: new Date().toISOString()
        },
        message: `Intelligent analysis editing completed successfully (${req.files.length > 1 ? 'multi-image' : 'single-image'} mode)`
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
        message: 'Image files must be smaller than 10MB each'
      });
    }

    // 取消“张数过多”的限制分支（不再返回 LIMIT_FILE_COUNT）

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No image files provided',
        message: 'Please upload at least one image file'
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
// UI settings redis for fetching generation template filler prompt
const uiRedis = redis.createClient({ url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}` });
uiRedis.connect().catch(() => {});
const UI_SETTINGS_KEY = 'ui_settings';
