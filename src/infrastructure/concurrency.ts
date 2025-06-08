import { Logger } from './logger.js';

/**
 * 请求优先级枚举
 */
export enum RequestPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4
}

/**
 * 队列项接口
 */
interface QueueItem {
  resolve: (value: void) => void;
  reject: (reason?: any) => void;
  timestamp: number;
  priority: RequestPriority;
  id: string;
  operation?: string;
}

/**
 * 负载均衡策略
 */
export class LoadBalancer {
  private requestCounts: Map<string, number> = new Map();
  private lastUsed: Map<string, number> = new Map();

  /**
   * 根据负载选择最佳执行时机
   */
  getOptimalDelay(): number {
    const baseDelay = 100; // 基础延迟 100ms
    const currentLoad = this.getCurrentLoad();
    
    if (currentLoad > 0.8) {
      return baseDelay * 3; // 高负载时延迟 300ms
    } else if (currentLoad > 0.5) {
      return baseDelay * 2; // 中等负载时延迟 200ms
    }
    
    return baseDelay; // 低负载时延迟 100ms
  }

  /**
   * 获取当前负载率
   */
  private getCurrentLoad(): number {
    const now = Date.now();
    const recentWindow = 5000; // 5秒窗口
    
    let recentRequests = 0;
    for (const [operation, lastTime] of this.lastUsed.entries()) {
      if (now - lastTime < recentWindow) {
        recentRequests += this.requestCounts.get(operation) || 0;
      }
    }
    
    return Math.min(recentRequests / 10, 1); // 假设最大容量为10个请求/5秒
  }

  /**
   * 记录请求
   */
  recordRequest(operation: string): void {
    this.requestCounts.set(operation, (this.requestCounts.get(operation) || 0) + 1);
    this.lastUsed.set(operation, Date.now());
  }

  /**
   * 获取负载统计
   */
  getLoadStats(): {
    currentLoad: number;
    totalRequests: number;
    recentRequests: number;
    operations: Array<{
      name: string;
      count: number;
      lastUsed: number;
    }>;
  } {
    const now = Date.now();
    const recentWindow = 5000; // 5秒窗口
    
    let totalRequests = 0;
    let recentRequests = 0;
    const operations: Array<{
      name: string;
      count: number;
      lastUsed: number;
    }> = [];

    for (const [operation, count] of this.requestCounts.entries()) {
      const lastTime = this.lastUsed.get(operation) || 0;
      totalRequests += count;
      
      if (now - lastTime < recentWindow) {
        recentRequests += count;
      }
      
      operations.push({
        name: operation,
        count,
        lastUsed: lastTime
      });
    }

    return {
      currentLoad: this.getCurrentLoad(),
      totalRequests,
      recentRequests,
      operations: operations.sort((a, b) => b.lastUsed - a.lastUsed)
    };
  }
}

/**
 * 性能指标接口
 */
interface PerformanceMetrics {
  operationName: string;
  duration: number;
  timestamp: number;
  success: boolean;
  errorType?: string;
  memoryUsage?: number;
}

/**
 * 性能统计接口
 */
interface PerformanceStats {
  totalOperations: number;
  averageDuration: number;
  successRate: number;
  operationBreakdown: Record<string, {
    count: number;
    averageDuration: number;
    successRate: number;
    minDuration: number;
    maxDuration: number;
  }>;
  recentMetrics: PerformanceMetrics[];
}

/**
 * 增强的性能监控管理器
 */
export class PerformanceMonitor {
  private static metrics: PerformanceMetrics[] = [];
  private static readonly maxMetrics = 1000; // 保留最近1000条记录
  private static startTime = Date.now();

  /**
   * 记录性能指标
   */
  static recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // 保持数组大小在限制内
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // 记录到日志
    Logger.performance(metric.operationName, metric.duration);
    
