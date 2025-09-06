const { VertexAI } = require('@google-cloud/vertexai');
require('dotenv').config();

async function listVertexAIModels() {
    try {
        const project = process.env.GOOGLE_CLOUD_PROJECT;
        const location = process.env.GOOGLE_CLOUD_LOCATION;
        
        if (!project || !location) {
            console.error('Missing required environment variables:');
            console.error('GOOGLE_CLOUD_PROJECT:', project);
            console.error('GOOGLE_CLOUD_LOCATION:', location);
            console.error('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
            return;
        }

        console.log(`Checking models in project: ${project}, location: ${location}`);
        console.log('Credentials path:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
        
        const vertexAI = new VertexAI({
            project: project,
            location: location,
        });

        // 尝试获取常见的Gemini模型
        const geminiModels = [
            'gemini-1.5-pro',
            'gemini-1.5-flash',
            'gemini-2.0-flash-exp',
            'gemini-2.5-flash',
            'gemini-2.5-flash-image-preview',
            'gemini-pro',
            'gemini-pro-vision',
            'gemini-1.0-pro',
            'gemini-1.0-pro-vision',
            'gemini-1.0-pro-001',
            'gemini-1.0-pro-vision-001',
            'gemini-1.5-pro-001',
            'gemini-1.5-pro-002',
            'gemini-1.5-flash-001',
            'gemini-1.5-flash-002',
            'gemini-exp-1114',
            'gemini-exp-1121'
        ];

        console.log('\n=== Testing Available Gemini Models ===\n');
        
        for (const modelId of geminiModels) {
            try {
                console.log(`Testing model: ${modelId}...`);
                
                const model = vertexAI.getGenerativeModel({
                    model: modelId,
                    generation_config: {
                        max_output_tokens: 100,
                        temperature: 0.1,
                    }
                });

                // 尝试一个简单的文本生成请求
                const result = await model.generateContent({
                    contents: [{
                        role: 'user',
                        parts: [{
                            text: 'Hello, test message'
                        }]
                    }]
                });
                
                if (result && result.response) {
                    console.log(`✅ ${modelId} - AVAILABLE`);
                } else {
                    console.log(`❌ ${modelId} - Response format unexpected`);
                }
                
            } catch (error) {
                if (error.message && error.message.includes('not found')) {
                    console.log(`❌ ${modelId} - NOT FOUND`);
                } else if (error.message && error.message.includes('permission')) {
                    console.log(`⚠️  ${modelId} - PERMISSION DENIED`);
                } else if (error.message && error.message.includes('quota')) {
                    console.log(`⚠️  ${modelId} - QUOTA EXCEEDED`);
                } else {
                    console.log(`❌ ${modelId} - ERROR: ${error.message.substring(0, 100)}...`);
                }
            }
            
            // 添加小延迟避免API限制
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log('\n=== Testing Image Analysis with gemini-2.5-flash-image-preview ===\n');
        
        try {
            const imageModel = vertexAI.getGenerativeModel({
                model: 'gemini-2.5-flash-image-preview',
                generation_config: {
                    max_output_tokens: 100,
                    temperature: 0.1,
                }
            });

            // 创建一个小的测试图片 (1x1 像素 PNG)
            const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU8j7wAAAABJRU5ErkJggg==';
            
            const result = await imageModel.generateContent({
                contents: [{
                    role: 'user',
                    parts: [
                        {
                            text: 'Describe this image'
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
            
            console.log('✅ gemini-2.5-flash-image-preview - Image analysis WORKS');
            console.log('Response preview:', result.response.candidates[0].content.parts[0].text.substring(0, 200) + '...');
            
        } catch (error) {
            console.log('❌ gemini-2.5-flash-image-preview - Image analysis FAILED');
            console.log('Error details:', error.message);
            
            // 输出完整的错误信息用于调试
            if (error.details) {
                console.log('Error details:', JSON.stringify(error.details, null, 2));
            }
        }

    } catch (error) {
        console.error('Script execution error:', error);
    }
}

// 运行检查
listVertexAIModels().then(() => {
    console.log('\nModel check completed!');
}).catch(error => {
    console.error('Script failed:', error);
});