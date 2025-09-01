const { VertexAI } = require('@google-cloud/vertexai');
const fs = require('fs');
require('dotenv').config({ path: '../.env' });

async function testWithRealImage() {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION;
    
    console.log('Testing with a real image file...');
    
    const vertexAI = new VertexAI({
        project: project,
        location: location,
    });

    // 创建一个简单的PNG图像文件
    const createSimpleImage = () => {
        // 这是一个最小的PNG文件（1x1透明像素）
        return Buffer.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00,
            0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
            0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
            0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0x00, 0x00, 0x00, 0x00, 0x01,
            0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
        ]);
    };

    // 测试不同地区的可用性
    const locations = ['us-central1', 'us-east4', 'europe-west4'];
    
    for (const testLocation of locations) {
        console.log(`\n=== Testing location: ${testLocation} ===`);
        
        const locationVertexAI = new VertexAI({
            project: project,
            location: testLocation,
        });

        // 尝试访问支持视觉的模型
        const visionModels = [
            'gemini-1.5-pro',
            'gemini-1.5-flash', 
            'gemini-pro-vision',
            'gemini-1.0-pro-vision'
        ];

        for (const modelId of visionModels) {
            try {
                console.log(`Testing ${modelId} in ${testLocation}...`);
                
                const model = locationVertexAI.getGenerativeModel({
                    model: modelId,
                    generation_config: {
                        max_output_tokens: 1000,
                        temperature: 0.1,
                    }
                });

                const imageBuffer = createSimpleImage();
                const imageBase64 = imageBuffer.toString('base64');
                
                const result = await model.generateContent({
                    contents: [{
                        role: 'user',
                        parts: [
                            {
                                text: 'What do you see in this image?'
                            },
                            {
                                inlineData: {
                                    mimeType: 'image/png',
                                    data: imageBase64
                                }
                            }
                        ]
                    }]
                });
                
                if (result && result.response && result.response.candidates) {
                    console.log(`✅ ${modelId} in ${testLocation} - WORKS!`);
                    console.log('Response:', result.response.candidates[0].content.parts[0].text);
                    
                    // 找到可工作的模型，建议配置
                    console.log(`\n🎉 成功！请更新配置:`);
                    console.log(`GOOGLE_CLOUD_LOCATION=${testLocation}`);
                    console.log(`VERTEX_MODEL_ID=${modelId}`);
                    return;
                }
                
            } catch (error) {
                if (error.message.includes('not found') || error.message.includes('NOT_FOUND')) {
                    console.log(`❌ ${modelId} - Not available in ${testLocation}`);
                } else {
                    console.log(`❌ ${modelId} - Error: ${error.message.substring(0, 100)}...`);
                }
            }
        }
    }

    console.log('\n❌ 没有找到任何可用的图像分析模型');
    console.log('\n建议:');
    console.log('1. 检查 Google Cloud 项目是否启用了 Vertex AI API');
    console.log('2. 确认项目有访问多模态模型的权限');
    console.log('3. 考虑使用其他图像分析服务（如 Vision API）');
}

testWithRealImage().catch(error => {
    console.error('测试失败:', error);
});