    // 记录内存使用（如果可用）
    if (metric.memoryUsage) {
      Logger.debug(`内存使用 - ${metric.operationName}: ${Math.round(metric.memoryUsage / 1024 / 1024)}MB`);
    }
  }

  /**
   * 获取性能统计
   */
  static getStats(): PerformanceStats {
    if (this.metrics.length === 0) {
      return {
        totalOperations: 0,
        averageDuration: 0,
        successRate: 0,
        operationBreakdown: {},
        recentMetrics: []
      };
    }

    const successfulOps = this.metrics.filter(m => m.success);
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    
    // 按操作类型分组统计
    const operationBreakdown: Record<string, {
      count: number;
      averageDuration: number;
      successRate: number;
      minDuration: number;
      maxDuration: number;
    }> = {};

    for (const metric of this.metrics) {
      if (!operationBreakdown[metric.operationName]) {
        operationBreakdown[metric.operationName] = {
          count: 0,
          averageDuration: 0,
          successRate: 0,
          minDuration: Number.MAX_SAFE_INTEGER,
          maxDuration: 0
        };
      }

      const breakdown = operationBreakdown[metric.operationName];
      breakdown.count++;
      breakdown.minDuration = Math.min(breakdown.minDuration, metric.duration);
      breakdown.maxDuration = Math.max(breakdown.maxDuration, metric.duration);
    }

    // 计算平均值和成功率
    for (const [opName, breakdown] of Object.entries(operationBreakdown)) {
      const opMetrics = this.metrics.filter(m => m.operationName === opName);
      const successfulOpMetrics = opMetrics.filter(m => m.success);
      
      breakdown.averageDuration = opMetrics.reduce((sum, m) => sum + m.duration, 0) / opMetrics.length;
      breakdown.successRate = successfulOpMetrics.length / opMetrics.length;
    }

    return {
      totalOperations: this.metrics.length,
      averageDuration: totalDuration / this.metrics.length,
      successRate: successfulOps.length / this.metrics.length,
      operationBreakdown,
      recentMetrics: this.metrics.slice(-20) // 最近20条记录
    };
  }

  /**
   * 获取系统运行时间
   */
  static getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * 清理旧的性能数据
   */
  static cleanup(olderThanMs: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - olderThanMs;
    const beforeCount = this.metrics.length;
    
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
    
    const removedCount = beforeCount - this.metrics.length;
    if (removedCount > 0) {
      Logger.info(`清理性能数据: 移除 ${removedCount} 条记录`);
    }
  }

  /**
   * 检测性能异常
   */
  static detectAnomalies(): Array<{
    operationName: string;
    issue: string;
    severity: 'low' | 'medium' | 'high';
    details: string;
  }> {
    const anomalies: Array<{
      operationName: string;
      issue: string;
      severity: 'low' | 'medium' | 'high';
      details: string;
    }> = [];

    const stats = this.getStats();

    for (const [opName, breakdown] of Object.entries(stats.operationBreakdown)) {
      // 检测高错误率
      if (breakdown.successRate < 0.9 && breakdown.count > 10) {
        anomalies.push({
          operationName: opName,
          issue: '高错误率',
          severity: breakdown.successRate < 0.5 ? 'high' : 'medium',
          details: `成功率: ${Math.round(breakdown.successRate * 100)}%`
        });
      }

      // 检测响应时间异常
      if (breakdown.averageDuration > 10000) { // 超过10秒
        anomalies.push({
          operationName: opName,
          issue: '响应时间过长',
          severity: breakdown.averageDuration > 30000 ? 'high' : 'medium',
          details: `平均响应时间: ${Math.round(breakdown.averageDuration)}ms`
        });
      }

      // 检测响应时间波动大
      const durationRange = breakdown.maxDuration - breakdown.minDuration;
      if (durationRange > breakdown.averageDuration * 5 && breakdown.count > 5) {
        anomalies.push({
          operationName: opName,
          issue: '响应时间不稳定',
          severity: 'low',
          details: `时间范围: ${Math.round(breakdown.minDuration)}-${Math.round(breakdown.maxDuration)}ms`
        });
      }
    }

    return anomalies;
  }
}

