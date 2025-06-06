#!/usr/bin/env node

import { 
  Server
} from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import type {
  CallToolRequest,
  GetPromptRequest
} from "@modelcontextprotocol/sdk/types.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// 导入优化后的模块
import { Config } from './config.js';
import { Logger } from './logger.js';
import { TongyiError } from './errors.js';
import { ImageStorage, StoredImage } from './image-storage.js';
import { 
  TongyiWanxService, 
  TextToImageSchema, 
  QueryTaskSchema, 
  SUPPORTED_MODELS, 
  TASK_STATUS 
} from './tongyi-service.js';
import { 
  promptGuides, 
  getPromptGuideByCategory,
  isValidCategory 
} from './prompt-guides.js';

// 验证和初始化配置
try {
  Config.validate();
  Config.printInfo();
} catch (error) {
  Logger.error('配置验证失败', error);
  process.exit(1);
}

// 初始化服务实例
const imageStorage = new ImageStorage();
const tongyiService = new TongyiWanxService();

// 创建 MCP 服务器
const server = new Server(
  {
    name: "tongyi-wanx-mcp",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {},
    },
  }
);

Logger.info('通义万相 MCP 服务器启动中...');

// 注册工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
  Logger.debug('处理工具列表请求');
  
  return {
    tools: [
      {
        name: "text_to_image",
        description: "使用通义万相生成图像。支持中英文提示词，可生成各种风格的高质量图像。",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "正向提示词，用来描述生成图像中期望包含的元素和视觉特点。支持中英文，长度不超过800个字符。",
              maxLength: 800
            },
            model: {
              type: "string",
              enum: SUPPORTED_MODELS,
              default: "wanx2.1-t2i-turbo",
              description: "选择的模型版本。wanx2.1-t2i-turbo(速度快)、wanx2.1-t2i-plus(细节丰富)、wanx2.0-t2i-turbo(性价比高)"
            },
            negative_prompt: {
              type: "string",
              description: "反向提示词，描述不希望在图像中看到的内容。长度不超过500个字符。",
              maxLength: 500
            },
            size: {
              type: "string",
              pattern: "^\\d{3,4}\\*\\d{3,4}$",
              default: "1024*1024",
              description: "生成图像的分辨率，格式为 宽*高，如 1024*1024。像素范围 [512, 1440]"
            },
            n: {
              type: "integer",
              minimum: 1,
              maximum: 4,
              default: 1,
              description: "生成图片的数量，取值范围 1-4"
            },
            seed: {
              type: "integer",
              minimum: 0,
              maximum: 2147483647,
              description: "随机数种子，用于控制生成内容的随机性。相同种子生成相似图像"
            },
            prompt_extend: {
              type: "boolean",
              default: true,
              description: "是否开启提示词智能改写，可以优化较短的提示词"
            },
            watermark: {
              type: "boolean", 
              default: false,
              description: "是否添加 'AI生成' 水印标识"
            },
            wait_for_completion: {
              type: "boolean",
              default: true,
              description: "是否等待任务完成并返回图像URL。false时只返回任务ID"
            }
          },
          required: ["prompt"]
        }
      },
      {
        name: "query_task",
        description: "查询通义万相图像生成任务的状态和结果",
        inputSchema: {
          type: "object",
          properties: {
            task_id: {
              type: "string",
              description: "要查询的任务ID"
            }
          },
          required: ["task_id"]
        }
      },
      {
        name: "get_supported_models",
        description: "获取通义万相支持的模型列表及其说明",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: "get_service_status",
        description: "获取服务状态信息，包括测试模式状态、并发情况等",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: "get_image_stats",
        description: "获取图片存储统计信息",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: "search_images",
        description: "搜索本地存储的图片",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "搜索关键词，可匹配提示词或模型名称"
            }
          },
          required: ["query"]
        }
      }
    ],
  };
});

