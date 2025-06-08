import { 
  existsSync, 
  writeFileSync, 
  readFileSync, 
  createWriteStream, 
  unlinkSync,
  statSync
} from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';
import { Config, Logger, TongyiError } from '../../infrastructure/index.js';
import { OSSService } from './oss-service.js';

/**
 * 本地存储的图片信息
 */
export interface StoredImage {
  id: string;
  filename: string;
  localPath?: string; // 本地路径现在是可选的
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
  // OSS 相关信息
  ossInfo?: {
    url: string;
    name: string;
    bucket: string;
    uploadTime: number;
  };
}

/**
 * 优化的图片存储管理器
 */
export class ImageStorage {
  private images: Map<string, StoredImage> = new Map();
  private readonly metadataFile: string | null;
  private readonly imagesDir: string | null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private ossService: OSSService;
  private readonly localStorageEnabled: boolean;

  constructor(imagesDir?: string) {
    // 检查是否启用本地存储 - 只有当 IMAGES_DIR 环境变量配置时才启用
    this.localStorageEnabled = !!(imagesDir || Config.IMAGES_DIR);
    
    if (this.localStorageEnabled) {
      this.imagesDir = imagesDir || Config.IMAGES_DIR!;
      this.metadataFile = join(this.imagesDir, 'metadata.json');
      Logger.info(`图片本地存储已启用，目录: ${this.imagesDir}`);
    } else {
      this.imagesDir = null;
      this.metadataFile = null;
      Logger.info('图片本地存储未启用，仅使用 OSS 存储');
    }
    
    this.ossService = new OSSService();
    
    if (this.localStorageEnabled) {
      this.loadMetadata();
      this.startCleanupScheduler();
    }
  }