/**
 * 高性能并发控制管理器
 * 支持优先级队列、智能负载均衡和动态调整
 */
export class ConcurrencyManager {
  private activeRequests = 0;
  private readonly maxConcurrent: number;
  private readonly priorityQueue: QueueItem[] = [];
  private readonly loadBalancer: LoadBalancer;
  private requestCounter = 0;

  constructor(maxConcurrent: number = 2) {
    this.maxConcurrent = maxConcurrent;
    this.loadBalancer = new LoadBalancer();
    Logger.info(`并发管理器初始化，最大并发数: ${maxConcurrent}`);
  }

  /**
   * 获取执行许可（支持优先级）
   */
  async acquire(priority: RequestPriority = RequestPriority.NORMAL, operation?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.activeRequests < this.maxConcurrent) {
        this.activeRequests++;
        this.loadBalancer.recordRequest(operation || 'unknown');
        Logger.debug(`获取执行许可，当前活跃请求: ${this.activeRequests}/${this.maxConcurrent}`);
        resolve();
      } else {
        // 添加到优先级队列
        const queueItem: QueueItem = {
          resolve,
          reject,
          timestamp: Date.now(),
          priority,
          id: `req_${++this.requestCounter}`,
          operation
        };
        
        this.insertByPriority(queueItem);
        Logger.debug(`请求加入优先级队列，队列长度: ${this.priorityQueue.length}, 优先级: ${priority}`);
      }
    });
  }

  /**
   * 按优先级插入队列
   */
  private insertByPriority(item: QueueItem): void {
    let insertIndex = this.priorityQueue.length;
    
    // 找到合适的插入位置（高优先级在前）
    for (let i = 0; i < this.priorityQueue.length; i++) {
      if (this.priorityQueue[i].priority < item.priority) {
        insertIndex = i;
        break;
      }
    }
    
    this.priorityQueue.splice(insertIndex, 0, item);
  }

  /**
   * 释放执行许可
   */
  release(): void {
    this.activeRequests--;
    Logger.debug(`释放执行许可，当前活跃请求: ${this.activeRequests}/${this.maxConcurrent}`);
    
    // 处理队列中的下一个请求
    if (this.priorityQueue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const next = this.priorityQueue.shift()!;
      this.activeRequests++;
      
      // 记录负载均衡信息
      if (next.operation) {
        this.loadBalancer.recordRequest(next.operation);
      }
      
      Logger.debug(`从优先级队列处理下一个请求，队列剩余: ${this.priorityQueue.length}, 优先级: ${next.priority}`);
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
    queueByPriority: Record<string, number>;
    loadStats: any;
  } {
    const queueByPriority: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 0,
      NORMAL: 0,
      LOW: 0
    };

    for (const item of this.priorityQueue) {
      const priorityName = RequestPriority[item.priority];
      queueByPriority[priorityName]++;
    }

    return {
      activeRequests: this.activeRequests,
      maxConcurrent: this.maxConcurrent,
      queueLength: this.priorityQueue.length,
      queueByPriority,
      loadStats: this.loadBalancer.getLoadStats()
    };
  }

  /**
   * 清理超时的队列请求
   */
  cleanupTimeoutRequests(timeoutMs: number = 30000): void {
    const now = Date.now();
    const beforeCount = this.priorityQueue.length;
    
    // 移除超时的请求
    for (let i = this.priorityQueue.length - 1; i >= 0; i--) {
      const request = this.priorityQueue[i];
      if (now - request.timestamp > timeoutMs) {
        this.priorityQueue.splice(i, 1);
        request.reject(new Error(`请求队列等待超时: ${request.id}`));
      }
    }
    
    const removedCount = beforeCount - this.priorityQueue.length;
    if (removedCount > 0) {
      Logger.warn(`清理了 ${removedCount} 个超时的队列请求`);
    }
  }

  /**
   * 包装异步操作以使用并发控制（支持优先级）
   */
  async execute<T>(
    operation: () => Promise<T>, 
    priority: RequestPriority = RequestPriority.NORMAL,
    operationName?: string
  ): Promise<T> {
    // 获取智能延迟
    const optimalDelay = this.loadBalancer.getOptimalDelay();
    if (optimalDelay > 100) {
      await new Promise(resolve => setTimeout(resolve, optimalDelay));
    }

    await this.acquire(priority, operationName);
    try {
      return await operation();
    } finally {
      this.release();
    }
  }

  /**
   * 动态调整并发数
   */
  adjustConcurrency(newMaxConcurrent: number): void {
    if (newMaxConcurrent > 0 && newMaxConcurrent !== this.maxConcurrent) {
      const oldMax = this.maxConcurrent;
      (this as any).maxConcurrent = newMaxConcurrent;
      
      Logger.info(`并发数已调整: ${oldMax} -> ${newMaxConcurrent}`);
      
      // 如果增加了并发数，尝试处理队列中的请求
      if (newMaxConcurrent > oldMax) {
        this.processQueuedRequests();
      }
    }
  }

  /**
   * 处理队列中等待的请求
   */
  private processQueuedRequests(): void {
    while (this.priorityQueue.length > 0 && this.activeRequests < this.maxConcurrent) {
      this.release();
    }
  }

  /**
   * 获取队列详细信息
   */
  getQueueDetails(): Array<{
    id: string;
    priority: string;
    operation?: string;
    waitTime: number;
  }> {
    const now = Date.now();
    return this.priorityQueue.map(item => ({
      id: item.id,
      priority: RequestPriority[item.priority],
      operation: item.operation,
      waitTime: now - item.timestamp
    }));
  }

  /**
   * 销毁并发管理器
   */
  destroy(): void {
    // 取消所有等待的请求
    for (const item of this.priorityQueue) {
      item.reject(new Error('并发管理器已销毁'));
    }
    this.priorityQueue.length = 0;
    
    Logger.info('并发管理器已销毁');
  }
}

