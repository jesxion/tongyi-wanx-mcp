import { 
  existsSync, 
  writeFileSync, 
  readFileSync, 
  createWriteStream, 
  unlinkSync 
} from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';
import { Config } from './config.js';
import { Logger } from './logger.js';
import { TongyiError } from './errors.js';

/**
 * 本地存储的图片信息
 */
export interface StoredImage {
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
    actualPrompt?: string;
  };
}

/**
 * 优化的图片存储管理器
 */
export class ImageStorage {
  private images: Map<string, StoredImage> = new Map();
  private readonly metadataFile: string;
  private readonly imagesDir: string;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(imagesDir: string = Config.IMAGES_DIR) {
    this.imagesDir = imagesDir;
    this.metadataFile = join(imagesDir, 'metadata.json');
    this.loadMetadata();
    this.startCleanupScheduler();
    
    Logger.info(`图片存储管理器初始化，目录: ${imagesDir}`);
  }

  /**
   * 加载元数据
   */
  private loadMetadata(): void {
    try {
      if (existsSync(this.metadataFile)) {
        const data = JSON.parse(readFileSync(this.metadataFile, 'utf-8'));
        this.images = new Map(Object.entries(data));
        Logger.info(`已加载 ${this.images.size} 个图片记录`);
        
        // 验证文件是否存在，清理无效记录
        this.validateStoredFiles();
      }
    } catch (error) {
      Logger.error('加载图片元数据失败', error);
      this.images = new Map(); // 重置为空
    }
  }

  /**
   * 验证存储的文件是否存在
   */
  private validateStoredFiles(): void {
    let removedCount = 0;
    for (const [id, image] of this.images) {
      if (!existsSync(image.localPath)) {
        this.images.delete(id);
        removedCount++;
        Logger.debug(`移除无效图片记录: ${image.filename}`);
      }
    }
    
    if (removedCount > 0) {
      Logger.warn(`清理了 ${removedCount} 个无效的图片记录`);
      this.saveMetadata();
    }
  }

  /**
   * 保存元数据
   */
  private saveMetadata(): void {
    try {
      const data = Object.fromEntries(this.images);
      writeFileSync(this.metadataFile, JSON.stringify(data, null, 2));
      Logger.debug('图片元数据已保存');
    } catch (error) {
      Logger.error('保存图片元数据失败', error);
    }
  }

