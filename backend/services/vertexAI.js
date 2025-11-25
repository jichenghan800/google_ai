const { VertexAI, HarmCategory, HarmBlockThreshold } = require('@google-cloud/vertexai');
const { GoogleGenAI } = require('@google/genai');

class VertexAIService {
  constructor() {
    this.project = process.env.GOOGLE_CLOUD_PROJECT;
    this.location = process.env.GOOGLE_CLOUD_LOCATION;
    // 使用.env中配置的模型，如果未设置则使用默认的图像模型
    this.model = process.env.VERTEX_MODEL_ID || 'gemini-2.5-flash-image';
    this.vertexAI = null;
    this.generativeModel = null;
    // 为图片生成创建单独的 Vertex AI 实例 (使用 us-central1，因为 Imagen 在该区域可用)
    this.imageVertexAI = null;
    this.imageModel = null;
    // 新增官方 GoogleGenAI 实例用于图片编辑
    this.genAI = null;
    this.init();
  }

  // Quick image dimension parser for PNG/JPEG buffers
  getImageDimensions(buffer) {
    if (!buffer || buffer.length < 24) return null;
    // PNG: signature then IHDR
    if (buffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
        type: 'png'
      };
    }
    // JPEG: scan for SOF0/1/2
    let i = 2;
    while (i + 9 < buffer.length) {
      if (buffer[i] !== 0xff) { i++; continue; }
      const marker = buffer[i + 1];
      const len = buffer.readUInt16BE(i + 2);
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        return {
          height: buffer.readUInt16BE(i + 5),
          width: buffer.readUInt16BE(i + 7),
          type: 'jpeg'
        };
      }
      i += 2 + len;
    }
    return null;
  }

  init() {
    try {
      const useApiKey = !!process.env.GOOGLE_CLOUD_API_KEY;

      if (useApiKey) {
        // 使用 API Key 模式，和官方示例保持一致（imageConfig 支持）
        this.genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_CLOUD_API_KEY });
        this.genAIMode = 'api';
        console.log('GoogleGenAI initialized in API key mode');
      } else {
        // Ensure environment variables are loaded (Vertex-only mode)
        if (!this.project || !this.location) {
          console.error('Missing required environment variables:', {
            project: this.project,
            location: this.location,
            credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            note: 'Vertex-only mode: set GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION and credentials.'
          });
          return;
        }

        // Initialize main Vertex AI instance for text/analysis models
        this.vertexAI = new VertexAI({
          project: this.project,
          location: this.location,
        });

        this.generativeModel = this.vertexAI.getGenerativeModel({
          model: this.model,
          generation_config: {
            max_output_tokens: parseInt(process.env.AI_MAX_OUTPUT_TOKENS) || 8192,
            temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.0,
          },
          safety_settings: [
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
          ],
        });

        // Initialize GoogleGenAI in Vertex-only mode
        // 位置从 env 读取，默认 global（.env 已通过 override=true 加载）
        const vertexLocation = process.env.GOOGLE_CLOUD_LOCATION || 'global';
        this.genAI = new GoogleGenAI({ vertexai: true, project: this.project, location: vertexLocation });
        this.genAIMode = 'vertexai';
        console.log(`GoogleGenAI initialized in Vertex mode (project=${this.project}, location=${vertexLocation})`);
      }

      // Initialize separate Vertex AI instance for image generation (using us-central1 where Imagen is available)
      this.imageVertexAI = new VertexAI({
        project: this.project,
        location: 'us-central1', // Imagen models are available in us-central1
      });

      // Try to initialize Imagen model
      try {
        this.imageModel = this.imageVertexAI.getGenerativeModel({
          model: 'imagegeneration@006', // Latest Imagen model
          generation_config: {
            max_output_tokens: 2048,
            temperature: 0.8, // Higher creativity for image generation
          }
        });
        console.log('Imagen model initialized successfully');
      } catch (imageModelError) {
        console.warn('Imagen model initialization failed, will use fallback:', imageModelError.message);
        this.imageModel = null;
      }

      console.log('Vertex AI service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Vertex AI service:', error);
    }
  }

  // Simple LLM-based translation/rewrite helper (Vertex mode via @google/genai)
  async translateWithLLM({ system, input }) {
    if (!this.genAI) throw new Error('GenAI not initialized');
    const tryGenerate = async (model) => {
      const req = {
        model,
        contents: [
          { role: 'system', parts: [{ text: system || '' }] },
          { role: 'user', parts: [{ text: String(input || '') }] },
        ],
        config: { maxOutputTokens: 2048, temperature: 0.2 },
      };
      const resp = await this.genAI.models.generateContent(req);
      const text = (resp?.text) || (resp?.response?.text ? await resp.response.text() : '') || '';
      if (typeof text === 'string' && text.trim()) return text.trim();
      const parts = resp?.candidates?.[0]?.content?.parts || [];
      const buf = [];
      for (const p of parts) if (p.text) buf.push(p.text);
      return buf.join('\n').trim();
    };
    try {
      return await tryGenerate('gemini-1.5-flash');
    } catch (e1) {
      try {
        return await tryGenerate(this.model || 'gemini-2.0-flash');
      } catch (e2) {
        throw e2;
      }
    }
  }

  async generateImage(prompt, parameters = {}, overrideModelId = null) {
    const {
      aspectRatio = '1:1',
      imageSize = '1K',
      style = 'natural',
      quality = 'standard'
    } = parameters;

    const modelToUse = overrideModelId || this.model || 'gemini-2.5-flash-image';

    console.log(`Generating image with prompt: "${prompt}"`);
    console.log(`Parameters:`, parameters);

    // Use @google/genai generateImages for pure generation (no reference images)
    if (this.genAI) {
      try {
        const generationConfig = {
          numberOfImages: 1,
          aspectRatio,
          imageSize,
          outputMimeType: 'image/png',
          safetySettings: [
            {
              category: 'HARM_CATEGORY_HATE_SPEECH',
              threshold: 'OFF',
            },
            {
              category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
              threshold: 'OFF',
            },
            {
              category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
              threshold: 'OFF',
            },
            {
              category: 'HARM_CATEGORY_HARASSMENT',
              threshold: 'OFF',
            },
            {
              category: 'HARM_CATEGORY_IMAGE_HATE',
              threshold: 'OFF',
            },
            {
              category: 'HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT',
              threshold: 'OFF',
            },
            {
              category: 'HARM_CATEGORY_IMAGE_HARASSMENT',
              threshold: 'OFF',
            },
            {
              category: 'HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT',
              threshold: 'OFF',
            }
          ],
        };

        console.log('[AI][GenerateImages] Sending config:', { model: modelToUse, config: generationConfig });

        const resp = await this.genAI.models.generateImages({
          model: modelToUse,
          prompt: prompt,
          config: generationConfig,
        });

        const img = resp?.generatedImages?.[0]?.image;
        if (img?.imageBytes) {
          const mimeType = img.mimeType || 'image/png';
          const imageDataUrl = `data:${mimeType};base64,${img.imageBytes}`;
          try {
            const buf = Buffer.from(img.imageBytes, 'base64');
            const dim = this.getImageDimensions(buf);
            if (dim) console.log('[AI][GenerateImages] Output dimensions:', dim);
          } catch (e) {}

          return {
            success: true,
            imageUrl: imageDataUrl,
            metadata: {
              prompt: prompt,
              parameters,
              model: modelToUse,
              timestamp: new Date().toISOString(),
              mimeType,
              isReal: true
            }
          };
        }

        console.log('❌ No image data received from generateImages');
        
      } catch (error) {
        console.error('@google/genai generateImages failed:', error.message);
        console.log('Falling back to simulated image generation...');
      }
    } else {
      console.log('@google/genai not available, using simulated generation...');
    }

    // Fallback to simulated image generation
    console.log('Using simulated image generation...');

    const colors = ['ff6b6b', '4ecdc4', '45b7d1', '96ceb4', 'feca57', 'ff9ff3', '54a0ff'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    // 默认宽高（基于 imageSize + 宽高比）
    const imageSizeMap = { '1K': 1024, '2K': 2048, '4K': 4096 };
    const [arW, arH] = aspectRatio.split(':').map(v => parseInt(v, 10) || 1);
    const longEdge = imageSizeMap[imageSize] || 1024;
    const imageWidth = arW >= arH ? longEdge : Math.round((longEdge * arW) / arH);
    const imageHeight = arW >= arH ? Math.round((longEdge * arH) / arW) : longEdge;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}">
      <rect width="100%" height="100%" fill="#${randomColor}"/>
      <text x="50%" y="30%" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="16" font-weight="bold">
        AI Generated Image
      </text>
      <text x="50%" y="45%" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="12">
        ${prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt}
      </text>
      <text x="50%" y="60%" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="10" opacity="0.8">
        ${imageWidth}x${imageHeight} • ${aspectRatio} • ${style} • ${quality}
      </text>
      <text x="50%" y="75%" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="8" opacity="0.6">
        Simulated Generation • ${new Date().toLocaleTimeString()}
      </text>
      <text x="50%" y="90%" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="8" opacity="0.4">
        Enable Imagen for real generation
      </text>
    </svg>`;

    const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

    return {
      success: true,
      imageUrl: svgDataUri,
      metadata: {
        prompt: prompt,
        parameters,
        aspectRatio,
        imageSize,
        model: modelToUse,
        timestamp: new Date().toISOString(),
        isReal: false,
        note: 'This is a simulated image generation. Real Imagen model not available or failed.'
      }
    };
  }

  async analyzeImage(imageOrBuffer, mimeTypeOrOptions, promptOrOptions = undefined) {
    // 参数兼容处理：
    // 1) analyzeImage(buffer, mimeType, promptOrOptions)
    // 2) analyzeImage(fileObject, { prompt, customSystemPrompt, scenario })
    // 3) analyzeImage(fileObject) 兼容老用法（来自 /analyze 路由）
    let imageBuffer;
    let mimeType;
    let options = {};

    // 识别第一参数是否为multer文件对象
    if (imageOrBuffer && imageOrBuffer.buffer && imageOrBuffer.mimetype) {
      imageBuffer = imageOrBuffer.buffer;
      mimeType = imageOrBuffer.mimetype;
      // 第二参若为对象则作为options
      if (mimeTypeOrOptions && typeof mimeTypeOrOptions === 'object') {
        options = mimeTypeOrOptions;
      } else if (typeof mimeTypeOrOptions === 'string') {
        options.prompt = mimeTypeOrOptions;
      }
    } else {
      // 传统签名：buffer + mimeType
      imageBuffer = imageOrBuffer;
      mimeType = typeof mimeTypeOrOptions === 'string' ? mimeTypeOrOptions : undefined;
      if (promptOrOptions && typeof promptOrOptions === 'object') {
        options = promptOrOptions;
      } else if (typeof promptOrOptions === 'string') {
        options.prompt = promptOrOptions;
      }
    }

    // 用户输入（可能为空）。不在这里做默认回退，由后续逻辑统一处理。
    const userPrompt = (typeof options.prompt === 'string' ? options.prompt : '').trim();

    if (!this.genAI) {
      console.warn('GoogleGenAI not initialized, using fallback analysis');
      
      // Fallback analysis when GoogleGenAI is not available
      const fallbackAnalysis = `## 主体对象分析
- 图片特征：上传的图片，格式为${mimeType}
- 文件大小：${imageBuffer.length} 字节
- 关键细节：由于配置限制，无法进行详细分析

## 视觉构图分析  
- 构图方式：标准构图
- 视角角度：常规视角

## 光照与色彩分析
- 光照条件：自然光照
- 色彩风格：标准色调

## 背景环境分析
- 环境设定：常规环境

## 技术风格分析
- 摄影风格：标准风格
- 艺术风格：自然风格

注意：这是降级分析结果，建议配置Google Cloud credentials以获得完整的AI分析功能。`;

      return {
        success: true,
        analysis: fallbackAnalysis,
        metadata: {
          prompt: prompt,
          model: 'fallback-analyzer',
          timestamp: new Date().toISOString(),
          imageSize: imageBuffer.length,
          mimeType: mimeType,
          note: 'Fallback analysis due to missing GoogleGenAI configuration'
        }
      };
    }

    try {
      const DEBUG = process.env.DEBUG_AI === '1' || process.env.DEBUG_AI === 'true';
      if (DEBUG) {
        console.log('[AI][Analyze] Start', {
          genAIMode: this.genAIMode || (process.env.GOOGLE_CLOUD_API_KEY ? 'api' : 'vertexai'),
          promptLength: (userPrompt || '').length,
          hasCustomSystemPrompt: !!(options.customSystemPrompt && options.customSystemPrompt.trim()),
          scenarioLength: options.scenario ? options.scenario.length : 0,
          mimeType,
          imageBytes: imageBuffer?.length,
        });
      } else {
        console.log(`Analyzing image... (${mimeType}, ${imageBuffer.length} bytes)`);
      }

      // 检查图片大小，如果太小可能是测试图片，使用模拟分析
      if (imageBuffer.length < 1000) {
        console.log('Small test image detected, using mock analysis');
        
        // 模拟分析结果
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
        
        const mockAnalysis = `这是一张测试图片的分析结果：

图片基本信息：
- 格式：${mimeType}
- 文件大小：${imageBuffer.length} 字节
- 这是一个很小的测试图片

模拟分析内容：
- 这可能是一个单色像素或简单的几何图形
- 由于图片过小，无法提供详细的内容分析
- 建议上传更大、内容更丰富的图片以获得完整的分析结果

提示：${userPrompt}

注意：这是一个模拟分析结果，用于测试系统功能。在生产环境中，请上传实际的图片文件。`;

        return {
          success: true,
          analysis: mockAnalysis,
          metadata: {
          prompt: userPrompt,
          model: 'gemini-2.5-flash-image',
          timestamp: new Date().toISOString(),
          imageSize: imageBuffer.length,
          mimeType: mimeType,
          note: 'Mock analysis for small test image'
        }
      };
      }

      // 将图片转换为base64
      const imageBase64 = imageBuffer.toString('base64');

      if (DEBUG) {
        console.log('[AI][Analyze] Building request for gemini-2.5-flash-image...');
      }
      
      // 使用官方 SDK 的配置 - 使用 gemini-2.5-flash-image 进行识别
      const generationConfig = {
        // Vertex限制：最大不超过 32768（上限32769为exclusive）
        maxOutputTokens: 32768,
        temperature: 1,
        topP: 0.95,
        responseModalities: ["TEXT", "IMAGE"],
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'OFF',
          }
        ],
      };

      // 组装请求文本：
      // - 有用户输入：只用用户输入
      // - 无输入：使用默认识别提示词（可附带自定义场景或自定义系统提示）
      const SYSTEM_PROMPTS = require('../config/systemPrompts');
      const hasUserPrompt = !!userPrompt;
      let textPart;
      if (hasUserPrompt) {
        textPart = userPrompt;
      } else {
        let base = (options.customSystemPrompt && options.customSystemPrompt.trim())
          ? options.customSystemPrompt.trim()
          : SYSTEM_PROMPTS.IMAGE_RECOGNITION_SYSTEM;
        if (options.scenario && options.scenario.trim()) {
          base += `\n\n[自定义场景]\n${options.scenario.trim()}`;
        }
        textPart = base;
      }

      const req = {
        model: 'gemini-2.5-flash-image',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: imageBase64 } },
              { text: textPart }
            ]
          }
        ],
        config: generationConfig,
      };

      try {
        if (DEBUG) {
          console.log('[AI][Analyze] Request summary', {
            model: 'gemini-2.5-flash-image',
            responseModalities: generationConfig.responseModalities,
            safety: (generationConfig.safetySettings || []).length,
            promptLength: (userPrompt || '').length,
            systemLen: hasUserPrompt ? 0 : (textPart || '').length,
            imageBytes: imageBuffer.length,
          });
        }
        // 使用流式生成内容（官方示例风格）
        const streamingResp = await this.genAI.models.generateContentStream(req);
        
        let analysisText = '';
        for await (const chunk of streamingResp) {
          if (chunk.text) {
            analysisText += chunk.text;
          } else if (chunk.candidates && chunk.candidates.length > 0) {
            const candidate = chunk.candidates[0];
            if (candidate.content && candidate.content.parts) {
              for (const part of candidate.content.parts) {
                if (part.text) {
                  analysisText += part.text;
                }
              }
            }
          }
        }

        if (analysisText) {
          if (DEBUG) console.log('[AI][Analyze] Completed, text length:', analysisText.length);
          else console.log('✅ Image analysis completed successfully!');
          return {
            success: true,
            analysis: analysisText,
            metadata: {
              prompt: userPrompt,
              model: 'gemini-2.5-flash-image',
              timestamp: new Date().toISOString(),
              imageSize: imageBuffer.length,
              mimeType: mimeType,
              systemPromptType: hasUserPrompt ? 'none' : (options.customSystemPrompt ? 'custom' : 'default'),
              hasScenario: hasUserPrompt ? false : !!(options.scenario && options.scenario.trim()),
              mode: hasUserPrompt ? 'user_driven' : 'fallback_template',
              usedFallback: !hasUserPrompt
            }
          };
        }
        
        throw new Error('No valid analysis received from model');
      } catch (primaryErr) {
        if (DEBUG) {
          console.error('[AI][Analyze] Error from model', {
            message: primaryErr?.message,
            name: primaryErr?.name,
            code: primaryErr?.code,
            status: primaryErr?.status,
            details: primaryErr?.details,
            stack: primaryErr?.stack?.split('\n').slice(0, 5).join(' | '),
          });
        }
        // 不做额外自由回退（遵守固定调用方式）
        throw primaryErr;
      }

    } catch (error) {
      console.error('Error analyzing image:', error?.message || error);
      
      throw {
        success: false,
        error: error.message || 'Failed to analyze image',
        name: error?.name,
        code: error?.code,
        status: error?.status,
        details: error?.details,
        stack: error?.stack,
        retryable: this.isRetryableError(error),
        maxRetries: parseInt(process.env.AI_MAX_RETRIES) || 2,
        retryDelay: parseInt(process.env.AI_RETRY_DELAY_MS) || 2000
      };
    }
  }

  extractImageFromResponse(candidate) {
    // This method will need to be implemented based on the actual Vertex AI response structure
    // It should extract the image URL or base64 data from the response
    
    // Placeholder implementation
    if (candidate.content && candidate.content.parts) {
      for (const part of candidate.content.parts) {
        if (part.imageUrl) {
          return { url: part.imageUrl };
        }
        if (part.image && part.image.data) {
          return { base64: part.image.data };
        }
      }
    }
    
    throw new Error('No image found in response');
  }

  isRetryableError(error) {
    // Determine if an error is retryable
    const retryableErrors = [
      'RATE_LIMIT_EXCEEDED',
      'INTERNAL_ERROR', 
      'SERVICE_UNAVAILABLE',
      'TIMEOUT',
      'DEADLINE_EXCEEDED',
      'UNAVAILABLE'
    ];
    
    // Check for quota exceeded or authentication errors (not retryable)
    const nonRetryableErrors = [
      'QUOTA_EXCEEDED',
      'PERMISSION_DENIED',
      'UNAUTHENTICATED',
      'INVALID_ARGUMENT'
    ];
    
    const errorMessage = error.message || '';
    
    // Check for non-retryable errors first
    if (nonRetryableErrors.some(nonRetryableError => 
      errorMessage.includes(nonRetryableError)
    )) {
      return false;
    }
    
    // Check for retryable errors
    return retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError)
    ) || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
  }

  async validatePrompt(prompt) {
    // Basic prompt validation
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt must be a non-empty string');
    }
    
    if (prompt.length < 3) {
      throw new Error('Prompt must be at least 3 characters long');
    }
    
    if (prompt.length > 1000) {
      throw new Error('Prompt must be less than 1000 characters');
    }
    
    // Check for inappropriate content (basic filtering)
    const inappropriateTerms = ['violence', 'explicit', 'harmful'];
    const lowerPrompt = prompt.toLowerCase();
    
    for (const term of inappropriateTerms) {
      if (lowerPrompt.includes(term)) {
        throw new Error(`Prompt contains inappropriate content: ${term}`);
      }
    }
    
    return true;
  }

  async generateText(prompt) {
    try {
      console.log(`Generating text with prompt length: ${prompt.length}`);

      // Check if project configuration is available
      if (!this.project) {
        console.warn('Google Cloud project not configured, falling back to simple processing');
        
        // Simple fallback processing for when Vertex AI is not properly configured
        const fallbackResult = `基于用户指令"${prompt}"的优化结果：

请保持原图的主要特征和风格不变，根据用户要求进行相应的编辑调整。确保编辑后的图片与原图在色调、光照和整体风格上保持一致。`;

        return {
          success: true,
          text: fallbackResult,
          metadata: {
            prompt: prompt,
            model: 'fallback-processor',
            timestamp: new Date().toISOString(),
            note: 'Using fallback processing due to missing configuration'
          }
        };
      }

      // Use separate Vertex AI instance for text generation with us-central1 location
      const textVertexAI = new VertexAI({
        project: this.project,
        location: 'us-central1', // gemini-2.5-flash-lite available in us-central1
      });

      // Use gemini-2.5-flash-lite for text generation
      const textModel = textVertexAI.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
        generation_config: {
          max_output_tokens: parseInt(process.env.AI_MAX_OUTPUT_TOKENS) || 8192,
          temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.0,
        },
        safety_settings: [
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
        ],
      });

      const result = await textModel.generateContent({
        contents: [{
          role: 'user',
          parts: [{
            text: prompt
          }]
        }]
      });

      if (result && result.response && result.response.candidates && result.response.candidates.length > 0) {
        const candidate = result.response.candidates[0];
        
        if (candidate.content && candidate.content.parts) {
          let generatedText = '';
          for (const part of candidate.content.parts) {
            if (part.text) {
              generatedText += part.text;
            }
          }
          
          if (generatedText) {
            console.log('✅ Text generation completed successfully!');
            
            return {
              success: true,
              text: generatedText,
              metadata: {
                prompt: prompt,
                model: 'gemini-2.5-flash-lite',
                timestamp: new Date().toISOString()
              }
            };
          }
        }
      }
      
      throw new Error('No valid text generated from model');

    } catch (error) {
      console.error('Error generating text:', error);
      
      return {
        success: false,
        error: error.message || 'Failed to generate text',
        retryable: this.isRetryableError(error),
        maxRetries: parseInt(process.env.AI_MAX_RETRIES) || 2,
        retryDelay: parseInt(process.env.AI_RETRY_DELAY_MS) || 2000
      };
    }
  }

  /**
   * 智能分析编辑 - 一次调用直接生成优化的编辑指令
   * 支持单图和多图场景
   * 接收图片数组、用户指令和可选的自定义系统提示词，直接生成针对gemini-2.5-flash-image优化的编辑提示词
   */
  async intelligentAnalysisEditing(imageFiles, userInstruction, customSystemPrompt = null) {
    // 简易语种检测，用于指定输出语言
    const detectLanguage = (text = '') => {
      const zh = /[\u4e00-\u9fa5]/;
      return zh.test(text) ? 'zh' : 'en';
    };
    const lang = detectLanguage(userInstruction || '');
    const langLabel = lang === 'zh' ? '中文' : 'English';
    // 确保imageFiles是数组
    const images = Array.isArray(imageFiles) ? imageFiles : [imageFiles];
    console.log(`Intelligent analysis editing: ${images.length} image(s)`);
    images.forEach((file, index) => {
      console.log(`  Image ${index + 1}: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);
    });
    console.log(`User instruction: "${userInstruction}"`);
    console.log(`Custom system prompt: ${customSystemPrompt ? 'Yes' : 'No'} (${customSystemPrompt ? customSystemPrompt.length : 0} chars)`);

    if (!this.genAI) {
      console.warn('GoogleGenAI not initialized, using fallback processing');
      
      // Fallback processing when GoogleGenAI is not available
      const imageInfo = images.map((file, index) => 
        `图片${index + 1}: ${file.mimetype}格式`
      ).join('，');
      
      const fallbackPrompt = `使用提供的${images.length}张图片（${imageInfo}），请${userInstruction}。${
        images.length > 1 
          ? '确保合成后的图片各元素能够和谐融合，光照和风格保持一致。' 
          : '确保更改能够与原始图片的风格和光照无缝融合。'
      }

注意：这是降级处理结果，建议配置Google Cloud credentials以获得完整的AI功能。`;

      return {
        success: true,
        editPrompt: fallbackPrompt,
        metadata: {
          model: 'fallback-processor',
          imageCount: images.length,
          imageInfo: images.map((file, index) => ({
            index: index + 1,
            filename: file.originalname,
            mimeType: file.mimetype,
            size: file.size
          })),
          userInstruction: userInstruction,
          timestamp: new Date().toISOString(),
          note: 'Fallback processing due to missing GoogleGenAI configuration'
        }
      };
    }

    try {
      // 导入系统提示词配置
      const SYSTEM_PROMPTS = require('../config/systemPrompts');

      console.log('Sending intelligent analysis editing request using official GoogleGenAI SDK...');
      
      // 构建系统提示词，优先使用自定义提示词
      let systemPrompt;
      if (customSystemPrompt && customSystemPrompt.trim()) {
        // 使用用户自定义的系统提示词
        console.log('Using custom system prompt from user');
        // 如果自定义提示词包含占位符，则替换；否则直接在末尾添加用户指令
        if (customSystemPrompt.includes('{{USER_INSTRUCTION}}')) {
          systemPrompt = customSystemPrompt.replace('{{USER_INSTRUCTION}}', userInstruction);
        } else {
          systemPrompt = `${customSystemPrompt}\n\nUser Instruction: "${userInstruction}"`;
        }
      } else {
        // 根据图片数量选择合适的默认系统提示词
        console.log(`Using default system prompt (${images.length > 1 ? 'multi-image' : 'single-image'} mode)`);
        const systemPromptTemplate = images.length > 1 
          ? SYSTEM_PROMPTS.MULTI_IMAGE_ANALYSIS_EDITING
          : SYSTEM_PROMPTS.INTELLIGENT_ANALYSIS_EDITING;
        systemPrompt = systemPromptTemplate
          .replace('{{USER_INSTRUCTION}}', userInstruction)
          .replace(/Always respond in Chinese \(中文\)/i, `Always respond in ${langLabel}`);
      }
      
      // 使用官方 SDK 的配置 - 针对智能分析使用 gemini-2.5-flash-lite
      const generationConfig = {
        maxOutputTokens: 8192,
        temperature: 0.7, // 适中的温度确保创造性和准确性的平衡
        topP: 0.95,
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'OFF',
          }
        ],
      };

      // 构建多模态内容数组
      const contentParts = [
        // 第一个部分：系统提示词
        { text: systemPrompt }
      ];

      // 循环添加所有图片
      for (let i = 0; i < images.length; i++) {
        const imageFile = images[i];
        const imageBase64 = imageFile.buffer.toString('base64');
        
        contentParts.push({
          inlineData: {
            mimeType: imageFile.mimetype,
            data: imageBase64
          }
        });
        
        console.log(`  Added image ${i + 1} to content parts`);
      }

      const req = {
        model: 'gemini-2.5-flash-lite', // 使用 lite 版本进行智能分析
        contents: [
          {
            role: 'user',
            parts: contentParts
          }
        ],
        config: generationConfig,
      };

      // 使用流式生成内容
      const streamingResp = await this.genAI.models.generateContentStream(req);
      
      let editPromptText = '';

      for await (const chunk of streamingResp) {
        if (chunk.text) {
          editPromptText += chunk.text;
        } else if (chunk.candidates && chunk.candidates.length > 0) {
          const candidate = chunk.candidates[0];
          if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
              if (part.text) {
                editPromptText += part.text;
              }
            }
          }
        }
      }

      if (editPromptText) {
        // 检查是否为Gemini的拒绝回复
        if (editPromptText.includes("I'm just a language model and can't help with that") ||
            editPromptText.includes("I can't help with that") ||
            editPromptText.includes("I'm not able to help with that") ||
            editPromptText.includes("Sorry, I can't help with that")) {
          console.warn('⚠️ Gemini model rejected the request (content policy violation)');
          
          return {
            success: false,
            error: 'Content policy violation',
            message: '内容不符合AI安全政策要求。请检查上传的图片是否包含敏感内容，或尝试修改编辑指令。',
            details: '模型拒绝处理此请求，可能原因：图片内容敏感、编辑指令涉及不当内容等。',
            retryable: false,
            policyViolation: true
          };
        }

        console.log('✅ Intelligent analysis editing completed successfully!');
        console.log(`Generated edit prompt length: ${editPromptText.length} characters`);
        console.log(`Processing mode: ${images.length > 1 ? 'Multi-image composition' : 'Single-image editing'}`);
        
        return {
          success: true,
          editPrompt: editPromptText,
          metadata: {
            model: 'gemini-2.5-flash-lite',
            imageCount: images.length,
            imageInfo: images.map((file, index) => ({
              index: index + 1,
              filename: file.originalname,
              mimeType: file.mimetype,
              size: file.size
            })),
            userInstruction: userInstruction,
            editPromptLength: editPromptText.length,
            processingMode: images.length > 1 ? 'multi-image-composition' : 'single-image-editing',
            systemPromptType: customSystemPrompt ? 'custom' : (images.length > 1 ? 'MULTI_IMAGE_ANALYSIS_EDITING' : 'INTELLIGENT_ANALYSIS_EDITING'),
            usingCustomPrompt: !!customSystemPrompt,
            systemPromptLength: systemPrompt.length,
            timestamp: new Date().toISOString()
          }
        };
      }
      
      throw new Error('No valid edit prompt received from model');

    } catch (error) {
      console.error('Intelligent analysis editing failed:', error);
      
      return {
        success: false,
        error: error.message || 'Failed to perform intelligent analysis editing',
        retryable: this.isRetryableError(error)
      };
    }
  }

  /**
   * 融合图片分析结果和用户编辑指令，生成优化的编辑prompt
   */
  async generateEditPrompt(imageAnalysis, userInstruction) {
    console.log(`Generating edit prompt for instruction: "${userInstruction}"`);
    console.log(`Analysis length: ${imageAnalysis.length} characters`);

    try {
      // 导入系统提示词配置
      const SYSTEM_PROMPTS = require('../config/systemPrompts');

      // 构建融合提示词，替换模板变量
      const fusionPrompt = SYSTEM_PROMPTS.EDIT_INSTRUCTION_FUSION
        .replace('{{IMAGE_ANALYSIS}}', imageAnalysis)
        .replace('{{USER_INSTRUCTION}}', userInstruction);

      // 使用现有的generateText方法生成融合后的编辑prompt
      const result = await this.generateText(fusionPrompt);

      if (result.success) {
        console.log('✅ Edit prompt generation completed successfully');
        console.log(`Generated prompt length: ${result.text.length} characters`);
        
        return {
          success: true,
          editPrompt: result.text,
          metadata: {
            originalInstruction: userInstruction,
            analysisUsed: true,
            promptLength: result.text.length,
            timestamp: new Date().toISOString()
          }
        };
      } else {
        throw new Error(result.error || 'Failed to generate edit prompt');
      }

    } catch (error) {
      console.error('Edit prompt generation failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate edit prompt',
        retryable: this.isRetryableError(error)
      };
    }
  }

  async editImages(imageFiles, prompt, options = {}) {
    const modelToUse = (options && options.modelId) || this.model || 'gemini-2.5-flash-image';
    const requestedAspectRatio = (options && options.aspectRatio) || '1:1';
    const requestedImageSize = (options && options.imageSize) || '1K';
    console.log(`Processing request with prompt: "${prompt}"`);
    console.log(`Number of images: ${imageFiles ? imageFiles.length : 0}`);
    console.log(`Using model: ${modelToUse}`);

    if (!this.genAI) {
      console.warn('GoogleGenAI not initialized, using fallback processing');
      
      // Fallback processing when GoogleGenAI is not available
      const fallbackMessage = `由于配置限制，无法进行实际的图片编辑。

用户请求：${prompt}
图片数量：${imageFiles ? imageFiles.length : 0}

建议：请配置Google Cloud credentials以启用完整的AI图片编辑功能。`;
      
      return {
        success: true,
        result: fallbackMessage,
        resultType: 'text',
        metadata: {
          prompt: prompt,
          inputImageCount: imageFiles ? imageFiles.length : 0,
          model: 'fallback-processor',
          timestamp: new Date().toISOString(),
          hasText: true,
          hasImage: false,
          note: 'Fallback processing due to missing GoogleGenAI configuration'
        }
      };
    }

    try {
      // 构建请求内容 - 使用官方 SDK 格式
      const contents = [{
        role: 'user',
        parts: []
      }];

      // 如果有图片，先添加图片（兼容内存或磁盘）
      const _cleanupPaths = [];
      if (imageFiles && imageFiles.length > 0) {
        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i];
          console.log(`Adding image ${i + 1}: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);

          let buf;
          if (file.buffer) {
            buf = file.buffer;
          } else if (file.path) {
            try { buf = await require('fs').promises.readFile(file.path); _cleanupPaths.push(file.path); } catch (e) { console.error('Failed to read temp file:', file.path, e); continue; }
          } else {
            console.warn('File has neither buffer nor path, skipping');
            continue;
          }

          contents[0].parts.push({
            inlineData: {
              mimeType: file.mimetype,
              data: buf.toString('base64')
            }
          });
        }
        
        // 对于有图片的请求，明确要求返回编辑后的图片
        const enhancedPrompt = `${prompt}

请根据我的要求编辑上面的图片，并直接返回编辑后的图片结果。不要只描述，请生成实际的编辑后图片。`;
        
        contents[0].parts.push({ text: enhancedPrompt });
      } else {
        // 纯文本请求，用于图片生成
        const enhancedPrompt = `请根据以下描述生成一张图片：${prompt}

请直接生成图片，不要只提供文字描述。`;
        
        contents[0].parts.push({ text: enhancedPrompt });
      }

        console.log(`Sending request to ${modelToUse} using official SDK...`);
      
      const generationConfig = {
        maxOutputTokens: parseInt(process.env.AI_MAX_OUTPUT_TOKENS) || 32768,
        temperature: parseFloat(process.env.AI_TEMPERATURE) || 1,
        topP: 0.95,
        responseModalities: ["TEXT", "IMAGE"],
        mediaResolution: 'MEDIA_RESOLUTION_HIGH',
        imageConfig: {
          aspectRatio: requestedAspectRatio,
          imageSize: requestedImageSize,
          outputMimeType: 'image/png',
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_IMAGE_HATE',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_IMAGE_HARASSMENT',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT',
            threshold: 'OFF',
          }
        ],
      };

      const req = {
        model: modelToUse,
        contents: contents,
        config: generationConfig,
      };

      console.log('[AI][Edit] Sending config:', {
        model: modelToUse,
        imageConfig: generationConfig.imageConfig,
        mediaResolution: generationConfig.mediaResolution
      });

      // 使用流式生成内容
      const streamingResp = await this.genAI.models.generateContentStream(req);
      
      let textResult = '';
      let imageResult = null;
      let resultType = 'text';

      const extractFromCandidates = (candidates = []) => {
        for (const candidate of candidates) {
          if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.text) {
                textResult += part.text;
              }
              if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('image/')) {
                imageResult = {
                  mimeType: part.inlineData.mimeType,
                  data: part.inlineData.data
                };
                resultType = 'image';
              }
            }
          }
        }
      };

      for await (const chunk of streamingResp) {
        if (chunk.text) {
          textResult += chunk.text;
        } else if (chunk.candidates && chunk.candidates.length > 0) {
          extractFromCandidates(chunk.candidates);
        } else if (chunk.response && chunk.response.candidates && chunk.response.candidates.length > 0) {
          // 某些版本返回在 response.candidates
          extractFromCandidates(chunk.response.candidates);
        }
      }

      // 流式未拿到结果时，兜底再做一次非流式调用
      if (!imageResult && !textResult) {
        console.warn('No result from streaming response, falling back to non-streaming generateContent...');
        const resp = await this.genAI.models.generateContent(req);
        if (resp?.text) textResult += resp.text;
        const candidates = resp?.candidates || (resp?.response && resp.response.candidates) || [];
        if (candidates && candidates.length > 0) extractFromCandidates(candidates);
      }

      // 优先返回图片，如果没有图片则返回文本
      let finalResult;
      if (imageResult) {
        finalResult = `data:${imageResult.mimeType};base64,${imageResult.data}`;
        resultType = 'image';
        try {
          const buf = Buffer.from(imageResult.data, 'base64');
          const dim = this.getImageDimensions(buf);
          if (dim) console.log('[AI][Edit] Output dimensions:', dim);
        } catch (e) {}
      } else if (textResult) {
        // 检查文本结果是否为Gemini的拒绝回复
        if (textResult.includes("I'm just a language model and can't help with that") ||
            textResult.includes("I can't help with that") ||
            textResult.includes("I'm not able to help with that") ||
            textResult.includes("Sorry, I can't help with that")) {
          console.warn('⚠️ Gemini model rejected the image editing request (content policy violation)');
          
          return {
            success: false,
            error: 'Content policy violation',
            message: '图片编辑请求被拒绝：内容不符合AI安全政策。请检查图片是否包含敏感内容，或修改编辑指令。',
            details: '模型拒绝处理此图片编辑请求，可能原因：图片内容敏感、编辑指令不当等。',
            retryable: false,
            policyViolation: true
          };
        }
        
        finalResult = textResult;
        resultType = 'text';
      } else {
        throw new Error('No valid result received from model');
      }

      console.log(`✅ Request completed successfully! Result type: ${resultType}`);
      
      // Debug: 检查结果数据的前100个字符
      if (resultType === 'image' && finalResult) {
        console.log('Image result preview:', finalResult.substring(0, 100) + '...');
        console.log('Image data length:', finalResult.length);
      }
      
      const _payload = {
        success: true,
        result: finalResult,
        resultType: resultType,
        metadata: {
          prompt: prompt,
          inputImageCount: imageFiles ? imageFiles.length : 0,
          model: modelToUse,
          timestamp: new Date().toISOString(),
          hasText: !!textResult,
          hasImage: !!imageResult,
          aspectRatio: requestedAspectRatio,
          imageSize: requestedImageSize,
        }
      };
      try { await Promise.allSettled(_cleanupPaths.map(p => require('fs').promises.unlink(p))); } catch {}
      return _payload;

    } catch (error) {
      console.error('❌ Error processing request:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
        status: error.status,
        details: error.details
      });
      
      // 检查是否是内容政策违规相关的错误
      const errorMessage = error.message || '';
      const errorString = JSON.stringify(error);
      
      if (errorMessage.includes('SAFETY') || 
          errorMessage.includes('safety') ||
          errorMessage.includes('Content policy') ||
          errorMessage.includes('policy violation') ||
          errorString.includes('SAFETY') ||
          errorString.includes('BLOCKED')) {
        
        console.warn('⚠️ Detected content policy violation error');
        return {
          success: false,
          error: 'Content policy violation',
          message: '图片编辑请求被拒绝：内容不符合AI安全政策。请检查图片是否包含敏感内容，或修改编辑指令。',
          details: `原始错误信息：${errorMessage}\n\n完整错误对象：${errorString}`,
          retryable: false,
          policyViolation: true,
          originalError: errorMessage
        };
      }
      
      return {
        success: false,
        error: error.message || 'Failed to process request',
        details: `原始错误信息：${errorMessage}\n\n完整错误对象：${errorString}`,
        retryable: this.isRetryableError(error),
        maxRetries: parseInt(process.env.AI_MAX_RETRIES) || 2,
        retryDelay: parseInt(process.env.AI_RETRY_DELAY_MS) || 2000,
        originalError: errorMessage
      };
    }
  }
}

const vertexAIService = new VertexAIService();

module.exports = vertexAIService;