/**
 * 增强的性能监控装饰器
 */
export function withPerformanceMonitoring<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  operationName?: string
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    const opName = operationName || fn.name || '未知操作';
    
    // 记录初始内存使用
    const initialMemory = process.memoryUsage();
    
    try {
      const result = await fn(...args);
      const duration = Date.now() - startTime;
      
      // 记录最终内存使用
      const finalMemory = process.memoryUsage();
      const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // 记录性能指标
      PerformanceMonitor.recordMetric({
        operationName: opName,
        duration,
        timestamp: Date.now(),
        success: true,
        memoryUsage: finalMemory.heapUsed
      });
      
      // 如果内存增长过大，发出警告
      if (memoryDelta > 50 * 1024 * 1024) { // 50MB
        Logger.warn(`操作 ${opName} 导致内存增长: ${Math.round(memoryDelta / 1024 / 1024)}MB`);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const finalMemory = process.memoryUsage();
      
      // 记录失败的性能指标
      PerformanceMonitor.recordMetric({
        operationName: opName,
        duration,
        timestamp: Date.now(),
        success: false,
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        memoryUsage: finalMemory.heapUsed
      });
      
      Logger.error(`${opName} 执行失败 (耗时: ${duration}ms)`, error);
      throw error;
    }
  }) as T;
}

/**
 * 内存监控工具
 */
export class MemoryMonitor {
  private static lastCleanup = Date.now();
  private static memoryHistory: Array<{
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  }> = [];

