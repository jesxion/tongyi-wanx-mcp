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

// 提示词指导数据
const promptGuides = {
  basic_formula: {
    name: "基础提示词公式",
    description: "适用于初次尝试AI创作的新用户，简单自由的提示词可生成更具有想象力的图像",
    formula: "主体 + 场景 + 风格",
    example: "25岁中国女孩，圆脸，看着镜头，优雅的民族服装，商业摄影，室外，电影级光照，半身特写，精致的淡妆，锐利的边缘。"
  },
  advanced_formula: {
    name: "进阶提示词公式", 
    description: "适用于有一定AI生图使用经验的用户，在基础公式之上添加更丰富细致的描述",
    formula: "主体（主体描述）+ 场景（场景描述）+ 风格（定义风格）+ 镜头语言 + 氛围词 + 细节修饰",
    example: "由羊毛毡制成的大熊猫，头戴大檐帽，穿着蓝色警服马甲，扎着腰带，携带警械装备，戴着蓝色手套，穿着皮鞋，大步奔跑姿态，毛毡效果，周围是动物王国城市街道商户，高级滤镜，路灯，动物王国，奇妙童趣，憨态可掬，夜晚，明亮，自然，可爱，4K，毛毡材质，摄影镜头，居中构图，毛毡风格，皮克斯风格，逆光。"
  },
  shot_types: {
    name: "景别参考",
    description: "不同景别类型的提示词参考",
    types: {
      "特写": "特写镜头 | 高清相机，情绪大片，日落，特写人像。",
      "近景": "近景镜头 | 近景镜头，18岁的中国女孩，古代服饰，圆脸，看着镜头，民族优雅的服装，商业摄影，室外，电影级光照，半身特写，精致的淡妆，锐利的边缘。",
      "中景": "中景镜头 | 电影时尚魅力摄影，年轻亚洲女子，中国苗族女孩，圆脸，看着镜头，民族深色优雅的服装，中广角镜头，阳光明媚，乌托邦式，由高清相机拍摄。",
      "远景": "远景镜头 | 展示了远景镜头，在壮丽的雪山背景下，两个小小的人影站在远处山顶，背对着镜头，静静地观赏着日落的美景。"
    }
  },
  perspectives: {
    name: "视角参考",
    description: "不同镜头视角的提示词参考",
    types: {
      "平视": "平视视角 | 图像展示了从平视视角捕捉到的草地景象，一群羊悠闲地在绿茵茵的草地上低头觅食。",
      "俯视": "俯视视角 | 我从空中俯瞰冰湖，中心有一艘小船，周围环绕着漩涡图案和充满活力的蓝色海水。",
      "仰视": "仰视视角 | 展示了热带地区的壮观景象，高大的椰子树如同参天巨人般耸立，镜头采用仰视视角。",
      "航拍": "航拍视角 | 展示了大雪，村庄，道路，灯火，树木。航拍视角，逼真效果。"
    }
  },
  lens_types: {
    name: "镜头类型参考",
    description: "不同镜头拍摄类型的提示词参考",
    types: {
      "微距": "微距镜头 | cherries, carbonated water, macro, professional color grading, clean sharp focus, commercial high quality, magazine winning photography, hyper realistic, uhd, 8K",
      "超广角": "超广角镜头 | 超广角镜头，碧海蓝天下的海岛，阳光透过树叶缝隙，洒下斑驳光影。",
      "长焦": "长焦镜头 | 展示了长焦镜头下，一只猎豹在郁郁葱葱的森林中站立，面对镜头，背景被巧妙地虚化。",
      "鱼眼": "鱼眼镜头 | 展示了在鱼眼镜头的特殊视角下，一位女性站立着并直视镜头的场景。"
    }
  },
  styles: {
    name: "风格参考", 
    description: "不同艺术风格的提示词参考",
    types: {
      "3D卡通": "网球女运动员，短发，白色网球服，黑色短裤，侧身回球，3D卡通风格。",
      "废土风": "火星上的城市，废土风格。",
      "点彩画": "一座白色的可爱的小房子，茅草房，一片被雪覆盖的草原，大胆使用点彩色画，莫奈感，清晰的笔触。",
      "超现实": "深灰色大海中一条粉红色的发光河流，具有极简、美丽和审美的氛围，具有超现实风格的电影灯光。",
      "水彩": "浅水彩，咖啡馆外，明亮的白色背景，更少细节，梦幻，吉卜力工作室。",
      "粘土": "粘土风格，蓝色毛衣的小男孩，棕色卷发，深蓝色贝雷帽，画板，户外，海边，半身照。",
      "写实": "篮子，葡萄，野餐布，超写实静物摄影，微距镜头，丁达尔效应。",
      "陶瓷": "展示了高细节的瓷器小狗，它静静地躺在桌上，脖子上系着一个精致的铃铛。",
      "3D": "中国龙，可爱的中国龙睡在白云上，迷人的花园，在晨雾中，特写，正面，3D立体，C4D渲染，32k超高清。",
      "水墨": "兰花，水墨画，留白，意境，吴冠中风格，细腻的笔触，宣纸的纹理。",
      "折纸": "折纸杰作，牛皮纸材质的熊猫，森林背景，中景，极简主义，背光，最佳品质。",
      "工笔": "晨曦中，一枝寒梅傲立雪中，花瓣细腻如丝，露珠轻挂，展现工笔画之精致美。",
      "国风水墨": "国风水墨风格，一个长长黑发的男人，金色的发簪，飞舞着金色的蝴蝶，白色的服装，高细节，高质量，深蓝色背景，背景中有若隐若现的水墨竹林。"
    }
  },
  lighting: {
    name: "光线参考",
    description: "不同光线类型的提示词参考", 
    types: {
      "自然光": "太阳光、月光、星光 | 图像展示了早晨的阳光洒在一片茂密森林的地面上，银白色的光芒穿透树梢，形成斑驳陆离的光影。",
      "逆光": "逆光 | 展示了在逆光环境下，模特轮廓线条更加分明，金色的光线以及丝绸环绕在模特周围，形成梦幻般的光环效果。",
      "霓虹灯": "霓虹灯 | 雨后的城市街景，霓虹灯光在湿润的地面上反射出绚丽多彩的光芒。",
      "氛围光": "氛围光 | 夜晚河边的浪漫艺术景象，氛围灯温柔地照亮了水面，一群莲花灯缓缓飘向河心，灯光与水面波光粼粼相互辉映。"
    }
  }
};

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
      };

    case "prompt_examples_by_category":
      const category = request.params.arguments?.category as string;
      const categoryData = promptGuides[category as keyof typeof promptGuides];
      
      if (!categoryData || !('types' in categoryData)) {
        throw new McpError(ErrorCode.InvalidParams, `无效的类别: ${category}`);
      }

      const examples = Object.entries(categoryData.types)
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
