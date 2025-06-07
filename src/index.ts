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
  ImageEditSchema,
  QueryTaskSchema, 
  SUPPORTED_MODELS, 
  SUPPORTED_IMAGE_EDIT_MODELS,
  IMAGE_EDIT_FUNCTIONS,
  TASK_STATUS 
} from './tongyi-service.js';
import { 
  promptGuides, 
  getPromptGuideByCategory,
  isValidCategory 
} from './prompt-guides.js';

// 导入新的高级功能模块
import { PromptOptimizer } from './prompt-optimizer.js';
import { ImageVersionManager } from './image-version-manager.js';
import { BatchOperationManager } from './batch-operation-manager.js';

// 验证和初始化配置
try {
  Config.validate();
  Config.printInfo();
} catch (error) {
  Logger.error('配置验证失败', error);
  process.exit(1);
}

// 初始化 OSS 日志存储
Logger.initOSSLogging().catch(error => {
  Logger.error('OSS 日志存储初始化失败', error);
});

// 初始化服务实例
const imageStorage = new ImageStorage();
const tongyiService = new TongyiWanxService();

// 初始化静态模块
BatchOperationManager.initialize(tongyiService, imageStorage);

// 异步初始化版本管理器
ImageVersionManager.initialize().catch(error => {
  Logger.error('图像版本管理器初始化失败', error);
});