  /**
   * 获取当前内存使用情况
   */
  static getCurrentMemoryUsage(): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    heapUsedMB: number;
    heapTotalMB: number;
    externalMB: number;
    rssMB: number;
  } {
    const usage = process.memoryUsage();
    return {
      ...usage,
      heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
      externalMB: Math.round(usage.external / 1024 / 1024),
      rssMB: Math.round(usage.rss / 1024 / 1024)
    };
  }

  /**
   * 记录内存使用历史
   */
  static recordMemoryUsage(): void {
    const usage = process.memoryUsage();
    this.memoryHistory.push({
      timestamp: Date.now(),
      ...usage
    });

    // 保留最近1小时的数据
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.memoryHistory = this.memoryHistory.filter(record => record.timestamp > oneHourAgo);
  }

  /**
   * 获取内存使用趋势
   */
  static getMemoryTrend(): {
    current: number;
    peak: number;
    average: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    growthRate: number; // MB/hour
  } {
    if (this.memoryHistory.length < 2) {
      const current = this.getCurrentMemoryUsage();
      return {
        current: current.heapUsedMB,
        peak: current.heapUsedMB,
        average: current.heapUsedMB,
        trend: 'stable',
        growthRate: 0
      };
    }

    const current = this.memoryHistory[this.memoryHistory.length - 1].heapUsed;
    const peak = Math.max(...this.memoryHistory.map(r => r.heapUsed));
    const average = this.memoryHistory.reduce((sum, r) => sum + r.heapUsed, 0) / this.memoryHistory.length;

    // 计算趋势
    const first = this.memoryHistory[0];
    const last = this.memoryHistory[this.memoryHistory.length - 1];
    const timeDiff = last.timestamp - first.timestamp;
    const memoryDiff = last.heapUsed - first.heapUsed;
    
    // 增长率 (MB/小时)
    const growthRate = timeDiff > 0 ? 
      (memoryDiff / 1024 / 1024) / (timeDiff / 1000 / 60 / 60) : 0;

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (Math.abs(growthRate) > 1) { // 超过1MB/小时的变化
      trend = growthRate > 0 ? 'increasing' : 'decreasing';
    }

    return {
      current: Math.round(current / 1024 / 1024),
      peak: Math.round(peak / 1024 / 1024),
      average: Math.round(average / 1024 / 1024),
      trend,
      growthRate: Math.round(growthRate * 100) / 100
    };
  }

  /**
   * 检查是否需要垃圾回收
   */
  static checkGarbageCollection(): boolean {
    const usage = this.getCurrentMemoryUsage();
    const trend = this.getMemoryTrend();
    
    // 如果内存使用超过500MB或增长率过快，建议进行垃圾回收
    const shouldGC = usage.heapUsedMB > 500 || trend.growthRate > 50;
    
    if (shouldGC) {
      Logger.warn(`内存使用过高，建议垃圾回收: ${usage.heapUsedMB}MB (增长率: ${trend.growthRate}MB/h)`);
    }
    
    return shouldGC;
  }

  /**
   * 执行垃圾回收（如果可用）
   */
  static forceGarbageCollection(): void {
    if (global.gc) {
      const beforeUsage = this.getCurrentMemoryUsage();
      global.gc();
      const afterUsage = this.getCurrentMemoryUsage();
      
      const freed = beforeUsage.heapUsedMB - afterUsage.heapUsedMB;
      Logger.info(`垃圾回收完成，释放内存: ${freed}MB`);
      
      this.lastCleanup = Date.now();
    } else {
      Logger.warn('垃圾回收不可用，请使用 --expose-gc 启动参数');
    }
  }

  /**
   * 自动内存管理
   */
  static autoMemoryManagement(): void {
    // 记录当前内存使用
    this.recordMemoryUsage();
    
    // 检查是否需要垃圾回收
    if (this.checkGarbageCollection()) {
      const timeSinceLastCleanup = Date.now() - this.lastCleanup;
      
      // 至少间隔5分钟才执行垃圾回收
      if (timeSinceLastCleanup > 5 * 60 * 1000) {
        this.forceGarbageCollection();
      }
    }
  }
}