  /**
   * 启动清理调度器
   */
  private startCleanupScheduler(): void {
    const intervalMs = Config.CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000;
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredImages();
    }, intervalMs);
    
    Logger.info(`清理调度器已启动，间隔: ${Config.CLEANUP_INTERVAL_HOURS}小时`);
  }

  /**
   * 清理过期图片
   */
  cleanupExpiredImages(): void {
    const maxAge = Config.IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [id, image] of this.images) {
      if (now - image.timestamp > maxAge) {
        try {
          if (existsSync(image.localPath)) {
            unlinkSync(image.localPath);
          }
          this.images.delete(id);
          cleanedCount++;
          Logger.debug(`已清理过期图片: ${image.filename}`);
        } catch (error) {
          Logger.error(`清理图片失败: ${image.filename}`, error);
        }
      }
    }
    
    if (cleanedCount > 0) {
      Logger.info(`清理了 ${cleanedCount} 个过期图片`);
      this.saveMetadata();
    } else {
      Logger.debug('未发现需要清理的过期图片');
    }
  }

  /**
   * 下载并存储图片
   */
  async downloadAndStore(
    url: string, 
    prompt: string, 
    metadata: any
  ): Promise<StoredImage> {
    // 生成唯一ID和文件名
    const imageId = createHash('md5').update(url + Date.now()).digest('hex');
    const timestamp = Date.now();
    const extension = this.getFileExtension(url);
    const filename = `${timestamp}_${imageId}.${extension}`;
    const localPath = join(this.imagesDir, filename);
    const resourceUri = `tongyi-wanx://images/${imageId}`;

    try {
      Logger.info(`开始下载图片: ${url}`);
      
      // 下载图片
      const response = await fetch(url);
      if (!response.ok) {
        throw new TongyiError(
          'DOWNLOAD_ERROR',
          `图片下载失败: ${response.status} ${response.statusText}`,
          response.status
        );
      }

      if (!response.body) {
        throw new TongyiError('DOWNLOAD_ERROR', '响应体为空');
      }

      // 保存到本地
      const writeStream = createWriteStream(localPath);
      await pipeline(response.body, writeStream);
      Logger.info(`图片已保存: ${filename}`);

      // 创建存储记录
      const storedImage: StoredImage = {
        id: imageId,
        filename,
        localPath,
        resourceUri,
        originalUrl: url,
        prompt,
        timestamp,
        metadata: {
          model: metadata.model || 'unknown',
          size: metadata.size || 'unknown',
          task_id: metadata.task_id || 'unknown',
          actualPrompt: metadata.actualPrompt
        }
      };

      this.images.set(imageId, storedImage);
      this.saveMetadata();
      
      Logger.info(`图片存储完成: ${imageId}`);
      return storedImage;
      
    } catch (error) {
      Logger.error('图片下载存储失败', error);
      
      // 清理可能创建的文件
      try {
        if (existsSync(localPath)) {
          unlinkSync(localPath);
        }
      } catch (cleanupError) {
        Logger.error('清理失败文件出错', cleanupError);
      }
      
      if (error instanceof TongyiError) {
        throw error;
      }
      
      throw new TongyiError(
        'STORAGE_ERROR',
        `图片存储失败: ${error instanceof Error ? error.message : '未知错误'}`,
        undefined,
        error
      );
    }
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(url: string): string {
    const urlWithoutParams = url.split('?')[0];
    const extension = urlWithoutParams.split('.').pop()?.toLowerCase();
    return extension && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension) 
      ? extension 
      : 'png';
  }

  /**
   * 根据ID获取图片
   */
  getImage(id: string): StoredImage | undefined {
    const image = this.images.get(id);
    if (image && !existsSync(image.localPath)) {
      // 文件不存在，移除记录
      this.images.delete(id);
      this.saveMetadata();
      Logger.warn(`图片文件丢失，已移除记录: ${image.filename}`);
      return undefined;
    }
    return image;
  }

  /**
   * 获取所有图片，按时间倒序
   */
  getAllImages(): StoredImage[] {
    return Array.from(this.images.values())
      .filter(image => existsSync(image.localPath))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 根据资源URI获取图片
   */
  getImageByResourceUri(uri: string): StoredImage | undefined {
    for (const image of this.images.values()) {
      if (image.resourceUri === uri) {
        return this.getImage(image.id); // 使用 getImage 确保文件存在
      }
    }
    return undefined;
  }

  /**
   * 根据任务ID获取图片
   */
  getImagesByTaskId(taskId: string): StoredImage[] {
    return this.getAllImages().filter(image => 
      image.metadata.task_id === taskId
    );
  }

  /**
   * 搜索图片
   */
  searchImages(query: string): StoredImage[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllImages().filter(image => 
      image.prompt.toLowerCase().includes(lowerQuery) ||
      image.metadata.actualPrompt?.toLowerCase().includes(lowerQuery) ||
      image.metadata.model.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 获取存储统计信息
   */
  getStats(): {
    totalImages: number;
    totalSize: number;
    oldestImage?: Date;
    newestImage?: Date;
    modelDistribution: Record<string, number>;
  } {
    const images = this.getAllImages();
    const stats = {
      totalImages: images.length,
      totalSize: 0,
      oldestImage: undefined as Date | undefined,
      newestImage: undefined as Date | undefined,
      modelDistribution: {} as Record<string, number>
    };

    if (images.length === 0) {
      return stats;
    }

    // 计算统计信息
    let oldestTimestamp = Infinity;
    let newestTimestamp = 0;

    for (const image of images) {
      // 更新时间范围
      if (image.timestamp < oldestTimestamp) {
        oldestTimestamp = image.timestamp;
      }
      if (image.timestamp > newestTimestamp) {
        newestTimestamp = image.timestamp;
      }

      // 统计模型分布
      const model = image.metadata.model;
      stats.modelDistribution[model] = (stats.modelDistribution[model] || 0) + 1;

      // 计算文件大小（如果可能）
      try {
        if (existsSync(image.localPath)) {
          const fs = require('fs');
          const fileStats = fs.statSync(image.localPath);
          stats.totalSize += fileStats.size;
        }
      } catch (error) {
        // 忽略文件大小计算错误
      }
    }

    stats.oldestImage = new Date(oldestTimestamp);
    stats.newestImage = new Date(newestTimestamp);

    return stats;
  }

  /**
   * 销毁资源
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // 保存最终状态
    this.saveMetadata();
    Logger.info('图片存储管理器已销毁');
  }
}
