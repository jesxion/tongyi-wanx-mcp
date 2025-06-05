#!/usr/bin/env node

/**
 * 测试通义万相MCP服务器的基本功能
 */

import { spawn } from 'child_process';
import fs from 'fs';

// 创建测试用的图片目录
const imagesDir = './generated_images';
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
  console.log('📁 已创建图片存储目录:', imagesDir);
}

// 模拟MCP客户端请求
function sendMCPRequest(method, params) {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { 
        ...process.env, 
        DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY || 'test-key' 
      }
    });

    let response = '';
    let hasResponse = false;

    server.stdout.on('data', (data) => {
      response += data.toString();
    });

    server.on('close', (code) => {
      if (!hasResponse) {
        try {
          // 解析响应中的JSON行
          const lines = response.trim().split('\n').filter(line => line.trim());
          const results = [];
          
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              results.push(parsed);
            } catch (e) {
              // 忽略非JSON行 (如日志输出)
            }
          }
          
          resolve(results);
        } catch (e) {
          reject(e);
        }
      }
    });

    // 设置超时
    setTimeout(() => {
      if (!hasResponse) {
        hasResponse = true;
        server.kill();
        resolve([]);
      }
    }, 5000);

    // 发送请求
    const request = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: method,
      params: params
    };
    
    server.stdin.write(JSON.stringify(request) + '\n');
    
    // 等待一点时间让服务器处理请求
    setTimeout(() => {
      hasResponse = true;
      server.kill();
    }, 2000);
  });
}

async function testBasicFunctionality() {
  console.log('🧪 开始测试通义万相MCP服务器基本功能...\n');

  try {
    // 1. 测试获取工具列表
    console.log('1. 测试工具列表...');
    const tools = await sendMCPRequest('tools/list', {});
    
    if (tools.length > 0 && tools[0].result) {
      const toolList = tools[0].result.tools;
      console.log(`✅ 获取到 ${toolList.length} 个工具:`);
      toolList.forEach(tool => {
        console.log(`   - ${tool.name}: ${tool.description}`);
      });
    } else {
      console.log('⚠️  工具列表响应格式异常');
    }
    
    // 2. 测试获取Prompts列表
    console.log('\n2. 测试Prompts列表...');
    const prompts = await sendMCPRequest('prompts/list', {});
    
    if (prompts.length > 0 && prompts[0].result) {
      const promptList = prompts[0].result.prompts;
      console.log(`✅ 获取到 ${promptList.length} 个Prompt:`);
      promptList.forEach(prompt => {
        console.log(`   - ${prompt.name}: ${prompt.description}`);
      });
    } else {
      console.log('⚠️  Prompts列表响应格式异常');
    }
    
    // 3. 测试Resources列表
    console.log('\n3. 测试Resources列表...');
    const resources = await sendMCPRequest('resources/list', {});
    
    if (resources.length > 0 && resources[0].result) {
      const resourceList = resources[0].result.resources;
      console.log(`✅ 获取到 ${resourceList.length} 个Resource`);
      if (resourceList.length > 0) {
        resourceList.forEach(resource => {
          console.log(`   - ${resource.uri}: ${resource.name}`);
        });
      } else {
        console.log('   (初始状态，暂无存储的图片资源)');
      }
    } else {
      console.log('⚠️  Resources列表响应格式异常');
    }

    // 4. 测试获取支持的模型
    console.log('\n4. 测试获取支持的模型...');
    const models = await sendMCPRequest('tools/call', {
      name: 'get_supported_models',
      arguments: {}
    });
    
    if (models.length > 0 && models[0].result) {
      console.log('✅ 支持的模型信息获取成功');
    } else {
      console.log('⚠️  模型信息响应格式异常');
    }

    console.log('\n🎉 基本功能测试完成！');
    
    if (process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_API_KEY !== 'test-key') {
      console.log('\n💡 您已设置API Key，可以尝试实际的图像生成功能。');
      console.log('   使用以下命令测试图像生成:');
      console.log('   node quick-test.js');
    } else {
      console.log('\n💡 如需测试实际的图像生成功能，请设置 DASHSCOPE_API_KEY 环境变量。');
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  }
}

// 运行测试
testBasicFunctionality();
