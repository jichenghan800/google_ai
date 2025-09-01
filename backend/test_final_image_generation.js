const { VertexAI } = require('@google-cloud/vertexai');
require('dotenv').config({ path: '../.env' });

async function testRealImageGeneration() {
    console.log('=== 测试真实的 Imagen 图片生成功能 ===\n');
    
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    
    // 使用 us-central1 区域测试 Imagen
    const vertexAI = new VertexAI({
        project: project,
        location: 'us-central1',
    });

    console.log(`项目: ${project}`);
    console.log('地区: us-central1');
    console.log('目标模型: imagegeneration@006\n');
    
    // 测试不同的 Imagen 模型版本
    const imagenModels = [
        'imagegeneration@006',
        'imagegeneration@005',  
        'imagegeneration@002',
        'imagen-3.0-generate-001',
        'imagen-3.0-fast-generate-001'
    ];

    for (const modelId of imagenModels) {
        console.log(`\n测试模型: ${modelId}`);
        
        try {
            const model = vertexAI.getGenerativeModel({
                model: modelId,
                generation_config: {
                    max_output_tokens: 2048,
                    temperature: 0.8,
                }
            });

            console.log('发送图片生成请求: "A beautiful red rose in a garden"');
            
            const result = await model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{
                        text: 'Generate an image of a beautiful red rose in a garden'
                    }]
                }]
            });

            if (result && result.response && result.response.candidates && result.response.candidates.length > 0) {
                const candidate = result.response.candidates[0];
                console.log('✅ 请求成功！');
                console.log('Candidate parts数量:', candidate.content.parts.length);
                
                let foundImage = false;
                candidate.content.parts.forEach((part, index) => {
                    if (part.text) {
                        console.log(`Part ${index + 1} (文本):`, part.text.substring(0, 100) + '...');
                    }
                    if (part.inlineData && part.inlineData.mimeType) {
                        console.log(`🖼️ Part ${index + 1} (图片): ${part.inlineData.mimeType}`);
                        console.log('图片数据大小:', part.inlineData.data.length, 'characters');
                        
                        // 保存图片
                        const fs = require('fs');
                        try {
                            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                            const extension = part.inlineData.mimeType.split('/')[1];
                            const fileName = `imagen_test_${modelId.replace(/[@.]/g, '_')}_${Date.now()}.${extension}`;
                            fs.writeFileSync(fileName, imageBuffer);
                            console.log(`✅ 图片已保存: ${fileName}`);
                            foundImage = true;
                        } catch (saveError) {
                            console.log('❌ 保存图片失败:', saveError.message);
                        }
                    }
                });
                
                if (foundImage) {
                    console.log(`\n🎉 成功！${modelId} 可以生成真实图片！`);
                    console.log('建议配置:');
                    console.log(`// 在 vertexAI.js 中使用:`);
                    console.log(`model: '${modelId}'`);
                    console.log(`location: 'us-central1'`);
                    
                    return modelId; // 返回可工作的模型
                } else {
                    console.log('⚠️  响应中没有找到图片数据');
                }
                
            } else {
                console.log('❌ 响应格式异常');
            }
            
        } catch (error) {
            if (error.message.includes('not found') || error.message.includes('NOT_FOUND')) {
                console.log('❌ 模型不存在');
            } else if (error.message.includes('429')) {
                console.log('⚠️  请求频率限制，等待重试...');
                await new Promise(resolve => setTimeout(resolve, 5000)); // 等5秒
            } else if (error.message.includes('permission')) {
                console.log('❌ 权限不足');
            } else {
                console.log(`❌ 错误: ${error.message.substring(0, 100)}...`);
            }
        }
        
        // 每个模型间等待，避免频率限制
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n❌ 没有找到可用的图片生成模型');
    return null;
}

// 测试当前应用中的图片生成服务
async function testCurrentService() {
    console.log('\n=== 测试当前应用的图片生成服务 ===\n');
    
    try {
        // 模拟调用应用的图片生成API
        const response = await fetch('http://localhost:3001/api/generate/image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sessionId: 'test-session',
                prompt: 'A cute cat sitting in a sunny garden',
                parameters: {
                    width: 512,
                    height: 512,
                    style: 'natural',
                    quality: 'high'
                }
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ 应用图片生成API工作正常！');
            console.log('图片URL类型:', result.data.imageUrl.substring(0, 50) + '...');
            console.log('是否真实图片:', result.data.metadata?.isReal ? '是' : '否（模拟）');
            console.log('使用的模型:', result.data.metadata?.model);
        } else {
            console.log('❌ 应用图片生成API失败:', result.error);
        }
        
    } catch (error) {
        console.log('❌ 无法连接到应用API:', error.message);
    }
}

async function runTest() {
    const workingModel = await testRealImageGeneration();
    await testCurrentService();
    
    if (workingModel) {
        console.log(`\n📋 总结:`);
        console.log(`✅ 找到可用的图片生成模型: ${workingModel}`);
        console.log(`✅ 应用已配置为尝试使用 Imagen 模型`);
        console.log(`✅ 如果 Imagen 不可用，会自动回退到模拟生成`);
    } else {
        console.log('\n📋 总结:');
        console.log('❌ 未找到可用的 Imagen 模型');
        console.log('✅ 应用使用模拟图片生成作为备选方案');
    }
}

runTest().catch(error => {
    console.error('测试失败:', error);
});