import { Logger } from './logger.js';

/**
 * 并发控制管理器
 */
export class ConcurrencyManager {
  private activeRequests = 0;
  private readonly maxConcurrent: number;
  private readonly queue: Array<{
    resolve: (value: void) => void;
    reject: (reason?: any) => void;
    timestamp: number;
  }> = [];

  constructor(maxConcurrent: number = 2) {
    this.maxConcurrent = maxConcurrent;
    Logger.info(`并发管理器初始化，最大并发数: ${maxConcurrent}`);
  }

  /**
   * 获取执行许可
   */
  async acquire(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.activeRequests < this.maxConcurrent) {
        this.activeRequests++;
        Logger.debug(`获取执行许可，当前活跃请求: ${this.activeRequests}/${this.maxConcurrent}`);
        resolve();
      } else {
        // 添加到队列
        this.queue.push({
          resolve,
          reject,
          timestamp: Date.now()
        });
        Logger.debug(`请求加入队列，队列长度: ${this.queue.length}`);
      }
    });
  }

  /**
   * 释放执行许可
   */
  release(): void {
    this.activeRequests--;
    Logger.debug(`释放执行许可，当前活跃请求: ${this.activeRequests}/${this.maxConcurrent}`);
    
    // 处理队列中的下一个请求
    if (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const next = this.queue.shift()!;
      this.activeRequests++;
      Logger.debug(`从队列处理下一个请求，队列剩余: ${this.queue.length}`);
      next.resolve();
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    activeRequests: number;
    maxConcurrent: number;
    queueLength: number;
  } {
    return {
      activeRequests: this.activeRequests,
      maxConcurrent: this.maxConcurrent,
      queueLength: this.queue.length
    };
  }

  /**
   * 清理超时的队列请求
   */
  cleanupTimeoutRequests(timeoutMs: number = 30000): void {
    const now = Date.now();
    const beforeCount = this.queue.length;
    
    // 移除超时的请求
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const request = this.queue[i];
      if (now - request.timestamp > timeoutMs) {
        this.queue.splice(i, 1);
        request.reject(new Error('请求队列等待超时'));
      }
    }
    
    const removedCount = beforeCount - this.queue.length;
    if (removedCount > 0) {
      Logger.warn(`清理了 ${removedCount} 个超时的队列请求`);
    }
  }

  /**
   * 包装异步操作以使用并发控制
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await operation();
    } finally {
      this.release();
    }
  }
}

/**
 * 性能监控装饰器
 */
export function withPerformanceMonitoring<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  operationName: string
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    try {
      const result = await fn(...args);
      const duration = Date.now() - startTime;
      Logger.performance(operationName, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.error(`${operationName} 执行失败 (耗时: ${duration}ms)`, error);
      throw error;
    }
  }) as T;
}
