const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
require('dotenv').config({ path: '../.env' });

async function testOfficialSDK() {
    console.log('=== 测试官方 @google/genai SDK ===\n');
    
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = 'global';
    const model = 'gemini-2.5-flash-image-preview';
    
    console.log(`项目: ${project}`);
    console.log(`地区: ${location}`);
    console.log(`模型: ${model}\n`);
    
    try {
        // 使用官方 SDK 初始化
        console.log('使用官方 GoogleGenAI SDK 初始化...');
        const ai = new GoogleGenAI({
            vertexai: true,
            project: project,
            location: location
        });
        
        console.log('✅ GoogleGenAI 初始化成功');

        // 创建一个更大的有效测试图片 - 实际的 PNG 图片
        const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABLSURBVBiVY2RgYPjPgAOM////h4uNHTuWAbeC////48ROnz6NXeGePXuw2wHCjIyMTLgU4lGITyEehfgU4lGITyE+hfgUYpcLAL+wT19syDZEAAAAAElFTkSuQmCC';
        
        const prompt = '你好，请回复一个简单的文本消息';
        
        console.log('构建纯文本请求...');
        
        // 设置生成配置
        const generationConfig = {
            maxOutputTokens: 32768,
            temperature: 1,
            topP: 0.95,
            responseModalities: ["TEXT"],
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

        const req = {
            model: model,
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: prompt
                        }
                    ]
                }
            ],
            config: generationConfig,
        };

        console.log('发送请求到 gemini-2.5-flash-image-preview...');
        
        const streamingResp = await ai.models.generateContentStream(req);
        
        console.log('✅ 请求成功！开始处理流式响应...');
        
        let textResult = '';
        let imageResult = null;
        let chunkCount = 0;
        
        for await (const chunk of streamingResp) {
            chunkCount++;
            console.log(`处理第 ${chunkCount} 个响应块...`);
            
            if (chunk.text) {
                textResult += chunk.text;
                console.log(`收到文本内容: ${chunk.text.substring(0, 100)}...`);
            } else if (chunk.candidates && chunk.candidates.length > 0) {
                const candidate = chunk.candidates[0];
                if (candidate.content && candidate.content.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.text) {
                            textResult += part.text;
                            console.log(`收到文本内容: ${part.text.substring(0, 100)}...`);
                        }
                        
                        if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('image/')) {
                            imageResult = {
                                mimeType: part.inlineData.mimeType,
                                data: part.inlineData.data
                            };
                            console.log(`收到图片内容: ${part.inlineData.mimeType}, 大小: ${part.inlineData.data.length} 字符`);
                        }
                    }
                }
            } else {
                console.log('其他类型响应块:', JSON.stringify(chunk, null, 2));
            }
        }
        
        console.log(`\n=== 处理结果 ===`);
        console.log(`共处理了 ${chunkCount} 个响应块`);
        console.log(`文本结果长度: ${textResult.length}`);
        console.log(`图片结果: ${imageResult ? '有' : '无'}`);
        
        if (textResult) {
            console.log(`\n文本内容预览:\n${textResult.substring(0, 300)}${textResult.length > 300 ? '...' : ''}`);
        }
        
        if (imageResult) {
            console.log(`\n图片信息:`);
            console.log(`- MIME 类型: ${imageResult.mimeType}`);
            console.log(`- 数据长度: ${imageResult.data.length} 字符`);
        }
        
        console.log('\n✅ 测试完成！官方 SDK 工作正常');
        
    } catch (error) {
        console.log('❌ 测试失败');
        console.log('错误类型:', error.constructor.name);
        console.log('错误信息:', error.message);
        
        if (error.message.includes('HTML') || error.message.includes('<!DOCTYPE')) {
            console.log('\n🔍 分析：仍然收到HTML响应');
            console.log('可能需要检查认证或项目配置');
        }
        
        if (error.stack) {
            console.log('\n完整堆栈:');
            console.log(error.stack);
        }
    }
}

testOfficialSDK().catch(error => {
    console.error('脚本执行失败:', error);
});