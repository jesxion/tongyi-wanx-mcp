import { z } from 'zod';
import { Config } from './config.js';
import { Logger } from './logger.js';
import { TongyiError, ErrorHandler } from './errors.js';
import { ConcurrencyManager, withPerformanceMonitoring } from './concurrency.js';

// 支持的模型
export const SUPPORTED_MODELS = [
  "wanx2.1-t2i-turbo",
  "wanx2.1-t2i-plus", 
  "wanx2.0-t2i-turbo"
] as const;

// 支持的图像编辑模型
export const SUPPORTED_IMAGE_EDIT_MODELS = [
  "wanx2.1-imageedit"
] as const;

// 支持的海报生成模型
export const SUPPORTED_POSTER_MODELS = [
  "wanx-poster-generation-v1"
] as const;

// 任务状态枚举
export const TASK_STATUS = {
  PENDING: "PENDING",
  RUNNING: "RUNNING", 
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELED: "CANCELED",
  UNKNOWN: "UNKNOWN"
} as const;

// 请求参数 Schema - 增强验证
export const TextToImageSchema = z.object({
  model: z.enum(SUPPORTED_MODELS).default("wanx2.1-t2i-turbo"),
  prompt: z.string()
    .min(1, "提示词不能为空")
    .max(800, "提示词长度不能超过800个字符")
    .refine(val => val.trim().length > 0, "提示词不能只包含空格"),
  negative_prompt: z.string()
    .max(500, "反向提示词长度不能超过500个字符")
    .optional(),
  size: z.string()
    .regex(/^\d{3,4}\*\d{3,4}$/, "图像尺寸格式应为 width*height")
    .refine(val => {
      const [width, height] = val.split('*').map(Number);
      return width >= 512 && width <= 1440 && height >= 512 && height <= 1440;
    }, "图像尺寸必须在512-1440像素范围内")
    .default("1024*1024"),
  n: z.number().int().min(1).max(4).default(1),
  seed: z.number().int().min(0).max(2147483647).optional(),
  prompt_extend: z.boolean().default(true),
  watermark: z.boolean().default(false)
});

export const QueryTaskSchema = z.object({
  task_id: z.string().min(1, "任务ID不能为空")
});

// 图像编辑功能枚举
export const IMAGE_EDIT_FUNCTIONS = {
  STYLIZATION_ALL: "stylization_all",
  STYLIZATION_LOCAL: "stylization_local", 
  DESCRIPTION_EDIT: "description_edit",
  DESCRIPTION_EDIT_WITH_MASK: "description_edit_with_mask",
  REMOVE_WATERMARK: "remove_watermark",
  EXPAND: "expand",
  SUPER_RESOLUTION: "super_resolution",
  COLORIZATION: "colorization",
  DOODLE: "doodle",
  CONTROL_CARTOON_FEATURE: "control_cartoon_feature"
} as const;

// 海报生成样式枚举 - 官方支持的18种风格
export const POSTER_STYLES = {
  TWO_D_ILLUSTRATION_1: "2D插画1",
  TWO_D_ILLUSTRATION_2: "2D插画2",
  VAST_NEBULA: "浩瀚星云",
  RICH_COLOR: "浓郁色彩",
  LIGHT_PARTICLE: "光线粒子",
  TRANSPARENT_GLASS: "透明玻璃",
  PAPER_CUT_CRAFT: "剪纸工艺",
  ORIGAMI_CRAFT: "折纸工艺",
  CHINESE_INK: "中国水墨",
  CHINESE_EMBROIDERY: "中国刺绣",
  REAL_SCENE: "真实场景",
  TWO_D_CARTOON: "2D卡通",
  CHILDREN_WATERCOLOR: "儿童水彩",
  CYBER_BACKGROUND: "赛博背景",
  LIGHT_BLUE_ABSTRACT: "浅蓝抽象",
  DEEP_BLUE_ABSTRACT: "深蓝抽象",
  ABSTRACT_DOT_LINE: "抽象点线",
  FAIRY_TALE_OIL: "童话油画"
} as const;

// 海报生成模式枚举
export const POSTER_GENERATION_MODES = {
  GENERATE: "generate",
  SUPER_RESOLUTION: "sr", 
  HIGH_RESOLUTION_FIX: "hrf"
} as const;

// 海报布局枚举
export const POSTER_LAYOUTS = {
  LANDSCAPE: "横版",
  PORTRAIT: "竖版"
} as const;

