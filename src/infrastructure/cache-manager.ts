import { Logger } from './logger.js';

/**
 * 缓存项接口
 */
interface CacheItem<T> {
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

/**
 * 缓存统计接口
 */
interface CacheStats {
  totalKeys: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  memoryUsage: number;
}

/**
 * 内存缓存管理器
 * 提供高性能的内存缓存功能，支持TTL、LRU淘汰等特性
 */
export class CacheManager {
  private cache = new Map<string, CacheItem<any>>();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0
  };
  private readonly maxSize: number;
  private readonly defaultTtl: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    maxSize: number = 1000,
    defaultTtl: number = 5 * 60 * 1000, // 5分钟
    cleanupIntervalMs: number = 60 * 1000 // 1分钟清理一次
  ) {
    this.maxSize = maxSize;
    this.defaultTtl = defaultTtl;
    
    // 启动定期清理过期项
    this.startCleanup(cleanupIntervalMs);
    
    Logger.info(`缓存管理器初始化完成: maxSize=${maxSize}, defaultTtl=${defaultTtl}ms`);
  }

  /**
   * 获取缓存项
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }

    // 检查是否过期
    if (this.isExpired(item)) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // 更新命中统计
    item.hits++;
    this.stats.hits++;
    
    return item.value as T;
  }

  /**
   * 设置缓存项
   */
  set<T>(key: string, value: T, ttl: number = this.defaultTtl): void {
    // 检查缓存大小限制
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const item: CacheItem<T> = {
      value,
      timestamp: Date.now(),
      ttl,
      hits: 0
    };

    this.cache.set(key, item);
    this.stats.sets++;
    
    Logger.debug(`缓存设置: ${key}, TTL: ${ttl}ms`);
  }

  /**
   * 删除缓存项
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
      Logger.debug(`缓存删除: ${key}`);
    }
    return deleted;
  }

  /**
   * 检查缓存项是否存在且未过期
   */
  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;
    
    if (this.isExpired(item)) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    Logger.info(`缓存已清空: ${size} 个项目`);
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    
    // 估算内存使用（简单估算）
    const memoryUsage = this.cache.size * 200; // 假设每个项目平均200字节

    return {
      totalKeys: this.cache.size,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryUsage
    };
  }

  /**
   * 获取详细的缓存状态
   */
  getDetailedStatus(): {
    stats: CacheStats;
    keyDetails: Array<{
      key: string;
      size: number;
      hits: number;
      age: number;
      ttl: number;
      expired: boolean;
    }>;
  } {
    const stats = this.getStats();
    const keyDetails: Array<{
      key: string;
      size: number;
      hits: number;
      age: number;
      ttl: number;
      expired: boolean;
    }> = [];

    for (const [key, item] of this.cache.entries()) {
      const age = Date.now() - item.timestamp;
      const expired = this.isExpired(item);
      
      keyDetails.push({
        key,
        size: JSON.stringify(item.value).length,
        hits: item.hits,
        age,
        ttl: item.ttl,
        expired
      });
    }

    // 按命中次数排序
    keyDetails.sort((a, b) => b.hits - a.hits);

    return { stats, keyDetails };
  }

  /**
   * 预热缓存 - 批量设置缓存项
   */
  async warmup<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    Logger.info(`开始缓存预热: ${entries.length} 个项目`);
    
    for (const entry of entries) {
      this.set(entry.key, entry.value, entry.ttl);
    }
    
    Logger.info(`缓存预热完成: ${entries.length} 个项目`);
  }

  /**
   * 设置缓存项（如果不存在）
   */
  setIfNotExists<T>(key: string, value: T, ttl: number = this.defaultTtl): boolean {
    if (this.has(key)) {
      return false;
    }
    
    this.set(key, value, ttl);
    return true;
  }

  /**
   * 获取或设置缓存项
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = this.defaultTtl
  ): Promise<T> {
    // 尝试从缓存获取
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // 缓存未命中，调用工厂函数
    try {
      const value = await factory();
      this.set(key, value, ttl);
      return value;
    } catch (error) {
      Logger.error(`缓存工厂函数执行失败: ${key}`, error);
      throw error;
    }
  }

  /**
   * 更新缓存项的TTL
   */
  touch(key: string, ttl: number = this.defaultTtl): boolean {
    const item = this.cache.get(key);
    if (!item || this.isExpired(item)) {
      return false;
    }

    item.timestamp = Date.now();
    item.ttl = ttl;
    return true;
  }

  /**
   * 获取缓存中的所有键
   */
  keys(): string[] {
    // 过滤掉过期的键
    const validKeys: string[] = [];
    for (const [key, item] of this.cache.entries()) {
      if (!this.isExpired(item)) {
        validKeys.push(key);
      }
    }
    return validKeys;
  }

  /**
   * 停止缓存管理器（清理资源）
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
    Logger.info('缓存管理器已销毁');
  }

  /**
   * 检查缓存项是否过期
   */
  private isExpired(item: CacheItem<any>): boolean {
    return Date.now() - item.timestamp > item.ttl;
  }

  /**
   * LRU淘汰策略 - 删除最少使用的项目
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruHits = Number.MAX_SAFE_INTEGER;
    let lruTime = Number.MAX_SAFE_INTEGER;

    for (const [key, item] of this.cache.entries()) {
      // 先按命中次数，再按时间
      if (item.hits < lruHits || (item.hits === lruHits && item.timestamp < lruTime)) {
        lruKey = key;
        lruHits = item.hits;
        lruTime = item.timestamp;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      Logger.debug(`LRU淘汰缓存项: ${lruKey} (命中数: ${lruHits})`);
    }
  }

  /**
   * 启动定期清理过期项
   */
  private startCleanup(intervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, intervalMs);
  }

  /**
   * 清理过期的缓存项
   */
  private cleanupExpired(): void {
    const expiredKeys: string[] = [];
    
    for (const [key, item] of this.cache.entries()) {
      if (this.isExpired(item)) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }

    if (expiredKeys.length > 0) {
      Logger.debug(`清理过期缓存项: ${expiredKeys.length} 个`);
    }
  }
}

/**
 * 专用缓存键生成器
 */
export class CacheKeyGenerator {
  /**
   * 生成提示词优化缓存键
   */
  static promptOptimization(prompt: string, level: string, targetStyle?: string): string {
    const hash = this.simpleHash(prompt);
    return `prompt_opt:${hash}:${level}:${targetStyle || 'default'}`;
  }

  /**
   * 生成任务状态缓存键
   */
  static taskStatus(taskId: string): string {
    return `task:${taskId}`;
  }

  /**
   * 生成模型信息缓存键
   */
  static modelInfo(model: string): string {
    return `model:${model}`;
  }

  /**
   * 生成配置缓存键
   */
  static config(configKey: string): string {
    return `config:${configKey}`;
  }

  /**
   * 生成图像存储统计缓存键
   */
  static imageStats(): string {
    return 'image_stats:summary';
  }

  /**
   * 简单哈希函数（用于生成缓存键）
   */
  private static simpleHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    
    return Math.abs(hash).toString(36);
  }
}

// 全局缓存实例
export const globalCache = new CacheManager(
  1000, // 最大1000个缓存项
  5 * 60 * 1000, // 默认5分钟TTL
  60 * 1000 // 1分钟清理一次
);
