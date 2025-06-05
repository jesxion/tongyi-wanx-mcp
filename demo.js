#!/usr/bin/env node

/**
 * 通义万相MCP服务器功能演示
 * 演示图像存储和Resources功能
 */

import { spawn } from 'child_process';
import fs from 'fs';

console.log('🎨 通义万相MCP服务器功能演示\n');

// 确保图片目录存在
const imagesDir = './generated_images';
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
  console.log('📁 已创建图片存储目录:', imagesDir);
}

// 模拟一个存储的图片数据 (用于演示Resources功能)
const mockImageData = {
  id: 'demo123',
  filename: 'demo_image.png',
  localPath: './generated_images/demo_image.png',
  resourceUri: 'tongyi-wanx://images/demo123',
  originalUrl: 'https://example.com/demo.png',
  prompt: '一只可爱的小猫咪',
  timestamp: Date.now(),
  metadata: {
    model: 'wanx2.1-t2i-turbo',
    size: '1024*1024',
    task_id: 'task_demo_123'
  }
};

// 创建一个演示用的图片文件 (1x1像素的PNG)
const demoImageBuffer = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
  0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
]);

fs.writeFileSync(mockImageData.localPath, demoImageBuffer);
console.log('🖼️  已创建演示图片文件:', mockImageData.localPath);

async function sendMCPRequest(method, params) {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { 
        ...process.env, 
        DASHSCOPE_API_KEY: 'demo-key' 
      }
    });

    let response = '';
    server.stdout.on('data', (data) => {
      response += data.toString();
    });

    server.on('close', () => {
      try {
        if (response.trim()) {
          const result = JSON.parse(response.trim());
          resolve(result);
        } else {
          resolve(null);
        }
      } catch (e) {
        resolve({ error: 'Invalid response format' });
      }
    });

    // 发送请求
    const request = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: method,
      params: params
    };
    
    server.stdin.write(JSON.stringify(request) + '\n');
    server.stdin.end();

    // 超时处理
    setTimeout(() => {
      server.kill();
      resolve({ error: 'timeout' });
    }, 5000);
  });
}

async function demonstrateFeatures() {
  console.log('\n🔧 开始功能演示...\n');

  // 1. 展示工具列表
  console.log('1️⃣  工具列表:');
  const tools = await sendMCPRequest('tools/list', {});
  if (tools?.result?.tools) {
    tools.result.tools.forEach(tool => {
      console.log(`   ✅ ${tool.name}: ${tool.description.substring(0, 80)}...`);
    });
  }

  // 2. 展示Prompts
  console.log('\n2️⃣  提示词模板:');
  const prompts = await sendMCPRequest('prompts/list', {});
  if (prompts?.result?.prompts) {
    prompts.result.prompts.forEach(prompt => {
      console.log(`   📝 ${prompt.name}: ${prompt.description}`);
    });
  }

  // 3. 展示Resources (目前为空)
  console.log('\n3️⃣  图片资源列表:');
  const resources = await sendMCPRequest('resources/list', {});
  if (resources?.result?.resources) {
    if (resources.result.resources.length === 0) {
      console.log('   📁 暂无存储的图片资源 (需要实际生成图片后才会显示)');
    } else {
      resources.result.resources.forEach(resource => {
        console.log(`   🖼️  ${resource.name} (${resource.uri})`);
      });
    }
  }

  // 4. 展示模型信息
  console.log('\n4️⃣  支持的模型:');
  const models = await sendMCPRequest('tools/call', {
    name: 'get_supported_models',
    arguments: {}
  });
  if (models?.result?.content?.[0]?.text) {
    const modelData = JSON.parse(models.result.content[0].text);
    modelData.models.forEach(model => {
      console.log(`   🤖 ${model.name}: ${model.description}`);
    });
  }

  console.log('\n✨ 功能演示完成！\n');

  console.log('📋 使用说明:');
  console.log('• 设置环境变量: export DASHSCOPE_API_KEY="你的API密钥"');
  console.log('• 文生图: 使用 text_to_image 工具生成图片');
  console.log('• 查询任务: 使用 query_task 工具查询生成状态');
  console.log('• 图片存储: 生成的图片会自动下载并存储到本地');
  console.log('• 资源访问: 通过MCP Resources API访问存储的图片');
  console.log('• 提示词优化: 使用 optimize-prompt 模板优化提示词');

  console.log('\n🎯 核心特性:');
  console.log('✅ 自动下载并存储生成的图片');
  console.log('✅ 通过MCP Resources API暴露图片资源');
  console.log('✅ 支持3种高质量的通义万相模型');
  console.log('✅ 丰富的提示词模板和优化建议');
  console.log('✅ 完整的错误处理和状态管理');

  if (!process.env.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY === 'demo-key') {
    console.log('\n💡 要体验完整功能，请设置真实的 DASHSCOPE_API_KEY!');
  }
}

// 运行演示
demonstrateFeatures().catch(console.error);
