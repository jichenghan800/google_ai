const { VertexAI } = require('@google-cloud/vertexai');
const fs = require('fs');
require('dotenv').config({ path: '../.env' });

async function testGlobalImageEdit() {
    console.log('=== 测试 global 区域的 gemini-2.5-flash-image-preview 图片编辑 ===\n');
    
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = 'global'; // 强制使用 global
    const model = 'gemini-2.5-flash-image-preview';
    
    console.log(`项目: ${project}`);
    console.log(`地区: ${location}`);
    console.log(`模型: ${model}\n`);
    
    try {
        // 尝试不同的初始化方式
        console.log('方式1: 标准 VertexAI 初始化');
        const vertexAI = new VertexAI({
            project: project,
            location: location,
        });

        const generativeModel = vertexAI.getGenerativeModel({
            model: model,
            generation_config: {
                max_output_tokens: 2048,
                temperature: 0.4,
            }
        });

        // 创建一个测试图片 - 小的PNG文件
        const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABYSURBVBiVY/z//z8DJQAggBhJMQAggBj+ExIACCBGUgwACCBGgABBQFAMIIAY/hMSAAgU5jEkJSUhq4MAQAAxkmIAQAAxAgQIioH1IasDAECg8J+QAEAA4c4AKMQAOH0AAAAASUVORK5CYII=';
        
        const prompt = '请描述这张图片，并建议如何改进它的颜色和构图';
        
        console.log('构建请求...');
        const request = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: prompt
                        },
                        {
                            inlineData: {
                                mimeType: 'image/png',
                                data: testImageBase64
                            }
                        }
                    ]
                }
            ]
        };

        console.log('发送请求到 gemini-2.5-flash-image-preview...');
        
        const result = await generativeModel.generateContent(request);
        
        console.log('✅ 请求成功！');
        console.log('响应结构:', {
            hasResponse: !!result.response,
            hasCandidates: !!result.response?.candidates,
            candidatesCount: result.response?.candidates?.length || 0
        });
        
        if (result.response?.candidates?.[0]?.content?.parts) {
            const parts = result.response.candidates[0].content.parts;
            console.log(`发现 ${parts.length} 个响应部分:`);
            
            parts.forEach((part, index) => {
                if (part.text) {
                    console.log(`Part ${index + 1} (文本):`, part.text.substring(0, 200) + '...');
                }
                if (part.inlineData) {
                    console.log(`Part ${index + 1} (图片):`, part.inlineData.mimeType, 'data length:', part.inlineData.data.length);
                }
            });
        }
        
    } catch (error) {
        console.log('❌ 测试失败');
        console.log('错误类型:', error.constructor.name);
        console.log('错误信息:', error.message);
        
        if (error.message.includes('HTML') || error.message.includes('<!DOCTYPE')) {
            console.log('\n🔍 分析：收到了HTML响应而不是JSON');
            console.log('可能的原因:');
            console.log('1. API端点不正确');
            console.log('2. 模型名称或区域配置有误');
            console.log('3. 认证问题');
            console.log('4. SDK版本问题');
        }
        
        if (error.stack) {
            console.log('\n完整堆栈:');
            console.log(error.stack);
        }
    }
    
    // 尝试方式2: 使用不同的端点或配置
    console.log('\n=== 尝试方式2: 检查其他可能的配置 ===');
    
    try {
        // 检查是否需要特定的 API 端点
        const vertexAI2 = new VertexAI({
            project: project,
            location: location,
            // 可能需要特定的端点配置
        });

        // 尝试只进行文本请求
        console.log('尝试纯文本请求...');
        const textModel = vertexAI2.getGenerativeModel({
            model: model,
        });
        
        const textResult = await textModel.generateContent({
            contents: [{
                role: 'user',
                parts: [{
                    text: '你好，这是一个测试消息'
                }]
            }]
        });
        
        console.log('✅ 纯文本请求成功！');
        console.log('响应:', textResult.response.candidates[0].content.parts[0].text.substring(0, 100) + '...');
        
    } catch (textError) {
        console.log('❌ 纯文本请求也失败');
        console.log('错误:', textError.message);
    }
}

testGlobalImageEdit().catch(error => {
    console.error('脚本执行失败:', error);
});