// 图像编辑请求参数 Schema
export const ImageEditSchema = z.object({
  model: z.enum(SUPPORTED_IMAGE_EDIT_MODELS).default("wanx2.1-imageedit"),
  prompt: z.string()
    .min(1, "提示词不能为空")
    .max(800, "提示词长度不能超过800个字符"),
  function: z.enum([
    IMAGE_EDIT_FUNCTIONS.STYLIZATION_ALL,
    IMAGE_EDIT_FUNCTIONS.STYLIZATION_LOCAL,
    IMAGE_EDIT_FUNCTIONS.DESCRIPTION_EDIT,
    IMAGE_EDIT_FUNCTIONS.DESCRIPTION_EDIT_WITH_MASK,
    IMAGE_EDIT_FUNCTIONS.REMOVE_WATERMARK,
    IMAGE_EDIT_FUNCTIONS.EXPAND,
    IMAGE_EDIT_FUNCTIONS.SUPER_RESOLUTION,
    IMAGE_EDIT_FUNCTIONS.COLORIZATION,
    IMAGE_EDIT_FUNCTIONS.DOODLE,
    IMAGE_EDIT_FUNCTIONS.CONTROL_CARTOON_FEATURE
  ]),
  base_image_url: z.string()
    .url("基础图像URL格式不正确")
    .refine(url => !url.includes('中文'), "URL地址中不能包含中文字符"),
  mask_image_url: z.string()
    .url("遮罩图像URL格式不正确")
    .refine(url => !url.includes('中文'), "URL地址中不能包含中文字符")
    .optional(),
  // 通用参数
  n: z.number().int().min(1).max(4).default(1),
  seed: z.number().int().min(0).max(2147483647).optional(),
  watermark: z.boolean().default(false),
  // 风格化和指令编辑参数
  strength: z.number().min(0.0).max(1.0).default(0.5).optional(),
  // 扩图参数
  top_scale: z.number().min(1.0).max(2.0).default(1.0).optional(),
  bottom_scale: z.number().min(1.0).max(2.0).default(1.0).optional(),
  left_scale: z.number().min(1.0).max(2.0).default(1.0).optional(),
  right_scale: z.number().min(1.0).max(2.0).default(1.0).optional(),
  // 超分参数
  upscale_factor: z.number().int().min(1).max(4).default(1).optional(),
  // 线稿生图参数
  is_sketch: z.boolean().default(false).optional()
}).refine(data => {
  // 局部重绘必须提供遮罩图像
  if (data.function === IMAGE_EDIT_FUNCTIONS.DESCRIPTION_EDIT_WITH_MASK) {
    return !!data.mask_image_url;
  }
  return true;
}, {
  message: "局部重绘功能必须提供遮罩图像URL",
  path: ["mask_image_url"]
});

