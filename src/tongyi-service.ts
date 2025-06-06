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
   * 轮询等待任务完成
   */
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
  }> {
    return [
      {
        name: "wanx2.1-t2i-turbo",
        description: "通义万相2.1极速版",
        features: ["生成速度快", "适合快速预览", "成本较低"]
      },
      {
        name: "wanx2.1-t2i-plus",
        description: "通义万相2.1增强版",
        features: ["图像质量高", "细节丰富", "支持复杂场景"]
      },
      {
        name: "wanx2.0-t2i-turbo",
        description: "通义万相2.0极速版",
        features: ["性价比高", "稳定可靠", "基础功能完整"]
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
   * 销毁服务
   */
  destroy(): void {
    // 清理并发管理器的定时器等资源
    Logger.info('通义万相服务已销毁');
  }
}
