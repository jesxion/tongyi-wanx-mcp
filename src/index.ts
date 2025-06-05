#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode,
  CallToolRequest,
  GetPromptRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fetch from "node-fetch";
import { createWriteStream, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";
import { createHash } from "crypto";

// API Key 验证
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
if (!DASHSCOPE_API_KEY) {
  console.error("错误: 请设置 DASHSCOPE_API_KEY 环境变量");
  process.exit(1);
}

// API 基础配置
const DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com";

// 图片存储配置
const IMAGES_DIR = process.env.IMAGES_DIR || "./generated_images";

// 确保图片目录存在
if (!existsSync(IMAGES_DIR)) {
  mkdirSync(IMAGES_DIR, { recursive: true });
}

// 通义万相支持的模型
const SUPPORTED_MODELS = [
  "wanx2.1-t2i-turbo",
  "wanx2.1-t2i-plus", 
  "wanx2.0-t2i-turbo"
] as const;

// 任务状态枚举
const TASK_STATUS = {
  PENDING: "PENDING",
  RUNNING: "RUNNING", 
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELED: "CANCELED",
  UNKNOWN: "UNKNOWN"
} as const;

// 请求参数 Schema
const TextToImageSchema = z.object({
  model: z.enum(SUPPORTED_MODELS).default("wanx2.1-t2i-turbo"),
  prompt: z.string().max(800, "提示词长度不能超过800个字符"),
  negative_prompt: z.string().max(500, "反向提示词长度不能超过500个字符").optional(),
  size: z.string().regex(/^\d{3,4}\*\d{3,4}$/, "图像尺寸格式应为 width*height").default("1024*1024"),
  n: z.number().int().min(1).max(4).default(1),
  seed: z.number().int().min(0).max(2147483647).optional(),
  prompt_extend: z.boolean().default(true),
  watermark: z.boolean().default(false)
});

const QueryTaskSchema = z.object({
  task_id: z.string().min(1, "任务ID不能为空")
});

interface CreateTaskResponse {
  output: {
    task_id: string;
    task_status: string;
  };
  request_id: string;
  code?: string;
  message?: string;
}

interface QueryTaskResponse {
  output: {
    task_id: string;
    task_status: string;
    submit_time?: string;
    scheduled_time?: string;
    end_time?: string;
    results?: Array<{
      orig_prompt?: string;
      actual_prompt?: string;
      url?: string;
      code?: string;
      message?: string;
    }>;
    task_metrics?: {
      TOTAL: number;
      SUCCEEDED: number;
      FAILED: number;
    };
  };
  usage?: {
    image_count: number;
  };
  request_id: string;
  code?: string;
  message?: string;
}

// 本地存储的图片信息
interface StoredImage {
  id: string;
  filename: string;
  localPath: string;
  resourceUri: string;
  originalUrl: string;
  prompt: string;
  timestamp: number;
  metadata: {
    model: string;
    size: string;
    task_id: string;
  };
}

// 图片存储管理器
class ImageStorage {
  private images: Map<string, StoredImage> = new Map();

  async downloadAndStore(url: string, prompt: string, metadata: any): Promise<StoredImage> {
    // 生成唯一ID和文件名
    const imageId = createHash('md5').update(url + Date.now()).digest('hex');
    const timestamp = Date.now();
    const extension = this.getFileExtension(url);
    const filename = `${timestamp}_${imageId}.${extension}`;
    const localPath = join(IMAGES_DIR, filename);
    const resourceUri = `tongyi-wanx://images/${imageId}`;

    try {
      // 下载图片
      console.error(`开始下载图片: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`下载失败: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('响应体为空');
      }

      // 保存到本地
      const writeStream = createWriteStream(localPath);
      await pipeline(response.body, writeStream);
      console.error(`图片已保存: ${localPath}`);

      // 创建存储记录
      const storedImage: StoredImage = {
        id: imageId,
        filename,
        localPath,
        resourceUri,
        originalUrl: url,
        prompt,
        timestamp,
        metadata
      };

      this.images.set(imageId, storedImage);
      return storedImage;
    } catch (error) {
      console.error(`图片下载失败: ${error}`);
      throw new McpError(ErrorCode.InternalError, `图片下载失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private getFileExtension(url: string): string {
    const urlWithoutParams = url.split('?')[0];
    const extension = urlWithoutParams.split('.').pop()?.toLowerCase();
    return extension && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension) ? extension : 'png';
  }

  getImage(id: string): StoredImage | undefined {
    return this.images.get(id);
  }

  getAllImages(): StoredImage[] {
    return Array.from(this.images.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  getImageByResourceUri(uri: string): StoredImage | undefined {
    const images = Array.from(this.images.values());
    for (const image of images) {
      if (image.resourceUri === uri) {
        return image;
      }
    }
    return undefined;
  }
}

const imageStorage = new ImageStorage();

class TongyiWanxService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * 创建文生图任务
   */
  async createTextToImageTask(params: z.infer<typeof TextToImageSchema>): Promise<CreateTaskResponse> {
    const requestBody = {
      model: params.model,
      input: {
        prompt: params.prompt,
        ...(params.negative_prompt && { negative_prompt: params.negative_prompt })
      },
      parameters: {
        size: params.size,
        n: params.n,
        ...(params.seed !== undefined && { seed: params.seed }),
        prompt_extend: params.prompt_extend,
        watermark: params.watermark
      }
    };

    const response = await fetch(`${DASHSCOPE_BASE_URL}/api/v1/services/aigc/text2image/image-synthesis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "X-DashScope-Async": "enable"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new McpError(
        ErrorCode.InternalError,
        `通义万相 API 请求失败: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const result = await response.json() as CreateTaskResponse;
    
    if (result.code) {
      throw new McpError(
        ErrorCode.InternalError,
        `通义万相 API 错误: ${result.code} - ${result.message}`
      );
    }

    return result;
  }

  /**
   * 查询任务状态和结果
   */
  async queryTask(taskId: string): Promise<QueryTaskResponse> {
    const response = await fetch(`${DASHSCOPE_BASE_URL}/api/v1/tasks/${taskId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new McpError(
        ErrorCode.InternalError,
        `查询任务失败: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const result = await response.json() as QueryTaskResponse;
    
    if (result.code) {
      throw new McpError(
        ErrorCode.InternalError,
        `查询任务错误: ${result.code} - ${result.message}`
      );
    }

    return result;
  }

  /**
   * 轮询等待任务完成
   */
  async waitForTaskCompletion(taskId: string, maxWaitTime = 300000, pollInterval = 5000): Promise<QueryTaskResponse> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const result = await this.queryTask(taskId);
      
      if (result.output.task_status === TASK_STATUS.SUCCEEDED || 
          result.output.task_status === TASK_STATUS.FAILED ||
          result.output.task_status === TASK_STATUS.CANCELED) {
        return result;
      }
      
      // 等待下一次轮询
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      `任务 ${taskId} 等待超时，请稍后手动查询任务状态`
    );
  }
}

// 创建 MCP 服务器
const server = new Server(
  {
    name: "tongyi-wanx-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {},
    },
  }
);

// 创建通义万相服务实例
const tongyiService = new TongyiWanxService(DASHSCOPE_API_KEY);

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

// 注册工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
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
      }
    ],
  };
});

// 注册工具调用处理器
server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  try {
    switch (request.params.name) {
      case "text_to_image": {
        const params = TextToImageSchema.parse(request.params.arguments);
        const waitForCompletion = (request.params.arguments as any)?.wait_for_completion ?? true;
        
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
          for (const url of imageUrls) {
            if (!url) continue; // 跳过空的URL
            try {
              const storedImage = await imageStorage.downloadAndStore(
                url, 
                params.prompt, 
                {
                  model: params.model || 'wanx2.1-t2i-turbo',
                  size: params.size || '1024*1024',
                  task_id: finalResult.output.task_id as string
                }
              );
              storedImages.push(storedImage);
              console.error(`图片已存储: ${storedImage.filename}`);
            } catch (error) {
              console.error(`存储图片失败: ${error}`);
              // 如果存储失败，我们仍然可以返回原始URL作为备选
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
                  // 优先返回本地资源URI，如果没有则返回原始URL
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
                  image_count: finalResult.usage?.image_count || 0,
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
          return {
            content: [
              {
                type: "text", 
                text: JSON.stringify({
                  success: false,
                  task_id: finalResult.output.task_id,
                  task_status: finalResult.output.task_status,
                  message: `任务执行失败: ${finalResult.output.task_status}`
                }, null, 2)
              }
            ]
          };
        }
      }

      case "query_task": {
        const params = QueryTaskSchema.parse(request.params.arguments);
        const result = await tongyiService.queryTask(params.task_id);
        
        const response: any = {
          task_id: result.output.task_id,
          task_status: result.output.task_status,
          submit_time: result.output.submit_time,
          scheduled_time: result.output.scheduled_time,
          end_time: result.output.end_time
        };

        if (result.output.results) {
          response.results = result.output.results;
          const imageUrls = result.output.results.map(r => r.url).filter(Boolean);
          
          // 检查是否有已存储的图片资源
          const storedImages = imageStorage.getAllImages().filter(img => 
            img.metadata.task_id === params.task_id
          );
          
          if (storedImages.length > 0) {
            // 返回本地资源URI而不是临时URL
            response.image_resources = storedImages.map(img => ({
              resource_uri: img.resourceUri,
              filename: img.filename,
              local_path: img.localPath,
              original_url: img.originalUrl
            }));
            response.message = `任务已完成，共 ${storedImages.length} 张图像已存储为本地资源`;
          } else {
            // 如果没有存储的图片，返回原始URL
            response.image_urls = imageUrls;
          }
        }

        if (result.output.task_metrics) {
          response.task_metrics = result.output.task_metrics;
        }

        if (result.usage) {
          response.usage = result.usage;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2)
            }
          ]
        };
      }

      case "get_supported_models": {
        const modelInfo = {
          models: [
            {
              name: "wanx2.1-t2i-turbo",
              description: "通义万相文生图2.1 - 生成速度更快，通用生成模型",
              version: "2.1",
              features: ["快速生成", "性价比高", "通用场景"]
            },
            {
              name: "wanx2.1-t2i-plus", 
              description: "通义万相文生图2.1 - 生成图像细节更丰富，速度稍慢，通用生成模型",
              version: "2.1",
              features: ["高质量", "丰富细节", "通用场景"]
            },
            {
              name: "wanx2.0-t2i-turbo",
              description: "通义万相文生图2.0 - 擅长质感人像与创意设计，速度中等，性价比高",
              version: "2.0", 
              features: ["质感人像", "创意设计", "性价比高"]
            }
          ],
          usage_limits: {
            qps: 2,
            concurrent_tasks: 2,
            max_images_per_request: 4
          },
          supported_sizes: {
            min_pixels: 512,
            max_pixels: 1440,
            max_total_pixels: 2000000,
            common_sizes: ["512*512", "768*768", "1024*1024", "1024*768", "768*1024"]
          }
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(modelInfo, null, 2)
            }
          ]
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `未知工具: ${request.params.name}`
        );
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new McpError(ErrorCode.InternalError, `工具执行错误: ${errorMessage}`);
  }
});

// 注册 prompts 列表
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "optimize-prompt",
        description: "根据输入的简单描述，使用通义万相最佳实践生成优化的提示词",
        arguments: [
          {
            name: "description",
            description: "想要生成图像的简单描述",
            required: true
          },
          {
            name: "style", 
            description: "期望的风格类型（可选）",
            required: false
          },
          {
            name: "shot_type",
            description: "期望的景别类型（可选）",
            required: false
          }
        ]
      },
      {
        name: "prompt-guide",
        description: "获取通义万相文生图提示词编写指南和参考",
        arguments: [
          {
            name: "guide_type",
            description: "指南类型: basic_formula, advanced_formula, shot_types, perspectives, lens_types, styles, lighting",
            required: true
          }
        ]
      },
      {
        name: "style-examples",
        description: "获取特定风格的提示词示例",
        arguments: [
          {
            name: "style_name",
            description: "风格名称，如：水彩、3D卡通、写实、水墨等",
            required: true
          }
        ]
      }
    ]
  };
});

// 注册 prompt 获取处理器
server.setRequestHandler(GetPromptRequestSchema, async (request: GetPromptRequest) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "optimize-prompt": {
      const description = args?.description as string;
      const style = args?.style as string;
      const shotType = args?.shot_type as string;

      if (!description) {
        throw new McpError(ErrorCode.InvalidParams, "description 参数是必需的");
      }

      let optimizedPrompt = description;

      // 添加风格
      if (style && promptGuides.styles.types[style as keyof typeof promptGuides.styles.types]) {
        optimizedPrompt += `，${style}风格`;
      }

      // 添加景别
      if (shotType && promptGuides.shot_types.types[shotType as keyof typeof promptGuides.shot_types.types]) {
        optimizedPrompt += `，${shotType}镜头`;
      }

      // 添加通用优化词
      optimizedPrompt += "，高质量，精细细节，专业摄影，4K";

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `基于您的描述："${description}"，为通义万相文生图优化的提示词如下：

**优化后的提示词：**
${optimizedPrompt}

**优化说明：**
- 保留了原始描述的核心内容
${style ? `- 添加了${style}风格特征` : ""}
${shotType ? `- 指定了${shotType}景别` : ""}
- 增加了质量提升关键词

**使用建议：**
- 您可以进一步根据${promptGuides.basic_formula.formula}来完善提示词
- 如需更复杂的效果，可参考进阶公式：${promptGuides.advanced_formula.formula}
- 考虑添加负向提示词来避免不需要的元素

**示例调用：**
使用 text_to_image 工具，将优化后的提示词作为 prompt 参数传入。`
            }
          }
        ]
      };
    }

    case "prompt-guide": {
      const guideType = args?.guide_type as string;

      if (!guideType) {
        throw new McpError(ErrorCode.InvalidParams, "guide_type 参数是必需的");
      }

      const guide = promptGuides[guideType as keyof typeof promptGuides];
      if (!guide) {
        throw new McpError(ErrorCode.InvalidParams, `未知的指南类型: ${guideType}`);
      }

      let content = `# ${guide.name}\n\n${guide.description}\n\n`;

      if ('formula' in guide) {
        content += `**公式：** ${guide.formula}\n\n`;
        content += `**示例：** ${guide.example}\n\n`;
      }

      if ('types' in guide) {
        content += "**类型参考：**\n\n";
        Object.entries(guide.types).forEach(([type, example]) => {
          content += `**${type}：** ${example}\n\n`;
        });
      }

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: content
            }
          }
        ]
      };
    }

    case "style-examples": {
      const styleName = args?.style_name as string;

      if (!styleName) {
        throw new McpError(ErrorCode.InvalidParams, "style_name 参数是必需的");
      }

      const styleExample = promptGuides.styles.types[styleName as keyof typeof promptGuides.styles.types];
      if (!styleExample) {
        const availableStyles = Object.keys(promptGuides.styles.types).join("、");
        throw new McpError(ErrorCode.InvalidParams, `未找到风格 "${styleName}"，可用风格：${availableStyles}`);
      }

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# ${styleName}风格提示词示例

**示例提示词：**
${styleExample}

**使用建议：**
- 您可以将此示例作为模板，替换其中的具体内容
- 保持风格关键词不变，修改主体、场景等元素
- 结合其他技巧如景别、光线等进一步优化

**相关风格：**
${Object.keys(promptGuides.styles.types).filter(s => s !== styleName).slice(0, 5).join("、")}

**调用示例：**
\`\`\`json
{
  "model": "wanx2.1-t2i-turbo",
  "prompt": "${styleExample}",
  "size": "1024*1024",
  "n": 1
}
\`\`\``
            }
          }
        ]
      };
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `未知的 prompt: ${name}`);
  }
});

// 注册 Resources 处理器
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const allImages = imageStorage.getAllImages();
  
  return {
    resources: allImages.map(image => ({
      uri: image.resourceUri,
      name: `Generated Image - ${image.prompt.substring(0, 50)}...`,
      description: `Generated by ${image.metadata.model} on ${new Date(image.timestamp).toLocaleString()}`,
      mimeType: "image/jpeg"
    }))
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  
  if (!uri.startsWith("tongyi-wanx://images/")) {
    throw new McpError(ErrorCode.InvalidParams, "不支持的资源URI格式");
  }
  
  const image = imageStorage.getImageByResourceUri(uri);
  if (!image) {
    throw new McpError(ErrorCode.InvalidParams, "找不到指定的图片资源");
  }
  
  try {
    const fs = await import('fs');
    const imageData = fs.readFileSync(image.localPath);
    const base64Data = imageData.toString('base64');
    
    return {
      contents: [
        {
          uri: image.resourceUri,
          mimeType: "image/jpeg",
          text: base64Data
        }
      ]
    };
  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `读取图片文件失败: ${error}`);
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("通义万相 MCP 服务器已启动");
}

main().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});