// 海报生成请求参数 Schema
export const PosterGenerationSchema = z.object({
  model: z.enum(SUPPORTED_POSTER_MODELS).default("wanx-poster-generation-v1"),
  // 文本内容
  title: z.string()
    .min(1, "标题不能为空")
    .max(30, "标题长度不能超过30个字符"),
  sub_title: z.string()
    .max(30, "副标题长度不能超过30个字符")
    .optional(),
  body_text: z.string()
    .max(50, "正文长度不能超过50个字符")
    .optional(),
  // 提示词文本（中英文至少一个）
  prompt_text_zh: z.string()
    .max(50, "中文提示词长度不能超过50个字符")
    .optional(),
  prompt_text_en: z.string()
    .max(50, "英文提示词长度不能超过50个单词")
    .optional(),  // 样式控制
  lora_name: z.enum([
    POSTER_STYLES.TWO_D_ILLUSTRATION_1,
    POSTER_STYLES.TWO_D_ILLUSTRATION_2,
    POSTER_STYLES.VAST_NEBULA,
    POSTER_STYLES.RICH_COLOR,
    POSTER_STYLES.LIGHT_PARTICLE,
    POSTER_STYLES.TRANSPARENT_GLASS,
    POSTER_STYLES.PAPER_CUT_CRAFT,
    POSTER_STYLES.ORIGAMI_CRAFT,
    POSTER_STYLES.CHINESE_INK,
    POSTER_STYLES.CHINESE_EMBROIDERY,
    POSTER_STYLES.REAL_SCENE,
    POSTER_STYLES.TWO_D_CARTOON,
    POSTER_STYLES.CHILDREN_WATERCOLOR,
    POSTER_STYLES.CYBER_BACKGROUND,
    POSTER_STYLES.LIGHT_BLUE_ABSTRACT,
    POSTER_STYLES.DEEP_BLUE_ABSTRACT,
    POSTER_STYLES.ABSTRACT_DOT_LINE,
    POSTER_STYLES.FAIRY_TALE_OIL
  ]).default(POSTER_STYLES.TWO_D_ILLUSTRATION_1),
  lora_weight: z.number()
    .min(0.0)
    .max(1.0)
    .default(0.8), // 修正默认值 0.6 → 0.8
  // 布局控制
  wh_ratios: z.enum([POSTER_LAYOUTS.LANDSCAPE, POSTER_LAYOUTS.PORTRAIT])
    .default(POSTER_LAYOUTS.PORTRAIT), // 修正参数名 layout → wh_ratios
  creative_title_layout: z.boolean().default(false), // 修正默认值 true → false
  // ControlNet 参数
  ctrl_ratio: z.number()
    .min(0.0)
    .max(1.0)
    .default(0.7), // 修正默认值 0.4 → 0.7
  ctrl_step: z.number()
    .min(0.0, "ctrl_step必须大于0")
    .max(1.0)
    .default(0.7), // 修正类型和默认值：int(20) → float(0.7)
  // 生成模式
  generate_mode: z.enum([
    POSTER_GENERATION_MODES.GENERATE,
    POSTER_GENERATION_MODES.SUPER_RESOLUTION,
    POSTER_GENERATION_MODES.HIGH_RESOLUTION_FIX
  ]).default(POSTER_GENERATION_MODES.GENERATE), // 修正参数名 mode → generate_mode
  // 通用参数
  generate_num: z.number().int().min(1).max(4).default(1), // 修正参数名 n → generate_num  seed: z.number().int().min(0).max(2147483647).optional(),
  watermark: z.boolean().default(false),
  // 高分辨率模式参数
  auxiliary_parameters: z.string().optional()
}).refine(data => {
  // 中英文提示词至少提供一个
  return !!(data.prompt_text_zh || data.prompt_text_en);
}, {
  message: "中文提示词或英文提示词至少需要提供一个",
  path: ["prompt_text_zh", "prompt_text_en"]
}).refine(data => {
  // sr 或 hrf 模式需要提供 auxiliary_parameters
  if (data.generate_mode === "sr" || data.generate_mode === "hrf") {
    return !!data.auxiliary_parameters;
  }
  return true;
}, {
  message: "超分辨率(sr)和高清修复(hrf)模式需要提供辅助参数",
  path: ["auxiliary_parameters"]
});

// API 响应接口
export interface CreateTaskResponse {
  output: {
    task_id: string;
    task_status: string;
  };
  request_id: string;
  code?: string;
  message?: string;
}

export interface QueryTaskResponse {
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

/**
 * 优化的通义万相服务类
 */
export class TongyiWanxService {
  private apiKey: string;
  private baseUrl: string;
  private isTestMode: boolean;
  private concurrencyManager: ConcurrencyManager;

  constructor(apiKey: string = Config.API_KEY || '') {
    this.apiKey = apiKey;
    this.baseUrl = Config.BASE_URL;
    this.isTestMode = Config.IS_TEST_MODE;
    this.concurrencyManager = new ConcurrencyManager(Config.MAX_CONCURRENT_REQUESTS);
    
    Logger.info(`通义万相服务初始化 ${this.isTestMode ? '(测试模式)' : ''}`);
  }

