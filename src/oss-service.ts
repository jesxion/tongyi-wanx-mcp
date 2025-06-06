import OSS from 'ali-oss';
import { Config } from './config.js';
import { Logger } from './logger.js';
import { TongyiError } from './errors.js';
import { readFileSync } from 'fs';
import { basename, extname } from 'path';
import fetch from 'node-fetch';

/**
 * OSS 文件信息接口
 */
export interface OSSFileInfo {
  url: string;
  bucket: string;
  name: string;
  size?: number;
  lastModified?: Date;
}

/**
 * OSS 上传选项
 */
export interface OSSUploadOptions {
  /** 文件夹路径，如 'images/generated/' */
  folder?: string;
  /** 自定义文件名（不包含扩展名） */
  filename?: string;
  /** 是否为公共读取 */
  public?: boolean;
  /** 自定义元数据 */
  meta?: Record<string, string>;
  /** 自定义 Headers */
  headers?: Record<string, string>;
}

/**
 * Aliyun OSS 服务类
 * 提供文件上传、下载、管理等功能
 */
export class OSSService {
  private client: OSS | null = null;
  private readonly isEnabled: boolean;

  constructor() {
    this.isEnabled = Config.OSS_ENABLE;
    
    if (this.isEnabled) {
      this.initializeClient();
    } else {
      Logger.info('OSS 功能未启用，相关功能将跳过');
    }
  }

  /**
   * 初始化 OSS 客户端
   */
  private initializeClient(): void {
    try {
      const ossConfig: OSS.Options = {
        region: Config.OSS_REGION!,
        accessKeyId: Config.OSS_ACCESS_KEY_ID!,
        accessKeySecret: Config.OSS_ACCESS_KEY_SECRET!,
        bucket: Config.OSS_BUCKET!
      };

      // 如果提供了自定义端点，使用自定义端点
      if (Config.OSS_ENDPOINT) {
        ossConfig.endpoint = Config.OSS_ENDPOINT;
      }

      this.client = new OSS(ossConfig);
      Logger.info(`OSS 客户端初始化成功，区域: ${Config.OSS_REGION}, 存储桶: ${Config.OSS_BUCKET}`);
    } catch (error) {
      Logger.error('OSS 客户端初始化失败', error);
      throw new TongyiError('OSS_INIT_ERROR', 'OSS 客户端初始化失败');
    }
  }

  /**
   * 检查 OSS 服务是否可用
   */
  public isAvailable(): boolean {
    return this.isEnabled && this.client !== null;
  }

