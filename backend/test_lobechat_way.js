const { VertexAI } = require('@google-cloud/vertexai');

async function testLobeChatWay() {
    console.log('=== 按照 LobeChat 方式测试 Gemini 2.5 Flash Image Preview ===\n');
    
    // 读取服务账户 JSON 文件
    const serviceAccountPath = '../cotti-coffee-462402-96fb1983df3e.json';
    const serviceAccount = require(serviceAccountPath);
    
    console.log('项目ID:', serviceAccount.project_id);
    console.log('服务账户邮箱:', serviceAccount.client_email);
    
    // 使用与 LobeChat 相同的配置方式
    const vertexAI = new VertexAI({
        project: serviceAccount.project_id,
        location: 'us-central1', // LobeChat 推荐的区域
        // 直接使用服务账户密钥
        keyFilename: serviceAccountPath
    });

    console.log('\n正在测试 gemini-2.5-flash-image-preview 模型...\n');
    
    try {
        const model = vertexAI.getGenerativeModel({
            model: 'gemini-2.5-flash-image-preview',
            generation_config: {
                max_output_tokens: 2048,
                temperature: 0.4,
            }
        });

        // 创建一个简单但有效的测试图像
        // 这是一个 8x8 像素的红色方块 PNG
        const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABYSURBVBiVY/z//z8DJQAggBhJMQAggBj+ExIACCBGUgwACCBGgABBQFAMIIAY/hMSAAgU5jEkJSUhq4MAQAAxkmIAQAAxAgQIioH1IasDAECg8J+QAEAA4c4AKMQAOH0AAAAASUVORK5CYII=';
        
        console.log('发送图片分析请求...');
        
        const result = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [
                    {
                        text: '请详细分析这张图片，描述你看到的内容。'
                    },
                    {
                        inlineData: {
                            mimeType: 'image/png',
                            data: testImageBase64
                        }
                    }
                ]
            }]
        });
        
        if (result && result.response && result.response.candidates && result.response.candidates.length > 0) {
            console.log('✅ 成功！gemini-2.5-flash-image-preview 可以工作！\n');
            console.log('分析结果:');
            console.log(result.response.candidates[0].content.parts[0].text);
            
            console.log('\n📋 建议配置更新:');
            console.log('在 .env 文件中设置:');
            console.log('GOOGLE_CLOUD_LOCATION=us-central1');
            console.log('VERTEX_MODEL_ID=gemini-2.5-flash-image-preview');
            
        } else {
            console.log('❌ 响应格式异常');
            console.log('Response:', JSON.stringify(result, null, 2));
        }
        
    } catch (error) {
        console.log('❌ 测试失败');
        console.log('错误信息:', error.message);
        
        if (error.message.includes('not found') || error.message.includes('NOT_FOUND')) {
            console.log('\n可能的原因:');
            console.log('1. 模型在当前项目/区域不可用');
            console.log('2. 需要申请访问权限');
            console.log('3. 项目配置问题');
        } else if (error.message.includes('permission') || error.message.includes('PERMISSION_DENIED')) {
            console.log('\n可能的原因:');
            console.log('1. 服务账户权限不足');
            console.log('2. 需要 "Vertex AI User" 角色');
            console.log('3. API 未启用');
        }
        
        console.log('\n完整错误详情:');
        console.log(error);
    }
}

// 同时测试其他可能的模型变体
async function testModelVariants() {
    console.log('\n=== 测试其他可能的模型名称 ===\n');
    
    const serviceAccount = require('../cotti-coffee-462402-96fb1983df3e.json');
    const vertexAI = new VertexAI({
        project: serviceAccount.project_id,
        location: 'us-central1',
        keyFilename: '../cotti-coffee-462402-96fb1983df3e.json'
    });

    const modelVariants = [
        'gemini-2.5-flash-image-preview',
        'gemini-2.5-flash',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'publishers/google/models/gemini-2.5-flash-image-preview',
        'projects/cotti-coffee-462402/locations/us-central1/publishers/google/models/gemini-2.5-flash-image-preview'
    ];
    
    for (const modelId of modelVariants) {
        try {
            console.log(`测试模型: ${modelId}`);
            
            const model = vertexAI.getGenerativeModel({
                model: modelId,
                generation_config: {
                    max_output_tokens: 100,
                    temperature: 0.1,
                }
            });

            const result = await model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{
                        text: 'Hello test'
                    }]
                }]
            });
            
            if (result && result.response) {
                console.log(`✅ ${modelId} - 可用`);
            }
            
        } catch (error) {
            if (error.message.includes('not found')) {
                console.log(`❌ ${modelId} - 不存在`);
            } else {
                console.log(`⚠️  ${modelId} - ${error.message.substring(0, 50)}...`);
            }
        }
        
        // 小延迟避免请求过快
        await new Promise(resolve => setTimeout(resolve, 300));
    }
}

// 运行测试
async function runTests() {
    await testLobeChatWay();
    await testModelVariants();
}

runTests().catch(error => {
    console.error('测试脚本失败:', error);
});