  /**
   * 创建文生图任务
   */
  async createTextToImageTask(params: z.infer<typeof TextToImageSchema>): Promise<CreateTaskResponse> {
    return this.concurrencyManager.execute(async () => {
      if (this.isTestMode) {
        return this.createMockResponse(params);
      }

      return await ErrorHandler.wrapAsync(async () => {
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

        Logger.debug('创建文生图任务请求', { 
          model: params.model, 
          prompt: params.prompt.substring(0, 100) + '...',
          size: params.size,
          n: params.n
        });

        const url = `${this.baseUrl}/api/v1/services/aigc/text2image/image-synthesis`;
        Logger.apiCall('POST', url);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
            "X-DashScope-Async": "enable"
          },
          body: JSON.stringify(requestBody)
        });

        Logger.apiCall('POST', url, response.status);

        if (!response.ok) {
          const errorText = await response.text();
          Logger.error(`API请求失败: ${response.status} ${response.statusText}`, errorText);
          ErrorHandler.handleApiError(response, '创建文生图任务');
        }

        const result = await response.json() as CreateTaskResponse;
        
        if (result.code) {
          Logger.error(`API业务错误: ${result.code} - ${result.message}`);
          ErrorHandler.handleTongyiApiError(result, '创建文生图任务');
        }

        Logger.info(`任务创建成功: ${result.output.task_id}`);
        return result;

      }, '创建文生图任务', 2); // 最多重试2次
    });
  }

  /**
   * 查询任务状态和结果
   */
  async queryTask(taskId: string): Promise<QueryTaskResponse> {
    return this.concurrencyManager.execute(async () => {
      if (this.isTestMode) {
        return this.createMockQueryResponse(taskId);
      }

      return await ErrorHandler.wrapAsync(async () => {
        const url = `${this.baseUrl}/api/v1/tasks/${taskId}`;
        Logger.apiCall('GET', url);

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`
          }
        });

        Logger.apiCall('GET', url, response.status);

        if (!response.ok) {
          const errorText = await response.text();
          Logger.error(`查询任务失败: ${response.status} ${response.statusText}`, errorText);
          ErrorHandler.handleApiError(response, '查询任务状态');
        }

        const result = await response.json() as QueryTaskResponse;
        
        if (result.code) {
          Logger.error(`查询任务错误: ${result.code} - ${result.message}`);
          ErrorHandler.handleTongyiApiError(result, '查询任务状态');
        }

        Logger.debug(`任务状态查询: ${taskId} -> ${result.output.task_status}`);
        return result;

      }, '查询任务状态', 3); // 查询任务可以重试更多次
    });
  }
  /**
   * 创建图像编辑任务
   */
  async createImageEditTask(params: z.infer<typeof ImageEditSchema>): Promise<CreateTaskResponse> {
    return this.concurrencyManager.execute(async () => {
      if (this.isTestMode) {
        return this.createMockImageEditResponse(params);
      }

      return await ErrorHandler.wrapAsync(async () => {
        const requestBody = {
          model: params.model,
          input: {
            prompt: params.prompt,
            function: params.function,
            base_image_url: params.base_image_url,
            ...(params.mask_image_url && { mask_image_url: params.mask_image_url })
          },
          parameters: {
            n: params.n,
            ...(params.seed !== undefined && { seed: params.seed }),
            watermark: params.watermark,
            // 添加条件性参数
            ...(params.strength !== undefined && { strength: params.strength }),
            ...(params.top_scale !== undefined && { top_scale: params.top_scale }),
            ...(params.bottom_scale !== undefined && { bottom_scale: params.bottom_scale }),
            ...(params.left_scale !== undefined && { left_scale: params.left_scale }),
            ...(params.right_scale !== undefined && { right_scale: params.right_scale }),
            ...(params.upscale_factor !== undefined && { upscale_factor: params.upscale_factor }),
            ...(params.is_sketch !== undefined && { is_sketch: params.is_sketch })
          }
        };

        Logger.debug('创建图像编辑任务请求', { 
          model: params.model, 
          function: params.function,
          prompt: params.prompt.substring(0, 100) + '...',
          n: params.n
        });

        const url = `${this.baseUrl}/api/v1/services/aigc/image2image/image-synthesis`;
        Logger.apiCall('POST', url);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
            "X-DashScope-Async": "enable"
          },
          body: JSON.stringify(requestBody)
        });

        Logger.apiCall('POST', url, response.status);

        if (!response.ok) {
          const errorText = await response.text();
          Logger.error(`API请求失败: ${response.status} ${response.statusText}`, errorText);
          ErrorHandler.handleApiError(response, '创建图像编辑任务');
        }

        const result = await response.json() as CreateTaskResponse;
        
        if (result.code) {
          Logger.error(`API业务错误: ${result.code} - ${result.message}`);
          ErrorHandler.handleTongyiApiError(result, '创建图像编辑任务');
        }

        Logger.info(`图像编辑任务创建成功: ${result.output.task_id}`);
        return result;      }, '创建图像编辑任务', 2); // 最多重试2次
    });
  }

  /**
   * 创建海报生成任务
   */
  async createPosterGenerationTask(params: z.infer<typeof PosterGenerationSchema>): Promise<CreateTaskResponse> {
    return this.concurrencyManager.execute(async () => {
      if (this.isTestMode) {
        return this.createMockPosterResponse(params);
      }

      return await ErrorHandler.wrapAsync(async () => {        const requestBody = {
          model: params.model,
          input: {
            title: params.title,
            ...(params.sub_title && { sub_title: params.sub_title }),
            ...(params.body_text && { body_text: params.body_text }),
            ...(params.prompt_text_zh && { prompt_text_zh: params.prompt_text_zh }),
            ...(params.prompt_text_en && { prompt_text_en: params.prompt_text_en }),
            // API 参数映射
            wh_ratios: params.wh_ratios, // layout → wh_ratios
            lora_name: params.lora_name,
            lora_weight: params.lora_weight,
            creative_title_layout: params.creative_title_layout,
            ctrl_ratio: params.ctrl_ratio,
            ctrl_step: params.ctrl_step,            generate_mode: params.generate_mode, // mode → generate_mode
            generate_num: params.generate_num, // n → generate_num
            ...(params.auxiliary_parameters && { auxiliary_parameters: params.auxiliary_parameters })
          },
          parameters: {}
        };        
        Logger.debug('创建海报生成任务请求', { 
          model: params.model, 
          title: params.title,
          lora_name: params.lora_name,
          wh_ratios: params.wh_ratios, // 修正参数名
          generate_num: params.generate_num // 修正参数名
        });

        const url = `${this.baseUrl}/api/v1/services/aigc/poster-generation/generation`;
        Logger.apiCall('POST', url);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
            "X-DashScope-Async": "enable"
          },
          body: JSON.stringify(requestBody)
        });

        Logger.apiCall('POST', url, response.status);

        if (!response.ok) {
          const errorText = await response.text();
          Logger.error(`API请求失败: ${response.status} ${response.statusText}`, errorText);
          ErrorHandler.handleApiError(response, '创建海报生成任务');
        }

        const result = await response.json() as CreateTaskResponse;
        
        if (result.code) {
          Logger.error(`API业务错误: ${result.code} - ${result.message}`);
          ErrorHandler.handleTongyiApiError(result, '创建海报生成任务');
        }

        Logger.info(`海报生成任务创建成功: ${result.output.task_id}`);
        return result;

      }, '创建海报生成任务', 2); // 最多重试2次
    });
  }
  /**
   * 测试模式：创建模拟图像编辑响应
   */
  private createMockImageEditResponse(_params: any): CreateTaskResponse {
    const mockTaskId = `mock_edit_task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    Logger.info(`测试模式：创建模拟图像编辑任务 ${mockTaskId}`);
    
    return {
      output: {
        task_id: mockTaskId,
        task_status: "PENDING"
      },
      request_id: `mock_edit_request_${Date.now()}`
    };
  }
  /**
   * 测试模式：创建模拟海报生成响应
   */  private createMockPosterResponse(params: z.infer<typeof PosterGenerationSchema>): CreateTaskResponse {
    const mockTaskId = `mock_poster_task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    Logger.info(`测试模式：创建模拟海报生成任务 ${mockTaskId} - 标题: ${params.title}, 样式: ${params.lora_name}, 布局: ${params.wh_ratios}`);
    
    return {
      output: {
        task_id: mockTaskId,
        task_status: "PENDING"
      },
      request_id: `mock_poster_request_${Date.now()}`
    };
  }
  async waitForTaskCompletion(
    taskId: string, 
    maxWaitTime: number = Config.MAX_WAIT_TIME, 
    pollInterval: number = Config.POLL_INTERVAL
  ): Promise<QueryTaskResponse> {
    return await withPerformanceMonitoring(async () => {
      const startTime = Date.now();
      let lastStatus = '';
      
      Logger.info(`开始等待任务完成: ${taskId}, 最大等待时间: ${maxWaitTime}ms`);
      
      while (Date.now() - startTime < maxWaitTime) {
        const result = await this.queryTask(taskId);
        const currentStatus = result.output.task_status;
        
        // 只在状态变化时记录日志
        if (currentStatus !== lastStatus) {
          Logger.info(`任务 ${taskId} 状态变更: ${lastStatus} -> ${currentStatus}`);
          lastStatus = currentStatus;
        }
        
        if (currentStatus === TASK_STATUS.SUCCEEDED || 
            currentStatus === TASK_STATUS.FAILED ||
            currentStatus === TASK_STATUS.CANCELED) {
          Logger.info(`任务 ${taskId} 完成，最终状态: ${currentStatus}`);
          return result;
        }
        
        // 等待下一次轮询
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
      
      const elapsed = Date.now() - startTime;
      Logger.warn(`任务 ${taskId} 等待超时，已等待: ${elapsed}ms`);
      
      throw new TongyiError(
        'TIMEOUT_ERROR',
        `任务 ${taskId} 等待超时，请稍后手动查询任务状态`,
        undefined,
        { taskId, elapsed, maxWaitTime }
      );
    }, `等待任务完成-${taskId}`)();
  }
  /**
   * 测试模式：创建模拟响应
   */
  private createMockResponse(_params: any): CreateTaskResponse {
    const mockTaskId = `mock_task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    Logger.info(`测试模式：创建模拟任务 ${mockTaskId}`);
    
    return {
      output: {
        task_id: mockTaskId,
        task_status: "PENDING"
      },
      request_id: `mock_request_${Date.now()}`
    };
  }
  /**
   * 测试模式：创建模拟查询响应
   */
  private createMockQueryResponse(taskId: string): QueryTaskResponse {
    // 模拟任务进度：PENDING -> RUNNING -> SUCCEEDED
    const now = Date.now();
    const taskAge = now - parseInt(taskId.split('_')[2] || '0');
    
    let status: string = TASK_STATUS.PENDING;
    let results: any[] | undefined = undefined;
    
    if (taskAge > 10000) { // 10秒后完成
      status = TASK_STATUS.SUCCEEDED;
      results = [{
        url: 'https://via.placeholder.com/1024x1024/4CAF50/FFFFFF?text=Mock+Generated+Image',
        actual_prompt: '测试模式生成的模拟图片'
      }];
    } else if (taskAge > 5000) { // 5秒后开始运行
      status = TASK_STATUS.RUNNING;
    }

    Logger.debug(`测试模式：任务 ${taskId} 状态 ${status}`);
    
    return {
      output: {
        task_id: taskId,
        task_status: status,
        submit_time: new Date(now - taskAge).toISOString(),
        ...(status === TASK_STATUS.SUCCEEDED && {
          end_time: new Date().toISOString(),
          results
        })
      },
      request_id: `mock_query_${now}`,
      ...(status === TASK_STATUS.SUCCEEDED && {
        usage: { image_count: 1 }
      })
    };
  }
  /**
   * 获取支持的模型信息
   */
  getSupportedModels(): Array<{
    name: string;
    description: string;
    features: string[];
    type: string;
  }> {
    return [
      {
        name: "wanx2.1-t2i-turbo",
        description: "通义万相2.1极速版",
        features: ["生成速度快", "适合快速预览", "成本较低"],
        type: "text-to-image"
      },
      {
        name: "wanx2.1-t2i-plus",
        description: "通义万相2.1增强版",
        features: ["图像质量高", "细节丰富", "支持复杂场景"],
        type: "text-to-image"
      },
      {
        name: "wanx2.0-t2i-turbo",
        description: "通义万相2.0极速版",
        features: ["性价比高", "稳定可靠", "基础功能完整"],
        type: "text-to-image"
      },
      {
        name: "wanx2.1-imageedit",
        description: "通义万相2.1图像编辑",
        features: [
          "全局/局部风格化", 
          "指令编辑/局部重绘", 
          "去水印/扩图", 
          "图像超分/上色",
          "线稿生图/卡通形象生图"
        ],
        type: "image-to-image"
      }
    ];
  }
  /**
   * 获取图像编辑功能详情
   */
  getImageEditFunctions(): Array<{
    name: string;
    displayName: string;
    description: string;
    usage: string;
    parameters: string[];
    examples: string;
  }> {
    return [
      {
        name: IMAGE_EDIT_FUNCTIONS.STYLIZATION_ALL,
        displayName: "全局风格化",
        description: "对整张图像进行风格迁移",
        usage: "转换成法国绘本风格/金箔艺术风格",
        parameters: ["strength"],
        examples: "转换成法国绘本风格"
      },
      {
        name: IMAGE_EDIT_FUNCTIONS.STYLIZATION_LOCAL,
        displayName: "局部风格化", 
        description: "对图像局部区域进行风格迁移",
        usage: "支持8种风格：冰雕、云朵、花灯、木板、青花瓷、毛茸茸、毛线、气球",
        parameters: [],
        examples: "把房子变成木板风格"
      },
      {
        name: IMAGE_EDIT_FUNCTIONS.DESCRIPTION_EDIT,
        displayName: "指令编辑",
        description: "通过指令进行图像编辑，无需指定区域",
        usage: "适合全局调整或粗略修改",
        parameters: ["strength"],
        examples: "把女孩的头发修改为红色"
      },
      {
        name: IMAGE_EDIT_FUNCTIONS.DESCRIPTION_EDIT_WITH_MASK,
        displayName: "局部重绘",
        description: "对指定区域进行精确编辑",
        usage: "需要提供遮罩图像，白色区域为编辑区域",
        parameters: ["mask_image_url"],
        examples: "一只陶瓷兔子抱着一朵陶瓷花"
      },
      {
        name: IMAGE_EDIT_FUNCTIONS.REMOVE_WATERMARK,
        displayName: "去文字水印",
        description: "去除图像中的文字和水印",
        usage: "支持中英文文字去除",
        parameters: [],
        examples: "去除图像中的文字"
      },
      {
        name: IMAGE_EDIT_FUNCTIONS.EXPAND,
        displayName: "扩图",
        description: "在上下左右四个方向按比例扩展图像",
        usage: "可分别设置各方向的扩展比例",
        parameters: ["top_scale", "bottom_scale", "left_scale", "right_scale"],
        examples: "一位绿色仙子"
      },
      {
        name: IMAGE_EDIT_FUNCTIONS.SUPER_RESOLUTION,
        displayName: "图像超分",
        description: "高清放大，提升图像分辨率",
        usage: "可设置放大倍数1-4倍",
        parameters: ["upscale_factor"],
        examples: "图像超分"
      },
      {
        name: IMAGE_EDIT_FUNCTIONS.COLORIZATION,
        displayName: "图像上色",
        description: "将黑白/灰度图像转为彩色",
        usage: "可在提示词中指定颜色",
        parameters: [],
        examples: "蓝色背景，黄色的叶子"
      },
      {
        name: IMAGE_EDIT_FUNCTIONS.DOODLE,
        displayName: "线稿生图",
        description: "基于线稿生成图像",
        usage: "可从RGB图像提取线稿或直接使用线稿图像",
        parameters: ["is_sketch"],
        examples: "北欧极简风格的客厅"
      },
      {
        name: IMAGE_EDIT_FUNCTIONS.CONTROL_CARTOON_FEATURE,
        displayName: "参考卡通形象生图",
        description: "基于卡通形象生成新场景",
        usage: "适合卡通IP开发和儿童教育",
        parameters: [],
        examples: "卡通形象小心翼翼地探出头，窥视着房间内一颗璀璨的蓝色宝石"
      }
    ];
  }
  /**
   * 获取服务状态
   */
  getServiceStatus(): {
    isTestMode: boolean;
    hasApiKey: boolean;
    concurrencyStatus: any;
  } {
    return {
      isTestMode: this.isTestMode,
      hasApiKey: !!this.apiKey,
      concurrencyStatus: this.concurrencyManager.getStatus()
    };
  }

  /**
   * 获取海报样式列表
   */  getPosterStyles(): Array<{
    name: string;
    displayName: string;
    category: string;
    description: string;
  }> {
    return [
      {
        name: POSTER_STYLES.TWO_D_ILLUSTRATION_1,
        displayName: "2D插画1",
        category: "插画风格",
        description: "现代2D插画风格，线条清晰，色彩鲜明"
      },
      {
        name: POSTER_STYLES.TWO_D_ILLUSTRATION_2,
        displayName: "2D插画2",
        category: "插画风格",
        description: "另一种2D插画风格，更加柔和温馨"
      },
      {
        name: POSTER_STYLES.VAST_NEBULA,
        displayName: "浩瀚星云",
        category: "科幻宇宙",
        description: "浩瀚星云风格，充满神秘的宇宙色彩"
      },
      {
        name: POSTER_STYLES.RICH_COLOR,
        displayName: "浓郁色彩",
        category: "色彩丰富",
        description: "色彩浓郁饱满，视觉冲击力强"
      },
      {
        name: POSTER_STYLES.LIGHT_PARTICLE,
        displayName: "光线粒子",
        category: "光效特效",
        description: "光线粒子效果，营造梦幻光影"
      },
      {
        name: POSTER_STYLES.TRANSPARENT_GLASS,
        displayName: "透明玻璃",
        category: "材质质感",
        description: "透明玻璃质感，现代简约风格"
      },
      {
        name: POSTER_STYLES.PAPER_CUT_CRAFT,
        displayName: "剪纸工艺",
        category: "传统工艺",
        description: "中国传统剪纸工艺风格，富有民族特色"
      },
      {
        name: POSTER_STYLES.ORIGAMI_CRAFT,
        displayName: "折纸工艺",
        category: "传统工艺",
        description: "精致的折纸工艺风格，立体感强"
      },
      {
        name: POSTER_STYLES.CHINESE_INK,
        displayName: "中国水墨",
        category: "传统艺术",
        description: "中国传统水墨画风格，意境深远"
      },
      {
        name: POSTER_STYLES.CHINESE_EMBROIDERY,
        displayName: "中国刺绣",
        category: "传统艺术",
        description: "中国传统刺绣风格，精致细腻，具有浓郁的民族特色"
      },
      {
        name: POSTER_STYLES.REAL_SCENE,
        displayName: "真实场景",
        category: "写实主义",
        description: "真实场景风格，接近摄影效果，细节丰富"
      },
      {
        name: POSTER_STYLES.TWO_D_CARTOON,
        displayName: "2D卡通",
        category: "卡通动漫",
        description: "2D卡通风格，活泼可爱，色彩明亮"
      },
      {
        name: POSTER_STYLES.CHILDREN_WATERCOLOR,
        displayName: "儿童水彩",
        category: "艺术绘画",
        description: "儿童水彩画风格，纯真可爱，色彩柔和"
      },
      {
        name: POSTER_STYLES.FAIRY_TALE_OIL,
        displayName: "童话油画",
        category: "艺术绘画",
        description: "童话风格的油画效果，色彩丰富，充满梦幻色彩"
      }
    ];
  }

  /**
   * 获取海报模板示例
   */  getPosterTemplates(): Array<{
    name: string;
    title: string;
    subTitle?: string;
    bodyText?: string;
    promptTextZh?: string;
    promptTextEn?: string;
    style: string;
    layout: string;
    description: string;
  }> {
    return [
      {
        name: "商务发布会",
        title: "新品发布会",
        subTitle: "科技创新未来",
        bodyText: "2024年度重磅产品即将亮相",
        promptTextZh: "现代科技产品发布会场景",
        style: POSTER_STYLES.VAST_NEBULA, // 使用浩瀚星云风格替代科技海报
        layout: POSTER_LAYOUTS.LANDSCAPE,
        description: "适合产品发布会、商务活动的海报模板"
      },
      {
        name: "艺术展览",
        title: "春日艺术展",
        subTitle: "传统与现代的对话",
        bodyText: "感受艺术的无限魅力",
        promptTextZh: "春天艺术展览馆优雅场景",
        style: POSTER_STYLES.CHINESE_INK, // 使用中国水墨风格替代中国风
        layout: POSTER_LAYOUTS.PORTRAIT,
        description: "适合艺术展览、文化活动的海报模板"
      },
      {
        name: "青春校园",
        title: "青春无悔",
        subTitle: "梦想从这里起航",
        bodyText: "记录美好的校园时光",
        promptTextZh: "青春活力的校园生活场景",
        style: POSTER_STYLES.RICH_COLOR, // 使用浓郁色彩风格替代青春风格
        layout: POSTER_LAYOUTS.PORTRAIT,
        description: "适合校园活动、青春主题的海报模板"
      },
      {
        name: "科技未来",
        title: "AI时代",
        subTitle: "智能改变世界",
        bodyText: "拥抱人工智能的无限可能",
        promptTextEn: "futuristic AI technology scene",
        style: POSTER_STYLES.LIGHT_PARTICLE, // 使用光线粒子风格替代赛博朋克
        layout: POSTER_LAYOUTS.LANDSCAPE,
        description: "适合科技活动、AI主题的海报模板"
      },
      {
        name: "极简商务",
        title: "简约之美",
        subTitle: "少即是多",
        bodyText: "追求极致的简约设计",
        promptTextZh: "极简主义设计理念",
        style: POSTER_STYLES.TRANSPARENT_GLASS, // 使用透明玻璃风格替代极简风格
        layout: POSTER_LAYOUTS.PORTRAIT,
        description: "适合品牌宣传、设计展示的海报模板"
      }
    ];
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    // 清理并发管理器的定时器等资源
    Logger.info('通义万相服务已销毁');
  }
}