  /**
   * 从 URL 下载并上传到 OSS
   * @param imageUrl 源图片 URL
   * @param options 上传选项
   * @returns OSS 文件信息
   */
  public async uploadFromUrl(imageUrl: string, options: OSSUploadOptions = {}): Promise<OSSFileInfo> {
    if (!this.isAvailable()) {
      throw new TongyiError('OSS_NOT_AVAILABLE', 'OSS 服务不可用');
    }

    Logger.info(`开始从 URL 上传图片到 OSS: ${imageUrl}`);

    try {
      // 下载图片
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`下载图片失败: ${response.status} ${response.statusText}`);
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      
      // 生成文件名
      const ext = this.getExtensionFromContentType(contentType);
      const filename = options.filename || `downloaded_${Date.now()}`;
      const fullFilename = `${filename}${ext}`;
        // 构建完整路径
      const folder = options.folder || 'images/downloaded/';
      const ossKey = folder.endsWith('/') ? `${folder}${fullFilename}` : `${folder}/${fullFilename}`;

      // 上传配置
      const uploadOptions: OSS.PutObjectOptions = {
        headers: {
          'Content-Type': contentType,
          ...options.headers
        }
      };

      // 执行上传
      const result = await this.client!.put(ossKey, imageBuffer, uploadOptions);
      
      Logger.info(`图片上传成功: ${result.name}`);

      return {
        url: result.url,
        bucket: Config.OSS_BUCKET!,
        name: result.name,
        size: imageBuffer.length
      };
    } catch (error) {
      Logger.error('从 URL 上传图片到 OSS 失败', error);
      throw new TongyiError('OSS_UPLOAD_ERROR', `上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 从本地文件上传到 OSS
   * @param filePath 本地文件路径
   * @param options 上传选项
   * @returns OSS 文件信息
   */
  public async uploadFromFile(filePath: string, options: OSSUploadOptions = {}): Promise<OSSFileInfo> {
    if (!this.isAvailable()) {
      throw new TongyiError('OSS_NOT_AVAILABLE', 'OSS 服务不可用');
    }

    Logger.info(`开始上传本地文件到 OSS: ${filePath}`);

    try {
      // 读取文件
      const fileBuffer = readFileSync(filePath);
      const originalName = basename(filePath);
      const ext = extname(filePath);
      
      // 生成文件名
      const filename = options.filename || originalName.replace(ext, '');
      const fullFilename = `${filename}${ext}`;
      
      // 构建完整路径
      const folder = options.folder || 'images/uploads/';
      const ossKey = folder.endsWith('/') ? `${folder}${fullFilename}` : `${folder}/${fullFilename}`;

      // 获取 Content-Type
      const contentType = this.getContentTypeFromExtension(ext);      // 上传配置
      const uploadOptions: OSS.PutObjectOptions = {
        headers: {
          'Content-Type': contentType,
          ...options.headers
        }
      };

      // 执行上传
      const result = await this.client!.put(ossKey, fileBuffer, uploadOptions);
      
      Logger.info(`文件上传成功: ${result.name}`);

      return {
        url: result.url,
        bucket: Config.OSS_BUCKET!,
        name: result.name,
        size: fileBuffer.length
      };
    } catch (error) {
      Logger.error('上传本地文件到 OSS 失败', error);
      throw new TongyiError('OSS_UPLOAD_ERROR', `上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 上传 Buffer 到 OSS
   * @param buffer 文件 Buffer
   * @param filename 文件名
   * @param options 上传选项
   * @returns OSS 文件信息
   */
  public async uploadBuffer(buffer: Buffer, filename: string, options: OSSUploadOptions = {}): Promise<OSSFileInfo> {
    if (!this.isAvailable()) {
      throw new TongyiError('OSS_NOT_AVAILABLE', 'OSS 服务不可用');
    }

    Logger.info(`开始上传 Buffer 到 OSS: ${filename}`);

    try {
      // 构建完整路径
      const folder = options.folder || 'images/buffers/';
      const ossKey = folder.endsWith('/') ? `${folder}${filename}` : `${folder}/${filename}`;

      // 获取 Content-Type
      const ext = extname(filename);
      const contentType = this.getContentTypeFromExtension(ext);      // 上传配置
      const uploadOptions: OSS.PutObjectOptions = {
        headers: {
          'Content-Type': contentType,
          ...options.headers
        }
      };

      // 执行上传
      const result = await this.client!.put(ossKey, buffer, uploadOptions);
      
      Logger.info(`Buffer 上传成功: ${result.name}`);

      return {
        url: result.url,
        bucket: Config.OSS_BUCKET!,
        name: result.name,
        size: buffer.length
      };
    } catch (error) {
      Logger.error('上传 Buffer 到 OSS 失败', error);
      throw new TongyiError('OSS_UPLOAD_ERROR', `上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 删除 OSS 文件
   * @param ossKey OSS 对象键
   */
  public async deleteFile(ossKey: string): Promise<void> {
    if (!this.isAvailable()) {
      throw new TongyiError('OSS_NOT_AVAILABLE', 'OSS 服务不可用');
    }

    try {
      await this.client!.delete(ossKey);
      Logger.info(`文件删除成功: ${ossKey}`);
    } catch (error) {
      Logger.error('删除 OSS 文件失败', error);
      throw new TongyiError('OSS_DELETE_ERROR', `删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 获取文件列表
   * @param prefix 前缀过滤
   * @param maxKeys 最大返回数量
   */
  public async listFiles(prefix?: string, maxKeys: number = 100): Promise<OSSFileInfo[]> {
    if (!this.isAvailable()) {
      throw new TongyiError('OSS_NOT_AVAILABLE', 'OSS 服务不可用');
    }

    try {      const result = await this.client!.list({
        prefix,
        'max-keys': maxKeys
      }, {});return result.objects?.map((obj: any) => ({
        url: `https://${Config.OSS_BUCKET}.${Config.OSS_REGION}.aliyuncs.com/${obj.name}`,
        bucket: Config.OSS_BUCKET!,
        name: obj.name!,
        size: obj.size,
        lastModified: obj.lastModified
      })) || [];
    } catch (error) {
      Logger.error('获取 OSS 文件列表失败', error);
      throw new TongyiError('OSS_LIST_ERROR', `获取列表失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 获取文件访问 URL
   * @param ossKey OSS 对象键
   * @param expires 有效期（秒），默认 3600 秒
   */
  public async getSignedUrl(ossKey: string, expires: number = 3600): Promise<string> {
    if (!this.isAvailable()) {
      throw new TongyiError('OSS_NOT_AVAILABLE', 'OSS 服务不可用');
    }

    try {
      const url = this.client!.signatureUrl(ossKey, { expires });
      Logger.debug(`生成签名 URL: ${ossKey}`);
      return url;
    } catch (error) {
      Logger.error('生成签名 URL 失败', error);
      throw new TongyiError('OSS_SIGN_URL_ERROR', `生成签名URL失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 根据内容类型获取文件扩展名
   */
  private getExtensionFromContentType(contentType: string): string {
    const mapping: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/bmp': '.bmp',
      'image/tiff': '.tiff',
      'text/plain': '.txt',
      'application/json': '.json'
    };
    
    return mapping[contentType.toLowerCase()] || '.bin';
  }

  /**
   * 根据文件扩展名获取内容类型
   */
  private getContentTypeFromExtension(extension: string): string {
    const mapping: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.log': 'text/plain'
    };
    
    return mapping[extension.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * 获取 OSS 服务状态
   */
  public getStatus(): {
    enabled: boolean;
    configured: boolean;
    region?: string;
    bucket?: string;
    endpoint?: string;
  } {
    return {
      enabled: this.isEnabled,
      configured: this.isAvailable(),
      region: Config.OSS_REGION,
      bucket: Config.OSS_BUCKET,
      endpoint: Config.OSS_ENDPOINT
    };
  }

  /**
   * 销毁服务
   */
  public destroy(): void {
    if (this.client) {
      // OSS 客户端没有显式的销毁方法，设置为 null 即可
      this.client = null;
      Logger.info('OSS 服务已销毁');
    }
  }
}
