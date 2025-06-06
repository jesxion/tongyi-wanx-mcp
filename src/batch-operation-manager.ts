/**
 * 批量操作支持模块
 * 提供批量图片生成、批量处理和批量管理功能
 */

import { Logger } from './logger.js';
import { TongyiWanxService } from './tongyi-service.js';
import { ImageStorage } from './image-storage.js';
import { ImageVersionManager } from './image-version-manager.js';
import { PromptOptimizer } from './prompt-optimizer.js';

export interface BatchGenerationTask {
  id: string;
  prompts: string[];
  options: {
    style?: string;
    size?: string;
    optimize_prompts?: boolean;
    create_variants?: boolean;
    variant_types?: string[];
  };
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: {
    total: number;
    completed: number;
    failed: number;
    current?: string;
  };
  results: BatchGenerationResult[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface BatchGenerationResult {
  prompt: string;
  originalPrompt: string;
  imageId?: string;
  filePath?: string;
  status: 'success' | 'failed';
  error?: string;
  variants?: {
    variantId: string;
    filePath: string;
  }[];
  generatedAt: number;
}

export interface BatchOperationOptions {
  maxConcurrency?: number;
  retryCount?: number;
  continueOnError?: boolean;
  saveToCollection?: string;
}

export class BatchOperationManager {
  private static activeTasks: Map<string, BatchGenerationTask> = new Map();  private static tongyiService: TongyiWanxService;
  private static imageStorage: ImageStorage;

  /**
   * 初始化批量操作管理器
   */  static initialize(
    tongyiService: TongyiWanxService,
    imageStorage: ImageStorage
  ): void {
    this.tongyiService = tongyiService;
    this.imageStorage = imageStorage;
    Logger.info('批量操作管理器初始化成功');
  }

  /**
   * 创建批量生成任务
   */
  static async createBatchGenerationTask(
    prompts: string[],
    options: BatchGenerationTask['options'] = {},
    batchOptions: BatchOperationOptions = {}
  ): Promise<string> {
    const taskId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const task: BatchGenerationTask = {
      id: taskId,
      prompts: [...prompts],
      options: {
        size: '1024*1024',
        optimize_prompts: true,
        create_variants: false,
        variant_types: ['style_transfer'],
        ...options
      },
      status: 'pending',
      progress: {
        total: prompts.length,
        completed: 0,
        failed: 0
      },
      results: [],
      createdAt: Date.now()
    };

    this.activeTasks.set(taskId, task);
    Logger.info(`创建批量生成任务: ${taskId}，包含 ${prompts.length} 个提示词`);
    
    // 异步执行任务
    this.executeBatchTask(taskId, batchOptions).catch(error => {
      Logger.error(`批量任务 ${taskId} 执行失败`, error);
      task.status = 'failed';
      task.error = error.message;
      task.completedAt = Date.now();
    });

    return taskId;
  }

  /**
   * 执行批量任务
   */
  private static async executeBatchTask(
    taskId: string,
    options: BatchOperationOptions
  ): Promise<void> {
    const task = this.activeTasks.get(taskId);
    if (!task) throw new Error(`任务 ${taskId} 不存在`);

    task.status = 'running';
    task.startedAt = Date.now();
    Logger.info(`开始执行批量任务: ${taskId}`);

    const {
      maxConcurrency = 2,
      retryCount = 1,
      continueOnError = true
    } = options;

    // 使用并发管理器控制并发数
    const concurrentPromises: Promise<void>[] = [];
    const semaphore = new Array(maxConcurrency).fill(null);    for (let i = 0; i < task.prompts.length; i++) {
      const originalPrompt = task.prompts[i];

      const executePrompt = async () => {
        task.progress.current = originalPrompt;
        
        try {
          const result = await this.processSinglePrompt(
            originalPrompt,
            task.options,
            retryCount
          );
          
          task.results.push(result);
          task.progress.completed++;
          
          Logger.info(`批量任务 ${taskId}: 完成 ${task.progress.completed}/${task.progress.total}`);
          
        } catch (error) {
          const failedResult: BatchGenerationResult = {
            prompt: originalPrompt,
            originalPrompt,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            generatedAt: Date.now()
          };
          
          task.results.push(failedResult);
          task.progress.failed++;
          
          Logger.error(`批量任务 ${taskId}: 提示词处理失败`, error);
          
          if (!continueOnError) {
            throw error;
          }
        }
      };

      // 控制并发数
      const semaphoreIndex = i % maxConcurrency;
      if (semaphore[semaphoreIndex]) {
        await semaphore[semaphoreIndex];
      }
      
      semaphore[semaphoreIndex] = executePrompt();
      concurrentPromises.push(semaphore[semaphoreIndex]);
    }

    // 等待所有任务完成
    await Promise.allSettled(concurrentPromises);

    task.status = 'completed';
    task.completedAt = Date.now();
    task.progress.current = undefined;

    Logger.info(`批量任务 ${taskId} 完成: 成功 ${task.progress.completed}, 失败 ${task.progress.failed}`);
  }

  /**
   * 处理单个提示词
   */
  private static async processSinglePrompt(
    originalPrompt: string,
    options: BatchGenerationTask['options'],
    retryCount: number
  ): Promise<BatchGenerationResult> {
    let prompt = originalPrompt;
    let attempt = 0;
    let lastError: Error | null = null;

    // 优化提示词
    if (options.optimize_prompts) {
      try {
        const optimization = PromptOptimizer.analyzeAndOptimize(
          originalPrompt,
          options.style,
          'advanced'
        );
        prompt = optimization.optimized;
        Logger.info(`提示词优化: "${originalPrompt}" -> "${prompt}"`);
      } catch (error) {
        Logger.warn('提示词优化失败，使用原始提示词');
      }
    }

    // 重试机制
    while (attempt <= retryCount) {
      try {        // 生成主图片
        const taskResponse = await this.tongyiService.createTextToImageTask({
          model: 'wanx2.1-t2i-turbo',
          prompt: prompt,
          size: options.size || '1024*1024',
          n: 1,
          prompt_extend: true,
          watermark: false
        });
        
        // 等待任务完成
        const completedTask = await this.tongyiService.waitForTaskCompletion(taskResponse.output.task_id);
        
        if (completedTask.output.task_status !== 'SUCCEEDED' || !completedTask.output.results) {
          throw new Error('图片生成失败');
        }        
        const imageUrl = completedTask.output.results[0].url;
        if (!imageUrl) {
          throw new Error('图片生成成功但未返回图片URL');
        }

        // 保存图片
        const savedImage = await this.imageStorage.downloadAndStore(
          imageUrl,
          prompt,
          { 
            model: 'wanx2.1-t2i-turbo',
            size: options.size || '1024*1024',
            task_id: taskResponse.output.task_id,
            actualPrompt: prompt
          }
        );

        // 创建版本记录
        await ImageVersionManager.createVersion(
          savedImage.id,
          prompt,
          savedImage.localPath || savedImage.resourceUri,
          {
            size: options.size || '1024*1024',
            batch_id: savedImage.id.split('_')[0]
          }
        );

        const result: BatchGenerationResult = {
          prompt,
          originalPrompt,
          imageId: savedImage.id,
          filePath: savedImage.localPath || savedImage.resourceUri,
          status: 'success',
          generatedAt: Date.now(),
          variants: []
        };

        // 生成变体（如果需要）
        if (options.create_variants && options.variant_types && options.variant_types.length > 0) {
          result.variants = await this.generateVariants(
            savedImage.id,
            prompt,
            options.variant_types
          );
        }

        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;
        
        if (attempt <= retryCount) {
          Logger.warn(`提示词处理失败，第 ${attempt} 次重试: ${originalPrompt}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 递增延迟
        }
      }
    }

    throw lastError || new Error('未知错误');
  }

  /**
   * 生成图片变体
   */
  private static async generateVariants(
    baseImageId: string,
    basePrompt: string,
    variantTypes: string[]
  ): Promise<{ variantId: string; filePath: string }[]> {
    const variants: { variantId: string; filePath: string }[] = [];

    for (const variantType of variantTypes) {
      try {
        const variantPrompts = ImageVersionManager.generateVariantPrompts(
          basePrompt,
          variantType as any
        );

        if (variantPrompts.length > 0) {
          const variantPrompt = variantPrompts[0];
          
          // 创建变体记录
          const { variantId, prompt: finalPrompt } = await ImageVersionManager.createImageVariant(
            baseImageId,
            variantType as any,
            `${variantType} 变体`,
            variantPrompt
          );          // 生成变体图片
          const variantTaskResponse = await this.tongyiService.createTextToImageTask({
            model: 'wanx2.1-t2i-turbo',
            prompt: finalPrompt,
            size: '1024*1024',
            n: 1,
            prompt_extend: true,
            watermark: false
          });
          
          const variantCompletedTask = await this.tongyiService.waitForTaskCompletion(variantTaskResponse.output.task_id);
            if (variantCompletedTask.output.task_status === 'SUCCEEDED' && variantCompletedTask.output.results) {
            const variantImageUrl = variantCompletedTask.output.results[0].url;
            if (!variantImageUrl) {
              Logger.warn(`变体图片生成成功但未返回URL: ${variantType}`);
              continue;
            }
            
            const savedVariant = await this.imageStorage.downloadAndStore(
              variantImageUrl,
              finalPrompt,
              {
                model: 'wanx2.1-t2i-turbo',
                size: '1024*1024',
                task_id: variantTaskResponse.output.task_id,
                actualPrompt: finalPrompt
              }
            );            variants.push({
              variantId,
              filePath: savedVariant.localPath || savedVariant.resourceUri
            });
          }
        }
      } catch (error) {
        Logger.warn(`生成变体失败: ${variantType}`);
      }
    }

    return variants;
  }

  /**
   * 获取任务状态
   */
  static getTaskStatus(taskId: string): BatchGenerationTask | null {
    return this.activeTasks.get(taskId) || null;
  }

  /**
   * 取消任务
   */
  static cancelTask(taskId: string): boolean {
    const task = this.activeTasks.get(taskId);
    if (!task) return false;

    if (task.status === 'pending' || task.status === 'running') {
      task.status = 'cancelled';
      task.completedAt = Date.now();
      Logger.info(`取消批量任务: ${taskId}`);
      return true;
    }

    return false;
  }

  /**
   * 获取所有活跃任务
   */
  static getActiveTasks(): BatchGenerationTask[] {
    return Array.from(this.activeTasks.values());
  }

  /**
   * 清理已完成的任务
   */
  static cleanupCompletedTasks(olderThanMinutes: number = 60): number {
    const cutoffTime = Date.now() - (olderThanMinutes * 60 * 1000);
    let cleanedCount = 0;

    for (const [taskId, task] of this.activeTasks.entries()) {
      if ((task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') &&
          (task.completedAt || task.createdAt) < cutoffTime) {
        this.activeTasks.delete(taskId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      Logger.info(`清理了 ${cleanedCount} 个已完成的批量任务`);
    }

    return cleanedCount;
  }

  /**
   * 批量优化提示词
   */
  static async batchOptimizePrompts(
    prompts: string[],
    targetStyle?: string,
    level: string = 'advanced'
  ): Promise<{ original: string; optimized: string; improvements: any }[]> {
    const results: { original: string; optimized: string; improvements: any }[] = [];

    for (const prompt of prompts) {
      try {
        const optimization = PromptOptimizer.analyzeAndOptimize(prompt, targetStyle, level);
        results.push({
          original: prompt,
          optimized: optimization.optimized,
          improvements: optimization.improvements
        });
      } catch (error) {
        Logger.error(`提示词优化失败: ${prompt}`, error);
        results.push({
          original: prompt,
          optimized: prompt, // 保持原样
          improvements: { clarity_gain: 0, completeness_gain: 0, estimated_quality_boost: 0 }
        });
      }
    }

    return results;
  }

  /**
   * 批量生成风格变体
   */
  static async batchGenerateStyleVariants(
    baseImageIds: string[],
    targetStyles: string[]
  ): Promise<{ baseImageId: string; variants: any[] }[]> {
    const results: { baseImageId: string; variants: any[] }[] = [];

    for (const baseImageId of baseImageIds) {
      const variants: any[] = [];
      
      try {
        // 获取原始提示词
        const history = await ImageVersionManager.getVersionHistory(baseImageId);
        if (!history) {
          Logger.warn(`找不到图片 ${baseImageId} 的版本历史`);
          continue;
        }

        const originalPrompt = history.originalPrompt;

        // 为每种风格生成变体
        for (const style of targetStyles) {
          try {
            const { variantId } = await ImageVersionManager.createImageVariant(
              baseImageId,
              'style_transfer',
              `${style}风格变体`,
              `${originalPrompt}，${style}风格`
            );

            variants.push({
              variantId,
              style,
              status: 'created'
            });
          } catch (error) {
            Logger.error(`创建风格变体失败: ${baseImageId} -> ${style}`, error);
            variants.push({
              variantId: null,
              style,
              status: 'failed',
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        results.push({ baseImageId, variants });
      } catch (error) {
        Logger.error(`处理图片 ${baseImageId} 失败`, error);
        results.push({
          baseImageId,
          variants: [{
            variantId: null,
            style: 'unknown',
            status: 'failed',
            error: error instanceof Error ? error.message : String(error)
          }]
        });
      }
    }

    return results;
  }

  /**
   * 获取批量操作统计
   */
  static getBatchStats(): {
    activeTasks: number;
    completedTasks: number;
    failedTasks: number;
    totalImagesGenerated: number;
  } {
    let completedTasks = 0;
    let failedTasks = 0;
    let totalImagesGenerated = 0;

    for (const task of this.activeTasks.values()) {
      if (task.status === 'completed') {
        completedTasks++;
        totalImagesGenerated += task.progress.completed;
      } else if (task.status === 'failed') {
        failedTasks++;
      }
    }

    return {
      activeTasks: this.activeTasks.size,
      completedTasks,
      failedTasks,
      totalImagesGenerated
    };
  }
}
