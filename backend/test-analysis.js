require('dotenv').config({ path: '../.env' }); // 指向正确的.env路径
const vertexAIService = require('./services/vertexAI'); // 导入的是实例

// 创建一个小测试图片（1x1像素的PNG）
const createTestImage = () => {
  // 最小的PNG图片数据（1x1像素，透明）
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // width=1, height=1
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, // bit depth=8, color type=6, etc.
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, // IDAT chunk header
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, // compressed data
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, // chunk data + CRC
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, // IEND chunk
    0x42, 0x60, 0x82
  ]);
  
  return {
    originalname: 'test.png',
    mimetype: 'image/png',
    buffer: pngData,
    size: pngData.length
  };
};

async function testImageAnalysis() {
  console.log('🧪 开始测试图片分析功能...');
  
  try {
    const testImage = createTestImage();
    
    console.log(`📊 测试图片信息: ${testImage.originalname} (${testImage.mimetype}, ${testImage.size} bytes)`);
    
    const result = await vertexAIService.analyzeImage(testImage.buffer, testImage.mimetype);
    
    console.log('🎯 测试结果:');
    console.log('Success:', result.success);
    if (result.success) {
      console.log('Analysis length:', result.analysis?.length);
      console.log('Analysis preview:', result.analysis?.substring(0, 200) + '...');
    } else {
      console.log('Error:', result.error);
      console.log('Retryable:', result.retryable);
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
testImageAnalysis();