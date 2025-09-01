const { VertexAI } = require('@google-cloud/vertexai');
require('dotenv').config({ path: '../.env' });

async function testImageAnalysis() {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION;
    
    console.log(`Testing image analysis in project: ${project}, location: ${location}`);
    
    const vertexAI = new VertexAI({
        project: project,
        location: location,
    });

    // 测试所有可用的模型进行图像分析
    const availableModels = [
        'gemini-2.0-flash-exp',
        'gemini-2.5-flash', 
        'gemini-2.5-flash-lite'
    ];

    // 创建一个更真实的测试图片 - 一个简单的红色方块
    const createTestImage = () => {
        // 创建一个简单的 PNG 图像的 base64 数据
        // 这是一个 2x2 像素的红色图像
        return 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVQIHWP8z8AAxEAMyP9ABQAA3QAjANEEelwAAAAASUVORK5CYII=';
    };

    for (const modelId of availableModels) {
        console.log(`\n=== Testing ${modelId} for image analysis ===`);
        
        try {
            const model = vertexAI.getGenerativeModel({
                model: modelId,
                generation_config: {
                    max_output_tokens: 1000,
                    temperature: 0.1,
                }
            });

            const testImageBase64 = createTestImage();
            
            const result = await model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [
                        {
                            text: '请描述这张图片，即使它很简单。'
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
            
            if (result && result.response && result.response.candidates) {
                console.log(`✅ ${modelId} - 图像分析成功！`);
                console.log('分析结果:', result.response.candidates[0].content.parts[0].text);
                return modelId; // 返回第一个工作的模型
            } else {
                console.log(`❌ ${modelId} - 响应格式异常`);
            }
            
        } catch (error) {
            console.log(`❌ ${modelId} - 图像分析失败`);
            console.log('错误:', error.message);
            
            // 尝试只进行文本对话测试
            try {
                const textResult = await model.generateContent({
                    contents: [{
                        role: 'user',
                        parts: [{
                            text: '你好，这是一个测试消息'
                        }]
                    }]
                });
                
                if (textResult && textResult.response) {
                    console.log(`ℹ️  ${modelId} - 文本功能正常，但不支持图像分析`);
                }
            } catch (textError) {
                console.log(`❌ ${modelId} - 完全无法使用`);
            }
        }
    }

    return null;
}

testImageAnalysis().then(workingModel => {
    if (workingModel) {
        console.log(`\n🎉 建议使用模型: ${workingModel}`);
        console.log('\n请在 .env 文件中设置:');
        console.log(`VERTEX_MODEL_ID=${workingModel}`);
    } else {
        console.log('\n❌ 没有找到支持图像分析的模型');
        console.log('\n可能的解决方案:');
        console.log('1. 检查项目权限和模型可用性');
        console.log('2. 尝试其他地区 (如 us-east4, europe-west4)');
        console.log('3. 申请访问图像分析模型的权限');
    }
}).catch(error => {
    console.error('测试失败:', error);
});