const { VertexAI } = require('@google-cloud/vertexai');
require('dotenv').config({ path: '../.env' });

async function testImageGeneration() {
    console.log('=== 测试 Gemini 2.5 Flash Image Preview 图片生成功能 ===\n');
    
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION; // global
    
    console.log(`项目: ${project}`);
    console.log(`地区: ${location}`);
    console.log('模型: gemini-2.5-flash-image-preview\n');
    
    const vertexAI = new VertexAI({
        project: project,
        location: location,
    });

    try {
        const model = vertexAI.getGenerativeModel({
            model: 'gemini-2.5-flash-image-preview',
            generation_config: {
                max_output_tokens: 2048,
                temperature: 0.8, // 图片生成通常需要较高的创造性
            }
        });

        console.log('测试1: 基本图片生成请求...');
        
        // 测试图片生成的 prompt
        const imagePrompt = "Generate an image of a beautiful sunset over a calm lake with mountains in the background";
        
        const result = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [{
                    text: imagePrompt
                }]
            }]
        });
        
        console.log('✅ 请求成功发送！');
        
        if (result && result.response && result.response.candidates && result.response.candidates.length > 0) {
            const candidate = result.response.candidates[0];
            console.log('\n📋 响应结构:');
            console.log('- Candidates:', result.response.candidates.length);
            console.log('- Parts:', candidate.content.parts.length);
            
            // 检查响应中的内容类型
            candidate.content.parts.forEach((part, index) => {
                console.log(`\nPart ${index + 1}:`);
                if (part.text) {
                    console.log('- 文本内容:', part.text.substring(0, 100) + '...');
                }
                if (part.inlineData) {
                    console.log('- 内联数据 (图片):', part.inlineData.mimeType);
                    console.log('- 数据大小:', part.inlineData.data.length, 'chars');
                    
                    // 保存生成的图片
                    const fs = require('fs');
                    const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                    const fileName = `generated_image_${Date.now()}.${part.inlineData.mimeType.split('/')[1]}`;
                    fs.writeFileSync(fileName, imageBuffer);
                    console.log('- 图片已保存:', fileName);
                }
                if (part.functionCall) {
                    console.log('- 函数调用:', part.functionCall);
                }
                if (part.functionResponse) {
                    console.log('- 函数响应:', part.functionResponse);
                }
            });
            
        } else {
            console.log('❌ 响应格式不符合预期');
            console.log('完整响应:', JSON.stringify(result, null, 2));
        }
        
    } catch (error) {
        console.log('❌ 图片生成测试失败');
        console.log('错误信息:', error.message);
        
        if (error.message.includes('HTML')) {
            console.log('\n可能的原因: global 区域的 API 端点问题');
            console.log('建议: 检查是否需要特殊的端点配置');
        } else if (error.message.includes('not found')) {
            console.log('\n可能的原因: 模型在当前配置下不可用');
        } else if (error.message.includes('permission')) {
            console.log('\n可能的原因: 权限不足或功能未启用');
        }
        
        console.log('\n完整错误:', error);
    }
    
    // 测试2: 尝试不同的API调用方式
    console.log('\n=== 测试2: 尝试不同的图片生成方式 ===');
    
    try {
        const model = vertexAI.getGenerativeModel({
            model: 'gemini-2.5-flash-image-preview',
            generation_config: {
                max_output_tokens: 2048,
                temperature: 0.8,
            }
        });

        // 尝试更明确的图片生成指令
        const explicitPrompt = "Please generate and show me an image of a red apple on a white background";
        
        const result2 = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [{
                    text: explicitPrompt
                }]
            }]
        });
        
        console.log('✅ 第二次请求成功！');
        console.log('响应:', JSON.stringify(result2.response, null, 2));
        
    } catch (error2) {
        console.log('❌ 第二次测试也失败:', error2.message);
    }
}

testImageGeneration().catch(error => {
    console.error('脚本执行失败:', error);
});