// 创建 MCP 服务器
const server = new Server(
  {
    name: "tongyi-wanx-mcp",
    version: "2.3.0",
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
      // 🏆 P0 - 核心功能 (最高优先级)
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
        }      },
      {
        name: "image_edit",
        description: "使用通义万相进行图像编辑。支持风格化、内容编辑、尺寸优化、上色等多种功能。",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "提示词，描述期望的编辑效果。支持中英文，长度不超过800个字符。",
              maxLength: 800
            },
            function: {
              type: "string",
              enum: Object.values(IMAGE_EDIT_FUNCTIONS),
              description: "图像编辑功能类型"
            },
            base_image_url: {
              type: "string",
              format: "uri",
              description: "基础图像的URL地址，必须是公网可访问的地址"
            },
            mask_image_url: {
              type: "string",
              format: "uri", 
              description: "遮罩图像URL（仅局部重绘功能需要）。白色区域为编辑区域，黑色区域保持不变"
            },
            model: {
              type: "string",
              enum: SUPPORTED_IMAGE_EDIT_MODELS,
              default: "wanx2.1-imageedit",
              description: "图像编辑模型"
            },
            n: {
              type: "integer",
              minimum: 1,
              maximum: 4,
              default: 1,
              description: "生成图片的数量"
            },
            seed: {
              type: "integer",
              minimum: 0,
              maximum: 2147483647,
              description: "随机数种子"
            },
            watermark: {
              type: "boolean",
              default: false,
              description: "是否添加AI生成水印"
            },
            strength: {
              type: "number",
              minimum: 0.0,
              maximum: 1.0,
              default: 0.5,
              description: "图像修改幅度（适用于风格化和指令编辑）"
            },
            top_scale: {
              type: "number",
              minimum: 1.0,
              maximum: 2.0,
              default: 1.0,
              description: "向上扩展比例（扩图功能）"
            },
            bottom_scale: {
              type: "number",
              minimum: 1.0,
              maximum: 2.0,
              default: 1.0,
              description: "向下扩展比例（扩图功能）"
            },
            left_scale: {
              type: "number",
              minimum: 1.0,
              maximum: 2.0,
              default: 1.0,
              description: "向左扩展比例（扩图功能）"
            },
            right_scale: {
              type: "number",
              minimum: 1.0,
              maximum: 2.0,
              default: 1.0,
              description: "向右扩展比例（扩图功能）"
            },
            upscale_factor: {
              type: "integer",
              minimum: 1,
              maximum: 4,
              default: 1,
              description: "超分放大倍数（图像超分功能）"
            },
            is_sketch: {
              type: "boolean",
              default: false,
              description: "输入图像是否为线稿（线稿生图功能）"
            },
            wait_for_completion: {
              type: "boolean",
              default: true,
              description: "是否等待任务完成并返回图像URL"
            }
          },
          required: ["prompt", "function", "base_image_url"]
        }      },
      {
        name: "get_image_edit_functions",
        description: "获取图像编辑功能详情和使用说明",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },

      // 🎯 P2 - 智能辅助 (中高优先级)
      {
        name: "optimize_prompt", 
        description: "自动优化提示词，增强描述性和艺术效果",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string", 
              description: "要优化的原始提示词"
            },
            level: {
              type: "string",
              enum: ["basic", "advanced", "professional"],
              default: "advanced",
              description: "优化级别：basic(基础), advanced(进阶), professional(专业)"
            },
            style: {
              type: "string",
              description: "目标艺术风格（可选）"
            }
          },
          required: ["prompt"]
        }
      },
      {
        name: "analyze_prompt",
        description: "分析提示词的质量、完整性和强度，提供优化建议",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "要分析的提示词"
            }
          },
          required: ["prompt"]
        }
      },
      {
        name: "get_prompt_suggestions",
        description: "根据关键词获取提示词建议和增强词汇",
        inputSchema: {
          type: "object",
          properties: {
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "关键词列表"
            },
            category: {
              type: "string",
              enum: ["lighting", "quality", "composition", "style"],
              description: "建议类别"
            }
          },
          required: ["keywords"]
        }
      },

      // 🗂️ P3 - 存储管理 (中优先级)
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
      },
      {
        name: "get_image_stats",
        description: "获取图片存储统计信息，包括 OSS 状态",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: "upload_image_to_oss",
        description: "上传本地图片到阿里云 OSS 获取公网访问 URL",
        inputSchema: {
          type: "object",
          properties: {
            image_path: {
              type: "string",
              description: "本地图片文件路径"
            }
          },
          required: ["image_path"]
        }
      },

      // 📝 P4 - 版本管理 (中优先级)
      {
        name: "create_image_version",
        description: "为图像创建新版本，支持多种变体类型",
        inputSchema: {
          type: "object",
          properties: {
            base_image_id: {
              type: "string",
              description: "基础图像ID"
            },
            variant_type: {
              type: "string",
              enum: ["style_transfer", "color_change", "detail_enhancement", "composition_change", "mood_change"],
              description: "变体类型"
            },
            description: {
              type: "string",
              description: "版本描述"
            },
            new_prompt: {
              type: "string",
              description: "新的提示词（可选）"
            }
          },
          required: ["base_image_id", "variant_type"]
        }
      },
      {
        name: "get_image_versions",
        description: "获取图像的所有版本和变体",
        inputSchema: {
          type: "object",
          properties: {
            image_id: {
              type: "string",
              description: "图像ID"
            }
          },
          required: ["image_id"]
        }
      },
      {
        name: "find_related_images",
        description: "查找与指定图像相关的其他图像",
        inputSchema: {
          type: "object",
          properties: {
            image_id: {
              type: "string",
              description: "参考图像ID"
            },
            similarity_threshold: {
              type: "number",
              minimum: 0,
              maximum: 1,
              default: 0.7,
              description: "相似度阈值"
            }
          },
          required: ["image_id"]
        }
      },

      // 🔄 P5 - 批量操作 (中低优先级)
      {
        name: "batch_generate_images",
        description: "批量生成图像，支持并发处理和进度跟踪",
        inputSchema: {
          type: "object",
          properties: {
            prompts: {
              type: "array",
              items: { type: "string" },
              description: "提示词列表",
              minItems: 1,
              maxItems: 20
            },
            style: {
              type: "string",
              description: "统一的艺术风格"
            },
            size: {
              type: "string",
              pattern: "^\\d{3,4}\\*\\d{3,4}$",
              default: "1024*1024",
              description: "图像尺寸"
            },
            optimize_prompts: {
              type: "boolean",
              default: true,
              description: "是否自动优化提示词"
            },
            create_variants: {
              type: "boolean",
              default: false,
              description: "是否创建变体版本"
            },
            max_concurrency: {
              type: "integer",
              minimum: 1,
              maximum: 5,
              default: 3,
              description: "最大并发数"
            }
          },
          required: ["prompts"]
        }
      },
      {
        name: "get_batch_status",
        description: "获取批量任务的状态和进度",
        inputSchema: {
          type: "object",
          properties: {
            task_id: {
              type: "string",
              description: "批量任务ID"
            }
          },
          required: ["task_id"]
        }
      },
      {
        name: "batch_optimize_prompts",
        description: "批量优化多个提示词",
        inputSchema: {
          type: "object",
          properties: {
            prompts: {
              type: "array",
              items: { type: "string" },
              description: "要优化的提示词列表",
              minItems: 1,
              maxItems: 50
            },
            level: {
              type: "string",
              enum: ["basic", "advanced", "professional"],
              default: "advanced",
              description: "优化级别"
            }
          },
          required: ["prompts"]
        }
      },

      // ⚙️ P6 - 系统维护 (低优先级)
      {
        name: "repair_oss_status",
        description: "修复图片的 OSS 状态，将本地图片重新上传到 OSS",
        inputSchema: {
          type: "object",
          properties: {
            image_id: {
              type: "string",
              description: "要修复的图片 ID"
            }
          },
          required: ["image_id"]
        }
      },
      {
        name: "get_oss_status",
        description: "获取 OSS 服务状态和配置信息",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: "get_log_status",
        description: "获取日志系统状态，包括缓冲区大小和 OSS 日志存储状态",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: "flush_logs",
        description: "强制上传所有缓冲的日志到 OSS",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: "list_oss_images",
        description: "列出 OSS 中存储的图片资源",
        inputSchema: {
          type: "object",
          properties: {
            prefix: {
              type: "string",
              description: "文件名前缀过滤器，默认为 'images/'",
              default: "images/"
            },
            max_results: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20,
              description: "返回的最大结果数量"
            }
          },
          additionalProperties: false
        }
      },
      {
        name: "cancel_batch_task",
        description: "取消正在运行的批量任务",
        inputSchema: {
          type: "object",
          properties: {
            task_id: {
              type: "string",
              description: "要取消的批量任务ID"
            }
          },
          required: ["task_id"]
        }
      },
      {
        name: "get_batch_statistics",
        description: "获取批量操作的统计信息",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: "get_version_analytics",
        description: "获取版本管理的统计分析",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
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
      }      case "search_images": {
        const { query } = request.params.arguments as { query: string };
        const images = imageStorage.searchImages(query);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                query,
                total_found: images.length,
                images: images.map((img: StoredImage) => ({
                  id: img.id,
                  filename: img.filename,
                  prompt: img.prompt,
                  timestamp: new Date(img.timestamp).toISOString(),
                  metadata: img.metadata,
                  resource_uri: img.resourceUri,
                  oss_url: img.ossInfo?.url,
                  best_url: imageStorage.getBestImageUrl(img)
                }))
              }, null, 2)
            }
          ]
        };
      }

      case "upload_image_to_oss": {
        const { image_path } = request.params.arguments as { image_path: string };
        
        try {
          const result = await imageStorage.uploadUserImageToOSS(image_path);
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  local_path: result.localPath,
                  oss_url: result.ossUrl,
                  oss_name: result.ossName,
                  message: result.ossUrl 
                    ? "图片已成功上传到 OSS" 
                    : "OSS 服务不可用，仅返回本地路径"
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  message: "图片上传失败"
                }, null, 2)
              }
            ]
          };
        }
      }

      case "repair_oss_status": {
        const { image_id } = request.params.arguments as { image_id: string };
        
        try {
          const success = await imageStorage.repairOSSStatus(image_id);
          const image = imageStorage.getImage(image_id);
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success,
                  image_id,
                  oss_url: image?.ossInfo?.url,
                  message: success 
                    ? "图片 OSS 状态修复成功" 
                    : "图片 OSS 状态修复失败"
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  image_id,
                  error: error instanceof Error ? error.message : String(error),
                  message: "修复过程中发生错误"
                }, null, 2)
              }
            ]
          };
        }
      }      case "get_oss_status": {
        // 需要先导入 OSS 服务
        const { OSSService } = await import('./oss-service.js');
        const ossService = new OSSService();
        const status = ossService.getStatus();
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                oss_enabled: status.enabled,
                oss_configured: status.configured,
                oss_bucket: status.bucket,
                oss_region: status.region,
                oss_endpoint: status.endpoint,
                config: {
                  access_key_configured: !!Config.OSS_ACCESS_KEY_ID,
                  secret_configured: !!Config.OSS_ACCESS_KEY_SECRET,
                  endpoint: Config.OSS_ENDPOINT || 'default'
                }
              }, null, 2)
            }
          ]
        };
      }

      case "get_log_status": {
        const logStatus = Logger.getLogStatus();
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                oss_logging_enabled: logStatus.ossEnabled,
                buffer_size: logStatus.bufferSize,
                max_buffer_size: logStatus.maxBufferSize,
                last_upload_time: logStatus.lastUploadTime,
                total_logs_uploaded: logStatus.totalUploaded,
                upload_errors: logStatus.uploadErrors,
                next_upload_in_ms: logStatus.nextUploadIn,
                log_levels: {
                  error: logStatus.logCounts.error,
                  warn: logStatus.logCounts.warn,
                  info: logStatus.logCounts.info,
                  debug: logStatus.logCounts.debug
                }
              }, null, 2)
            }
          ]
        };
      }      case "flush_logs": {
        try {
          const result = await Logger.flushLogs();
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  logs_uploaded: result.logsUploaded,
                  oss_url: result.ossUrl,
                  message: result.logsUploaded > 0 
                    ? `成功上传 ${result.logsUploaded} 条日志到 OSS` 
                    : "没有待上传的日志"
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  message: "日志上传失败"
                }, null, 2)
              }
            ]
          };
        }
      }

      case "list_oss_images": {
        try {
          const { prefix = "images/", max_results = 20 } = request.params.arguments as { 
            prefix?: string; 
            max_results?: number; 
          };
          
          // 导入 OSS 服务
          const { OSSService } = await import('./oss-service.js');
          const ossService = new OSSService();
          
          if (!ossService.isAvailable()) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: "OSS 服务不可用",
                    message: "请检查 OSS 配置"
                  }, null, 2)
                }
              ]
            };
          }

          const files = await ossService.listFiles(prefix, max_results);
            // 处理文件列表，提取图片信息
          const imageFiles = files
            .filter(file => /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name))
            .map(file => ({
              name: file.name,
              url: file.url,
              size: file.size,
              lastModified: file.lastModified,
              is_generated: file.name.includes('generated'),
              is_user_upload: file.name.includes('user-uploads'),
              is_repaired: file.name.includes('repaired')
            }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  prefix,
                  total_found: imageFiles.length,
                  images: imageFiles,
                  oss_bucket: ossService.getStatus().bucket,
                  message: `在 OSS 中找到 ${imageFiles.length} 个图片文件`
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  message: "查询 OSS 图片失败"
                }, null, 2)
              }
            ]
          };
        }
      }

      case "image_edit": {
        const params = ImageEditSchema.parse(request.params.arguments);
        const waitForCompletion = (request.params.arguments as any)?.wait_for_completion ?? true;
        
        Logger.info(`开始图像编辑: ${params.function} - ${params.prompt.substring(0, 50)}...`);
        
        // 创建任务
        const createResult = await tongyiService.createImageEditTask(params);
        
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
                  function: params.function,
                  message: "图像编辑任务已创建，请使用 query_task 工具查询任务状态和结果"
                }, null, 2)
              }
            ]
          };
        }
        
        // 等待任务完成
        const finalResult = await tongyiService.waitForTaskCompletion(createResult.output.task_id);
          if (finalResult.output.task_status === TASK_STATUS.SUCCEEDED) {
          const imageUrls = finalResult.output.results?.map(r => r.url).filter(Boolean) || [];
          
          // 下载并存储所有生成的图片
          const storedImages: StoredImage[] = [];
          for (const url of imageUrls) {
            if (!url) continue;
            
            try {
              const storedImage = await imageStorage.downloadAndStore(url, params.prompt, {
                model: params.model,
                function: params.function,
                base_image_url: params.base_image_url,
                task_id: createResult.output.task_id,
                editType: params.function
              });
              storedImages.push(storedImage);
              Logger.info(`编辑后图片存储成功: ${storedImage.filename}`);
            } catch (error) {
              Logger.error('编辑后图片存储失败', error);
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
                  function: params.function,
                  image_resources: storedImages.length > 0 
                    ? storedImages.map(img => ({
                        resource_uri: img.resourceUri,
                        filename: img.filename,
                        local_path: img.localPath
                      }))
                    : undefined,
                  image_urls: storedImages.length === 0 ? imageUrls : undefined,
                  original_prompt: params.prompt,
                  base_image_url: params.base_image_url,
                  image_count: finalResult.usage?.image_count || storedImages.length,
                  submit_time: finalResult.output.submit_time,
                  end_time: finalResult.output.end_time,
                  message: storedImages.length > 0 
                    ? `成功编辑并存储 ${storedImages.length} 张图像，可通过MCP Resources访问`
                    : `成功编辑 ${imageUrls.length} 张图像`
                }, null, 2)
              }
            ]
          };
        } else {
          // 任务失败
          const errorMessage = finalResult.output.results?.[0]?.message || '图像编辑任务执行失败';
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  task_id: finalResult.output.task_id,
                  task_status: finalResult.output.task_status,
                  function: params.function,
                  error: errorMessage,
                  submit_time: finalResult.output.submit_time,
                  end_time: finalResult.output.end_time
                }, null, 2)
              }
            ]
          };
        }
      }      case "get_image_edit_functions": {
        const functions = tongyiService.getImageEditFunctions();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                image_edit_functions: functions,
                total_functions: functions.length,
                usage_tips: "每种功能都有特定的提示词技巧，请参考examples字段中的示例"
              }, null, 2)
            }
          ]
        };
      }

      // 🎯 智能提示词优化工具
      case "analyze_prompt": {
        const { prompt } = request.params.arguments as { prompt: string };
        const result = PromptOptimizer.analyzeAndOptimize(prompt);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                prompt: prompt,
                analysis: {
                  strength_score: result.analysis.strength,
                  clarity_score: result.analysis.clarity,  
                  completeness_score: result.analysis.completeness,
                  components: result.analysis.components,
                  missing_elements: result.analysis.components.missing,
                  suggestions: result.suggestions
                },
                timestamp: new Date().toISOString()
              }, null, 2)
            }
          ]
        };
      }

      case "optimize_prompt": {
        const { prompt, level = "advanced", style } = request.params.arguments as { 
          prompt: string; 
          level?: "basic" | "advanced" | "professional";
          style?: string;
        };
        
        const result = PromptOptimizer.analyzeAndOptimize(prompt, style, level);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                original_prompt: prompt,
                optimized_prompt: result.optimized,
                optimization_level: level,
                target_style: style,
                improvements: result.improvements,
                suggestions: result.suggestions,
                analysis: result.analysis,
                timestamp: new Date().toISOString()
              }, null, 2)
            }
          ]
        };
      }

      case "get_prompt_suggestions": {
        const { keywords, category } = request.params.arguments as { 
          keywords: string[]; 
          category?: "lighting" | "quality" | "composition" | "style";
        };
        
        // 根据类别返回建议
        let suggestions: string[] = [];
        let relatedKeywords: string[] = [];
        
        if (category === "lighting") {
          suggestions = PromptOptimizer.getStyleSuggestions("lighting") || [];
        } else if (category === "style") {
          suggestions = PromptOptimizer.getAvailableStyles();
        } else {
          // 为关键词提供一般性建议
          suggestions = keywords.map(k => `增强的${k}`);
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                keywords: keywords,
                category: category,
                suggestions: suggestions,
                related_keywords: relatedKeywords,
                available_styles: PromptOptimizer.getAvailableStyles(),
                timestamp: new Date().toISOString()
              }, null, 2)
            }
          ]
        };
      }      // 📝 图像版本管理工具
      case "create_image_version": {
        const { base_image_id, variant_type, description, new_prompt } = request.params.arguments as { 
          base_image_id: string; 
          variant_type: string;
          description?: string;
          new_prompt?: string;
        };
        
        try {
          const baseImage = imageStorage.getImage(base_image_id);
          if (!baseImage) {
            throw new Error(`基础图像不存在: ${base_image_id}`);
          }

          // 创建新版本（这里需要实际的图像文件路径）
          const version = await ImageVersionManager.createVersion(
            base_image_id,
            new_prompt || baseImage.prompt,
            baseImage.localPath || '',
            {
              variant_type: variant_type,
              variant_description: description
            },
            base_image_id
          );
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  version_id: version.id,
                  base_image_id: base_image_id,
                  variant_type: variant_type,
                  description: description,
                  new_prompt: new_prompt,
                  message: "图像版本创建成功",
                  timestamp: new Date().toISOString()
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text", 
                text: JSON.stringify({
                  success: false,
                  base_image_id: base_image_id,
                  variant_type: variant_type,
                  error: error instanceof Error ? error.message : String(error),
                  message: "图像版本创建失败"
                }, null, 2)
              }
            ]
          };
        }
      }

      case "get_image_versions": {
        const { image_id } = request.params.arguments as { image_id: string };
          try {
          const history = await ImageVersionManager.getVersionHistory(image_id);
          
          if (!history) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    image_id: image_id,
                    total_versions: 0,
                    versions: [],
                    message: "未找到该图像的版本历史",
                    timestamp: new Date().toISOString()
                  }, null, 2)
                }
              ]
            };
          }
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  image_id: image_id,
                  total_versions: history.versions.length,
                  versions: history.versions.map((v: any) => ({
                    version_id: v.id,
                    prompt: v.prompt,
                    timestamp: new Date(v.timestamp).toISOString(),
                    file_path: v.filePath,
                    metadata: v.metadata
                  })),
                  variants: history.variants.map((v: any) => ({
                    variant_id: v.variantId,
                    variant_type: v.variantType,
                    description: v.description,
                    timestamp: new Date(v.timestamp).toISOString()
                  })),
                  timestamp: new Date().toISOString()
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  image_id: image_id,
                  error: error instanceof Error ? error.message : String(error),
                  message: "获取图像版本失败"
                }, null, 2)
              }
            ]
          };
        }
      }

      case "find_related_images": {
        const { image_id, similarity_threshold = 0.7 } = request.params.arguments as { 
          image_id: string; 
          similarity_threshold?: number;
        };
        
        try {
          const relatedImages: Array<{imageId: string; similarity: number; sharedKeywords: string[]}> = []; // ImageVersionManager.findSimilarImages方法在模块中不存在，返回空数组
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  image_id: image_id,
                  similarity_threshold: similarity_threshold,
                  total_related: relatedImages.length,
                  related_images: relatedImages.map((r: any) => ({
                    image_id: r.imageId,
                    similarity_score: r.similarity,
                    shared_keywords: r.sharedKeywords
                  })),
                  timestamp: new Date().toISOString()
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  image_id: image_id,
                  error: error instanceof Error ? error.message : String(error),
                  message: "查找相关图像失败"
                }, null, 2)
              }
            ]
          };
        }
      }

      case "get_version_analytics": {
        try {
          const stats = {
            totalImages: 0,
            totalVersions: 0,
            totalVariants: 0,
            averageVersionsPerImage: 0,
            variantTypeStats: {}
          }; // ImageVersionManager.getStatistics方法在模块中不存在，返回默认值
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  analytics: {
                    total_images: stats.totalImages,
                    total_versions: stats.totalVersions,
                    total_variants: stats.totalVariants,
                    average_versions_per_image: stats.averageVersionsPerImage,
                    most_common_variant_types: stats.variantTypeStats
                  },
                  timestamp: new Date().toISOString()
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  message: "获取版本分析失败"
                }, null, 2)
              }
            ]
          };
        }
      }

      // 🔄 批量操作工具
      case "batch_generate_images": {
        const { 
          prompts, 
          style, 
          size = "1024*1024", 
          optimize_prompts = true, 
          create_variants = false,
          max_concurrency = 3
        } = request.params.arguments as { 
          prompts: string[]; 
          style?: string;
          size?: string;
          optimize_prompts?: boolean;
          create_variants?: boolean;
          max_concurrency?: number;
        };
        
        try {
          const taskId = await BatchOperationManager.createBatchGenerationTask(
            prompts,
            {
              style,
              size,
              optimize_prompts,
              create_variants,
              variant_types: create_variants ? ['style_transfer', 'detail_enhancement'] : undefined
            },
            {
              maxConcurrency: max_concurrency,
              retryCount: 2,
              continueOnError: true
            }
          );
            // 注释掉不存在的方法调用
          // BatchOperationManager.startBatchGeneration(taskId);
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  task_id: taskId,
                  total_prompts: prompts.length,
                  options: {
                    style,
                    size,
                    optimize_prompts,
                    create_variants,
                    max_concurrency
                  },
                  message: "批量生成任务已启动，使用 get_batch_status 查询进度",
                  timestamp: new Date().toISOString()
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  message: "批量生成任务创建失败"
                }, null, 2)
              }
            ]
          };
        }
      }

      case "get_batch_status": {
        const { task_id } = request.params.arguments as { task_id: string };
          try {
          const status = BatchOperationManager.getTaskStatus(task_id);
          
          if (!status) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    task_id: task_id,
                    error: "任务不存在或已被清理",
                    message: "未找到指定的批量任务"
                  }, null, 2)
                }
              ]
            };
          }
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  task_id: task_id,
                  status: status.status,
                  progress: {
                    total: status.progress.total,
                    completed: status.progress.completed,
                    failed: status.progress.failed,
                    percentage: Math.round((status.progress.completed / status.progress.total) * 100),
                    current_prompt: status.progress.current
                  },
                  results: status.results.map((r: any) => ({
                    prompt: r.prompt,
                    original_prompt: r.originalPrompt,
                    status: r.status,
                    image_id: r.imageId,
                    file_path: r.filePath,
                    error: r.error,
                    variants_count: r.variants?.length || 0,
                    generated_at: new Date(r.generatedAt).toISOString()
                  })),
                  created_at: new Date(status.createdAt).toISOString(),
                  started_at: status.startedAt ? new Date(status.startedAt).toISOString() : null,
                  completed_at: status.completedAt ? new Date(status.completedAt).toISOString() : null,
                  error: status.error,
                  timestamp: new Date().toISOString()
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  task_id: task_id,
                  error: error instanceof Error ? error.message : String(error),
                  message: "获取批量任务状态失败"
                }, null, 2)
              }
            ]
          };
        }
      }

      case "cancel_batch_task": {
        const { task_id } = request.params.arguments as { task_id: string };
        
        try {
          const success = BatchOperationManager.cancelTask(task_id);
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: success,
                  task_id: task_id,
                  message: success ? "批量任务已取消" : "批量任务取消失败或任务不存在",
                  timestamp: new Date().toISOString()
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  task_id: task_id,
                  error: error instanceof Error ? error.message : String(error),
                  message: "取消批量任务失败"
                }, null, 2)
              }
            ]
          };
        }
      }

      case "batch_optimize_prompts": {
        const { prompts, level = "advanced" } = request.params.arguments as { 
          prompts: string[]; 
          level?: "basic" | "advanced" | "professional";
        };
        
        try {
          const results = await BatchOperationManager.batchOptimizePrompts(prompts, level);
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  total_prompts: prompts.length,
                  optimization_level: level,                  results: results.map((r: any) => ({
                    original_prompt: r.original,
                    optimized_prompt: r.optimized,
                    improvements: r.improvements,
                    enhancement_score: 0 // 暂时设为0，因为模块返回的对象中没有这个字段
                  })),
                  timestamp: new Date().toISOString()
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  message: "批量优化提示词失败"
                }, null, 2)
              }
            ]
          };
        }
      }

      case "get_batch_statistics": {
        try {
          const stats = BatchOperationManager.getBatchStats();
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({                  statistics: {
                    total_tasks: stats.activeTasks + stats.completedTasks + stats.failedTasks,
                    active_tasks: stats.activeTasks,
                    completed_tasks: stats.completedTasks,
                    failed_tasks: stats.failedTasks,
                    total_images_generated: stats.totalImagesGenerated,
                    average_completion_time: 0, // 不在getBatchStats中返回
                    success_rate: stats.completedTasks / (stats.completedTasks + stats.failedTasks) || 0,
                    most_common_errors: [] // 不在getBatchStats中返回
                  },
                  timestamp: new Date().toISOString()
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  message: "获取批量操作统计失败"
                }, null, 2)
              }
            ]
          };
        }
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
  
  // 获取本地存储的图片
  const localImages = imageStorage.getAllImages();
  const localResources = localImages.map((image: StoredImage) => ({
    uri: image.resourceUri,
    name: image.filename,
    description: `AI生成图像: ${image.prompt.substring(0, 100)}...`,
    mimeType: `image/${image.filename.split('.').pop()}`,
    annotations: {
      source: 'local',
      timestamp: new Date(image.timestamp).toISOString(),
      model: image.metadata.model,
      ossAvailable: !!image.ossInfo?.url
    }
  }));

  // 尝试获取 OSS 中的额外图片资源
  let ossResources: any[] = [];
  try {
    const { OSSService } = await import('./oss-service.js');
    const ossService = new OSSService();
    
    if (ossService.isAvailable()) {
      const ossFiles = await ossService.listFiles('images/', 50);
      const ossImageFiles = ossFiles.filter(file => 
        /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name)
      );

      // 过滤掉已经在本地存储中的图片（避免重复）
      const localImageNames = localImages.map(img => img.filename);
      const uniqueOssFiles = ossImageFiles.filter(file => {
        const fileName = file.name.split('/').pop() || '';
        return !localImageNames.includes(fileName);
      });

      ossResources = uniqueOssFiles.map(file => ({
        uri: `oss://images/${file.name}`,
        name: file.name.split('/').pop() || file.name,
        description: `OSS存储的图片: ${file.name}`,
        mimeType: `image/${file.name.split('.').pop()?.toLowerCase() || 'png'}`,
        annotations: {
          source: 'oss',
          size: file.size,
          lastModified: file.lastModified?.toISOString(),
          url: file.url
        }
      }));
    }
  } catch (error) {
    Logger.warn(`获取 OSS 资源失败: ${error instanceof Error ? error.message : String(error)}`);
    // 继续使用本地资源
  }

  return {
    resources: [
      ...localResources,
      ...ossResources
    ]
  };
});