// 注册工具调用处理器
server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  try {
    Logger.info(`处理工具调用: ${request.params.name}`);
    
    switch (request.params.name) {
      case "text_to_image": {
        const params = TextToImageSchema.parse(request.params.arguments);
        const waitForCompletion = (request.params.arguments as any)?.wait_for_completion ?? true;
        
        Logger.info(`开始生成图像: ${params.prompt.substring(0, 50)}...`);
        
        // 创建任务
        const createResult = await tongyiService.createTextToImageTask(params);
        
        if (!waitForCompletion) {
          // 只返回任务ID，不等待完成
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  task_id: createResult.output.task_id,
                  task_status: createResult.output.task_status,
                  message: "任务已创建，请使用 query_task 工具查询任务状态和结果"
                }, null, 2)
              }
            ]
          };
        }
        
        // 等待任务完成
        const finalResult = await tongyiService.waitForTaskCompletion(createResult.output.task_id);
        
        if (finalResult.output.task_status === TASK_STATUS.SUCCEEDED) {
          const imageUrls = finalResult.output.results?.map(r => r.url).filter(Boolean) || [];
          const actualPrompts = finalResult.output.results?.map(r => r.actual_prompt).filter(Boolean) || [];
          
          // 下载并存储所有生成的图片
          const storedImages: StoredImage[] = [];
          for (const [index, url] of imageUrls.entries()) {
            if (!url) continue;
            
            try {
              const storedImage = await imageStorage.downloadAndStore(url, params.prompt, {
                model: params.model,
                size: params.size,
                task_id: createResult.output.task_id,
                actualPrompt: actualPrompts[index]
              });
              storedImages.push(storedImage);
              Logger.info(`图片存储成功: ${storedImage.filename}`);
            } catch (error) {
              Logger.error('图片存储失败', error);
              // 继续处理其他图片
            }
          }
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  task_id: finalResult.output.task_id,
                  task_status: finalResult.output.task_status,
                  image_resources: storedImages.length > 0 
                    ? storedImages.map(img => ({
                        resource_uri: img.resourceUri,
                        filename: img.filename,
                        local_path: img.localPath
                      }))
                    : undefined,
                  image_urls: storedImages.length === 0 ? imageUrls : undefined,
                  original_prompt: params.prompt,
                  actual_prompts: actualPrompts,
                  image_count: finalResult.usage?.image_count || storedImages.length,
                  submit_time: finalResult.output.submit_time,
                  end_time: finalResult.output.end_time,
                  message: storedImages.length > 0 
                    ? `成功生成并存储 ${storedImages.length} 张图像，可通过MCP Resources访问`
                    : `成功生成 ${imageUrls.length} 张图像`
                }, null, 2)
              }
            ]
          };
        } else {
          // 任务失败
          const errorMessage = finalResult.output.results?.[0]?.message || '任务执行失败';
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  task_id: finalResult.output.task_id,
                  task_status: finalResult.output.task_status,
                  error: errorMessage,
                  submit_time: finalResult.output.submit_time,
                  end_time: finalResult.output.end_time
                }, null, 2)
              }
            ]
          };
        }
      }

      case "query_task": {
        const params = QueryTaskSchema.parse(request.params.arguments);
        const result = await tongyiService.queryTask(params.task_id);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                task_id: result.output.task_id,
                task_status: result.output.task_status,
                submit_time: result.output.submit_time,
                end_time: result.output.end_time,
                results: result.output.results,
                usage: result.usage,
                task_metrics: result.output.task_metrics
              }, null, 2)
            }
          ]
        };
      }

      case "get_supported_models": {
        const models = tongyiService.getSupportedModels();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                supported_models: models,
                default_model: "wanx2.1-t2i-turbo"
              }, null, 2)
            }
          ]
        };
      }

      case "get_service_status": {
        const status = tongyiService.getServiceStatus();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                service_status: status,
                image_storage: imageStorage.getStats()
              }, null, 2)
            }
          ]
        };
      }

      case "get_image_stats": {
        const stats = imageStorage.getStats();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(stats, null, 2)
            }
          ]
        };
      }

      case "search_images": {
        const { query } = request.params.arguments as { query: string };
        const images = imageStorage.searchImages(query);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                query,
                total_found: images.length,
                images: images.map(img => ({
                  id: img.id,
                  filename: img.filename,
                  prompt: img.prompt,
                  timestamp: new Date(img.timestamp).toISOString(),
                  metadata: img.metadata,
                  resource_uri: img.resourceUri
                }))
              }, null, 2)
            }
          ]
        };
      }

      default:
        throw new TongyiError('UNKNOWN_TOOL', `未知的工具: ${request.params.name}`);
    }
  } catch (error) {
    Logger.error('工具调用失败', error);
    
    if (error instanceof TongyiError) {
      throw error.toMcpError();
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      `工具调用失败: ${error instanceof Error ? error.message : '未知错误'}`
    );
  }
});