/**
 * 内存管理和自动清理工具
 */
export class MemoryManager {
  private static warningThreshold = 0.8; // 80%内存使用率警告
  private static criticalThreshold = 0.9; // 90%内存使用率严重警告
  private static cleanupInterval: NodeJS.Timeout | null = null;
  private static isCleanupRunning = false;

  /**
   * 启动内存监控
   */
  static startMonitoring(intervalMs: number = 30000): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, intervalMs);

    Logger.info('内存监控已启动');
  }

  /**
   * 停止内存监控
   */
  static stopMonitoring(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      Logger.info('内存监控已停止');
    }
  }

  /**
   * 检查内存使用情况
   */
  private static checkMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    const totalHeap = memUsage.heapTotal;
    const usedHeap = memUsage.heapUsed;
    const external = memUsage.external;
    
    // 检查堆内存使用率
    const heapUsageRatio = usedHeap / totalHeap;    // 发出警告
    if (heapUsageRatio > this.criticalThreshold) {
      const warningMsg = `内存使用率过高！堆内存: ${Math.round(usedHeap / 1024 / 1024)}MB/${Math.round(totalHeap / 1024 / 1024)}MB (${Math.round(heapUsageRatio * 100)}%), 外部内存: ${Math.round(external / 1024 / 1024)}MB`;
      Logger.warn(warningMsg);

      // 触发内存清理
      this.performCleanup();
    } else if (heapUsageRatio > this.warningThreshold) {
      const warningMsg = `内存使用率较高 堆内存: ${Math.round(usedHeap / 1024 / 1024)}MB (${Math.round(heapUsageRatio * 100)}%)`;
      Logger.warn(warningMsg);
    }
  }

  /**
   * 执行内存清理
   */
  static async performCleanup(): Promise<void> {
    if (this.isCleanupRunning) {
      Logger.debug('内存清理已在进行中，跳过');
      return;
    }

    this.isCleanupRunning = true;
    Logger.info('开始执行内存清理');

    try {
      // 清理性能数据
      PerformanceMonitor.cleanup(60 * 60 * 1000); // 清理1小时前的数据
      
      // 触发MemoryMonitor的自动清理
      MemoryMonitor.autoMemoryManagement();

      // 强制垃圾回收（如果可用）
      if (global.gc) {
        const beforeGC = process.memoryUsage();
        global.gc();
        const afterGC = process.memoryUsage();
        
        const memoryFreed = beforeGC.heapUsed - afterGC.heapUsed;
        Logger.info(`垃圾回收完成: 释放 ${Math.round(memoryFreed / 1024 / 1024)}MB 内存`);
      }

      Logger.info('内存清理完成');
    } catch (error) {
      Logger.error('内存清理失败', error);
    } finally {
      this.isCleanupRunning = false;
    }
  }

  /**
   * 获取内存使用报告
   */
  static getMemoryReport(): {
    process: {
      heapUsed: string;
      heapTotal: string;
      external: string;
      rss: string;
    };
    trend: any;
    gc: {
      available: boolean;
      lastRun?: number;
    };
  } {
    const memUsage = process.memoryUsage();
    const trend = MemoryMonitor.getMemoryTrend();

    return {
      process: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
        external: Math.round(memUsage.external / 1024 / 1024) + 'MB',
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB'
      },
      trend,
      gc: {
        available: typeof global.gc === 'function'
      }
    };
  }

  /**
   * 设置内存警告阈值
   */
  static setThresholds(warning: number, critical: number): void {
    if (warning >= 0 && warning <= 1 && critical >= 0 && critical <= 1 && warning < critical) {
      this.warningThreshold = warning;
      this.criticalThreshold = critical;
      Logger.info(`内存警告阈值已更新: 警告=${Math.round(warning * 100)}%, 严重=${Math.round(critical * 100)}%`);
    } else {
      throw new Error('无效的阈值设置');
    }
  }
}