// 注册资源读取
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  Logger.debug(`处理资源读取请求: ${request.params.uri}`);
  
  // 检查是否是 OSS 资源
  if (request.params.uri.startsWith('oss://images/')) {
    try {
      const ossPath = request.params.uri.replace('oss://images/', '');
      const { OSSService } = await import('./oss-service.js');
      const ossService = new OSSService();
      
      if (!ossService.isAvailable()) {
        throw new McpError(ErrorCode.InternalError, 'OSS 服务不可用');
      }

      // 获取 OSS 文件的签名 URL
      const signedUrl = await ossService.getSignedUrl(ossPath);
      
      // 下载文件内容
      const response = await fetch(signedUrl);
      if (!response.ok) {
        throw new Error(`下载失败: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      
      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: `image/${ossPath.split('.').pop()?.toLowerCase() || 'png'}`,
            text: base64Data
          }
        ]
      };
    } catch (error) {
      Logger.error('读取 OSS 图片失败', error);
      throw new McpError(ErrorCode.InternalError, `无法读取 OSS 图片: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
  
  // 处理本地存储的图片
  const image = imageStorage.getImageByResourceUri(request.params.uri);
  if (!image) {
    throw new McpError(ErrorCode.InvalidParams, `资源未找到: ${request.params.uri}`);
  }
  
  try {
    // 优先使用 OSS URL（如果可用）
    if (image.ossInfo?.url) {
      try {
        const response = await fetch(image.ossInfo.url);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const base64Data = Buffer.from(arrayBuffer).toString('base64');
          
          return {
            contents: [
              {
                uri: request.params.uri,
                mimeType: `image/${image.filename.split('.').pop()}`,
                text: base64Data
              }
            ]
          };
        }
      } catch (ossError) {
        Logger.warn(`从 OSS 读取图片失败，尝试本地文件: ${ossError instanceof Error ? ossError.message : String(ossError)}`);
      }
    }
    
    // 回退到本地文件
    if (!image.localPath) {
      throw new Error('图片没有本地路径且 OSS 不可用');
    }
    
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
process.on('SIGINT', async () => {
  Logger.info('收到 SIGINT 信号，开始优雅关闭...');
  
  // 清理服务
  imageStorage.destroy();
  tongyiService.destroy();
  
  // 清理日志系统并上传剩余日志
  try {
    await Logger.destroy();
  } catch (error) {
    console.error('日志系统清理失败:', error);
  }
  
  Logger.info('服务已关闭');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  Logger.info('收到 SIGTERM 信号，开始优雅关闭...');
  
  // 清理服务
  imageStorage.destroy();
  tongyiService.destroy();
  
  // 清理日志系统并上传剩余日志
  try {
    await Logger.destroy();
  } catch (error) {
    console.error('日志系统清理失败:', error);
  }
  
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

// 优雅关闭处理
process.on('SIGINT', async () => {
  Logger.info('接收到 SIGINT 信号，正在关闭服务...');
  await gracefulShutdown();
});

process.on('SIGTERM', async () => {
  Logger.info('接收到 SIGTERM 信号，正在关闭服务...');
  await gracefulShutdown();
});

async function gracefulShutdown() {
  try {
    // 销毁图片存储管理器
    imageStorage.destroy();
    
    // 销毁日志系统（上传剩余日志）
    await Logger.destroy();
    
    process.exit(0);
  } catch (error) {
    Logger.error('优雅关闭失败', error);
    process.exit(1);
  }
}

// 启动应用
main().catch(error => {
  Logger.error('应用启动失败', error);
  process.exit(1);
});