// 注册 prompts 列表
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  Logger.debug('处理提示词列表请求');
  
  return {
    prompts: [
      {
        name: "prompt_guide_basic",
        description: "基础提示词编写指南和公式",
        arguments: []
      },
      {
        name: "prompt_guide_advanced", 
        description: "进阶提示词编写指南和技巧",
        arguments: []
      },
      {
        name: "prompt_examples_by_category",
        description: "按类别分类的提示词示例集合",
        arguments: [
          {
            name: "category",
            description: "提示词类别：shot_types(景别)、perspectives(视角)、lens_types(镜头)、styles(风格)、lighting(光线)",
            required: true
          }
        ]
      }
    ]
  };
});

// 注册 prompts 获取处理器
server.setRequestHandler(GetPromptRequestSchema, async (request: GetPromptRequest) => {
  Logger.debug(`处理提示词请求: ${request.params.name}`);
  
  switch (request.params.name) {
    case "prompt_guide_basic":
      return {
        description: promptGuides.basic_formula.description,
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `# ${promptGuides.basic_formula.name}\n\n${promptGuides.basic_formula.description}\n\n## 公式\n${promptGuides.basic_formula.formula}\n\n## 示例\n${promptGuides.basic_formula.example}`
            }
          }
        ]
      };

    case "prompt_guide_advanced":
      return {
        description: promptGuides.advanced_formula.description,
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `# ${promptGuides.advanced_formula.name}\n\n${promptGuides.advanced_formula.description}\n\n## 公式\n${promptGuides.advanced_formula.formula}\n\n## 示例\n${promptGuides.advanced_formula.example}`
            }
          }
        ]
      };    case "prompt_examples_by_category":
      const category = request.params.arguments?.category as string;
      const categoryData = getPromptGuideByCategory(category);
      
      if (!categoryData || !isValidCategory(category)) {
        throw new McpError(ErrorCode.InvalidParams, `无效的类别: ${category}`);
      }

      const examples = Object.entries(categoryData.types || {})
        .map(([key, value]) => `**${key}**: ${value}`)
        .join('\n\n');

      return {
        description: `${categoryData.name} - ${categoryData.description}`,
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `# ${categoryData.name}\n\n${categoryData.description}\n\n${examples}`
            }
          }
        ]
      };

    default:
      throw new McpError(ErrorCode.InvalidParams, `未知的提示词: ${request.params.name}`);
  }
});

// 注册资源列表
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  Logger.debug('处理资源列表请求');
  
  const images = imageStorage.getAllImages();
  
  return {
    resources: images.map(image => ({
      uri: image.resourceUri,
      name: image.filename,
      description: `AI生成图像: ${image.prompt.substring(0, 100)}...`,
      mimeType: `image/${image.filename.split('.').pop()}`
    }))
  };
});

// 注册资源读取
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  Logger.debug(`处理资源读取请求: ${request.params.uri}`);
  
  const image = imageStorage.getImageByResourceUri(request.params.uri);
  if (!image) {
    throw new McpError(ErrorCode.InvalidParams, `资源未找到: ${request.params.uri}`);
  }

  try {
    const fs = await import('fs');
    const imageData = fs.readFileSync(image.localPath);
    const base64Data = imageData.toString('base64');
    
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: `image/${image.filename.split('.').pop()}`,
          text: base64Data
        }
      ]
    };
  } catch (error) {
    Logger.error('读取图片文件失败', error);
    throw new McpError(ErrorCode.InternalError, `无法读取图片文件: ${image.filename}`);
  }
});

// 优雅关闭处理
process.on('SIGINT', () => {
  Logger.info('收到 SIGINT 信号，开始优雅关闭...');
  
  imageStorage.destroy();
  tongyiService.destroy();
  
  Logger.info('服务已关闭');
  process.exit(0);
});

process.on('SIGTERM', () => {
  Logger.info('收到 SIGTERM 信号，开始优雅关闭...');
  
  imageStorage.destroy();
  tongyiService.destroy();
  
  Logger.info('服务已关闭');
  process.exit(0);
});

// 启动服务器
async function main() {
  try {
    const transport = process.env.MCP_TRANSPORT || 'stdio';
    
    if (transport === 'stdio') {
      const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
      const transport = new StdioServerTransport();
      await server.connect(transport);
    } else {
      throw new Error(`不支持的传输方式: ${transport}`);
    }
    
    Logger.info('通义万相 MCP 服务器已启动并准备接收请求');
  } catch (error) {
    Logger.error('服务器启动失败', error);
    process.exit(1);
  }
}

// 启动应用
main().catch(error => {
  Logger.error('应用启动失败', error);
  process.exit(1);
});
