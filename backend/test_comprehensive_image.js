const { VertexAI } = require('@google-cloud/vertexai');
require('dotenv').config({ path: '../.env' });

async function testDifferentEndpoints() {
    console.log('=== 测试不同的 API 端点配置 ===\n');
    
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    
    // 测试不同的地区和端点配置
    const configurations = [
        {
            location: 'global',
            apiEndpoint: 'generativelanguage.googleapis.com',
            name: 'Global with Generative Language API'
        },
        {
            location: 'global', 
            apiEndpoint: undefined, // 使用默认端点
            name: 'Global with default endpoint'
        },
        {
            location: 'us-central1',
            apiEndpoint: undefined,
            name: 'US-Central1 fallback'
        },
        {
            location: 'us-east4',
            apiEndpoint: undefined, 
            name: 'US-East4 fallback'
        }
    ];
    
    for (const config of configurations) {
        console.log(`\n测试配置: ${config.name}`);
        console.log(`- 地区: ${config.location}`);
        console.log(`- 端点: ${config.apiEndpoint || 'default'}`);
        
        try {
            const vertexAIConfig = {
                project: project,
                location: config.location,
            };
            
            if (config.apiEndpoint) {
                vertexAIConfig.apiEndpoint = config.apiEndpoint;
            }
            
            const vertexAI = new VertexAI(vertexAIConfig);
            
            const model = vertexAI.getGenerativeModel({
                model: 'gemini-2.5-flash-image-preview',
                generation_config: {
                    max_output_tokens: 1000,
                    temperature: 0.8,
                }
            });

            console.log('发送测试请求...');
            
            const result = await model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{
                        text: 'Generate a simple image of a blue circle'
                    }]
                }]
            });
            
            if (result && result.response) {
                console.log('✅ 成功！');
                console.log('响应类型:', typeof result.response);
                console.log('Candidates数量:', result.response.candidates?.length || 0);
                
                if (result.response.candidates && result.response.candidates.length > 0) {
                    const candidate = result.response.candidates[0];
                    console.log('Parts数量:', candidate.content.parts?.length || 0);
                    
                    candidate.content.parts?.forEach((part, index) => {
                        if (part.inlineData) {
                            console.log(`🖼️ 找到图片! Part ${index + 1}: ${part.inlineData.mimeType}`);
                            
                            // 保存图片
                            const fs = require('fs');
                            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                            const fileName = `test_generated_${config.location}_${Date.now()}.png`;
                            fs.writeFileSync(fileName, imageBuffer);
                            console.log(`图片已保存: ${fileName}`);
                            
                            return; // 找到可工作的配置，停止测试
                        }
                        if (part.text) {
                            console.log(`📝 文本响应: ${part.text.substring(0, 100)}...`);
                        }
                    });
                }
            }
            
        } catch (error) {
            if (error.message.includes('HTML') || error.message.includes('<!DOCTYPE')) {
                console.log('❌ HTML响应错误 - 端点不正确');
            } else if (error.message.includes('not found') || error.message.includes('NOT_FOUND')) {
                console.log('❌ 模型不存在');
            } else if (error.message.includes('permission')) {
                console.log('❌ 权限错误');
            } else {
                console.log(`❌ 其他错误: ${error.message.substring(0, 100)}...`);
            }
        }
        
        // 添加延迟避免请求过快
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n=== 测试完成 ===');
}

// 同时测试可能可用的其他图片生成模型
async function testImageModels() {
    console.log('\n=== 测试其他可能的图片生成模型 ===\n');
    
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const vertexAI = new VertexAI({
        project: project,
        location: 'us-central1', // 使用已知可用的区域
    });
    
    const imageModels = [
        'imagegeneration@002',
        'imagegeneration@001', 
        'imagen-3.0-generate-001',
        'imagen-3.0-fast-generate-001'
    ];
    
    for (const modelId of imageModels) {
        try {
            console.log(`测试模型: ${modelId}`);
            
            const model = vertexAI.getGenerativeModel({
                model: modelId,
                generation_config: {
                    max_output_tokens: 1000,
                }
            });

            const result = await model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{
                        text: 'Generate an image of a cat'
                    }]
                }]
            });
            
            console.log(`✅ ${modelId} - 可能可用`);
            
        } catch (error) {
            if (error.message.includes('not found')) {
                console.log(`❌ ${modelId} - 不存在`);
            } else {
                console.log(`⚠️  ${modelId} - ${error.message.substring(0, 50)}...`);
            }
        }
    }
}

async function runAllTests() {
    await testDifferentEndpoints();
    await testImageModels();
}

runAllTests().catch(error => {
    console.error('测试失败:', error);
});