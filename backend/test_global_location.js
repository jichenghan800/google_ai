const { VertexAI } = require('@google-cloud/vertexai');
require('dotenv').config({ path: '../.env' });

async function testGlobalLocation() {
    console.log('=== 测试 global 地区的模型可用性 ===\n');
    
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION; // 现在是 global
    
    console.log(`项目: ${project}`);
    console.log(`地区: ${location}\n`);
    
    const vertexAI = new VertexAI({
        project: project,
        location: location,
    });

    // 测试 gemini-2.5-flash-image-preview
    const modelsToTest = [
        'gemini-2.5-flash-image-preview',
        'gemini-2.5-flash',
        'gemini-1.5-pro', 
        'gemini-1.5-flash'
    ];

    for (const modelId of modelsToTest) {
        console.log(`测试模型: ${modelId}`);
        
        try {
            const model = vertexAI.getGenerativeModel({
                model: modelId,
                generation_config: {
                    max_output_tokens: 1000,
                    temperature: 0.1,
                }
            });

            // 先测试基本文本功能
            const textResult = await model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{
                        text: '你好'
                    }]
                }]
            });
            
            if (textResult && textResult.response) {
                console.log(`✅ ${modelId} - 文本功能正常`);
                
                // 如果是图像相关模型，测试图像分析功能
                if (modelId.includes('image') || modelId.includes('vision') || modelId === 'gemini-2.5-flash' || modelId === 'gemini-1.5-pro') {
                    try {
                        // 8x8像素的红色方块PNG
                        const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABYSURBVBiVY/z//z8DJQAggBhJMQAggBj+ExIACCBGUgwACCBGgABBQFAMIIAY/hMSAAgU5jEkJSUhq4MAQAAxkmIAQAAxAgQIioH1IasDAECg8J+QAEAA4c4AKMQAOH0AAAAASUVORK5CYII=';
                        
                        const imageResult = await model.generateContent({
                            contents: [{
                                role: 'user',
                                parts: [
                                    {
                                        text: '请描述这张图片'
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
                        
                        if (imageResult && imageResult.response) {
                            console.log(`🖼️  ${modelId} - 图像分析功能正常！`);
                            console.log(`   分析结果: ${imageResult.response.candidates[0].content.parts[0].text.substring(0, 100)}...`);
                            
                            if (modelId === 'gemini-2.5-flash-image-preview') {
                                console.log('\n🎉 成功找到可用的图像分析模型！');
                                console.log('建议更新 .env 文件:');
                                console.log(`VERTEX_MODEL_ID=${modelId}`);
                                console.log(`GOOGLE_CLOUD_LOCATION=${location}`);
                            }
                        }
                        
                    } catch (imageError) {
                        console.log(`❌ ${modelId} - 图像分析失败: ${imageError.message.substring(0, 50)}...`);
                    }
                }
            }
            
        } catch (error) {
            if (error.message.includes('not found') || error.message.includes('NOT_FOUND')) {
                console.log(`❌ ${modelId} - 不存在`);
            } else if (error.message.includes('permission')) {
                console.log(`⚠️  ${modelId} - 权限问题`);
            } else {
                console.log(`❌ ${modelId} - 错误: ${error.message.substring(0, 50)}...`);
            }
        }
        
        console.log(''); // 空行分隔
        await new Promise(resolve => setTimeout(resolve, 500)); // 避免请求过快
    }
    
    console.log('测试完成！');
}

testGlobalLocation().catch(error => {
    console.error('测试失败:', error);
});