  /**
   * 加载元数据
   */
  private loadMetadata(): void {
    if (!this.localStorageEnabled || !this.metadataFile) {
      return;
    }

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
    if (!this.localStorageEnabled) {
      return;
    }

    let removedCount = 0;
    for (const [id, image] of this.images) {
      if (image.localPath && !existsSync(image.localPath)) {
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
    if (!this.localStorageEnabled || !this.metadataFile) {
      return;
    }

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
    if (!this.localStorageEnabled) {
      return;
    }
    
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
    if (!this.localStorageEnabled) {
      Logger.debug('本地存储未启用，跳过过期图片清理');
      return;
    }

    const maxAge = Config.IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [id, image] of this.images) {
      if (now - image.timestamp > maxAge) {
        try {
          if (image.localPath && existsSync(image.localPath)) {
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
   * 下载并存储图片（优先保存到 OSS，可选保存到本地）
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
    const resourceUri = `tongyi-wanx://images/${imageId}`;

    // 创建基础存储记录
    const storedImage: StoredImage = {
      id: imageId,
      filename,
      localPath: this.localStorageEnabled && this.imagesDir ? join(this.imagesDir, filename) : undefined,
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

      // 如果启用本地存储，保存到本地
      if (this.localStorageEnabled && storedImage.localPath) {
        const writeStream = createWriteStream(storedImage.localPath);
        await pipeline(response.body, writeStream);
        Logger.info(`图片已保存到本地: ${filename}`);
      }

      // 尝试上传到 OSS（优先）
      if (this.ossService.isAvailable()) {
        try {
          Logger.info(`开始上传图片到 OSS: ${filename}`);
          
          // 如果有本地文件，从本地文件上传，否则从 URL 上传
          let ossInfo;
          if (this.localStorageEnabled && storedImage.localPath) {
            ossInfo = await this.ossService.uploadFromFile(storedImage.localPath, {
              folder: 'images/generated',
              filename: `${timestamp}_${imageId}`
            });
          } else {
            ossInfo = await this.ossService.uploadFromUrl(url, {
              folder: 'images/generated',
              filename: `${timestamp}_${imageId}`
            });
          }
          
          storedImage.ossInfo = {
            url: ossInfo.url,
            name: ossInfo.name,
            bucket: ossInfo.bucket,
            uploadTime: Date.now()
          };
          Logger.info(`图片已上传到 OSS: ${ossInfo.url}`);
        } catch (ossError) {
          Logger.warn('OSS 上传失败，仅保存到本地');
          // 不抛出错误，继续使用本地存储
        }
      }

      this.images.set(imageId, storedImage);
      this.saveMetadata();
      
      Logger.info(`图片存储完成: ${imageId}`);
      return storedImage;
      
    } catch (error) {
      Logger.error('图片下载存储失败', error);
      
      // 清理可能创建的文件
      try {
        if (this.localStorageEnabled && storedImage.localPath && existsSync(storedImage.localPath)) {
          unlinkSync(storedImage.localPath);
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
   * 根据ID获取图片
   */
  getImage(id: string): StoredImage | undefined {
    const image = this.images.get(id);
    if (image && image.localPath && !existsSync(image.localPath)) {
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
      .filter(image => !image.localPath || existsSync(image.localPath))
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
    ossStats: {
      enabled: boolean;
      imagesInOSS: number;
      imagesOnlyLocal: number;
    };
  } {
    const images = this.getAllImages();
    const stats = {
      totalImages: images.length,
      totalSize: 0,
      oldestImage: undefined as Date | undefined,
      newestImage: undefined as Date | undefined,
      modelDistribution: {} as Record<string, number>,
      ossStats: {
        enabled: this.ossService.isAvailable(),
        imagesInOSS: 0,
        imagesOnlyLocal: 0
      }
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

      // 统计 OSS 状态
      if (image.ossInfo?.url) {
        stats.ossStats.imagesInOSS++;
      } else {
        stats.ossStats.imagesOnlyLocal++;
      }

      // 计算文件大小（如果可能）
      try {
        if (image.localPath && existsSync(image.localPath)) {
          const fileStats = statSync(image.localPath);
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
   * 上传用户图片到 OSS 并获取公共访问 URL
   */
  async uploadUserImageToOSS(imagePath: string): Promise<{
    localPath: string;
    ossUrl?: string;
    ossName?: string;
  }> {
    if (!existsSync(imagePath)) {
      throw new TongyiError('FILE_NOT_FOUND', `图片文件不存在: ${imagePath}`);
    }

    const result = {
      localPath: imagePath,
      ossUrl: undefined as string | undefined,
      ossName: undefined as string | undefined
    };

    // 如果 OSS 可用，上传到 OSS
    if (this.ossService.isAvailable()) {
      try {
        Logger.info(`开始上传用户图片到 OSS: ${imagePath}`);
        
        const timestamp = Date.now();
        const imageId = createHash('md5').update(imagePath + timestamp).digest('hex');
        
        const ossInfo = await this.ossService.uploadFromFile(imagePath, {
          folder: 'images/user-uploads',
          filename: `user_${timestamp}_${imageId}`
        });
        
        result.ossUrl = ossInfo.url;
        result.ossName = ossInfo.name;
        
        Logger.info(`用户图片已上传到 OSS: ${ossInfo.url}`);
      } catch (error) {
        Logger.warn('用户图片 OSS 上传失败，将使用本地路径');
        // 不抛出错误，继续使用本地路径
      }
    }

    return result;
  }

  /**
   * 获取图片的最佳访问 URL（优先使用 OSS URL）
   */
  getBestImageUrl(storedImage: StoredImage): string {
    // 如果有 OSS URL 且 OSS 可用，优先使用 OSS URL
    if (storedImage.ossInfo?.url && this.ossService.isAvailable()) {
      return storedImage.ossInfo.url;
    }
    
    // 否则返回本地文件的资源 URI
    return storedImage.resourceUri;
  }

  /**
   * 检查并修复图片的 OSS 状态
   */
  async repairOSSStatus(imageId: string): Promise<boolean> {
    const image = this.getImage(imageId);
    if (!image) {
      return false;
    }

    // 如果已经有 OSS 信息，不需要修复
    if (image.ossInfo?.url) {
      return true;
    }

    // 如果 OSS 不可用，无法修复
    if (!this.ossService.isAvailable()) {
      return false;
    }

    // 如果没有本地文件，无法修复
    if (!image.localPath || !existsSync(image.localPath)) {
      Logger.warn(`无法修复图片 OSS 状态，本地文件不存在: ${image.filename}`);
      return false;
    }

    try {
      Logger.info(`尝试修复图片的 OSS 状态: ${image.filename}`);
      
      const ossInfo = await this.ossService.uploadFromFile(image.localPath, {
        folder: 'images/repaired',
        filename: `repaired_${Date.now()}_${image.id}`
      });
      
      // 更新图片信息
      image.ossInfo = {
        url: ossInfo.url,
        name: ossInfo.name,
        bucket: ossInfo.bucket,
        uploadTime: Date.now()
      };
      
      this.images.set(imageId, image);
      this.saveMetadata();
      
      Logger.info(`图片 OSS 状态修复成功: ${ossInfo.url}`);
      return true;
    } catch (error) {
      Logger.error('修复图片 OSS 状态失败', error);
      return false;
    }
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
