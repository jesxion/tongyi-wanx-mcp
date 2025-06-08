import { Config } from './config.js';

/**
 * 日志级别枚举
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

/**
 * 日志条目接口
 */
interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
  error?: any;
  data?: any;
}

/**
 * 简单而高效的日志系统，支持 OSS 存储
 */
export class Logger {
  private static levelMap: Record<string, LogLevel> = {
    'ERROR': LogLevel.ERROR,
    'WARN': LogLevel.WARN,
    'INFO': LogLevel.INFO,
    'DEBUG': LogLevel.DEBUG
  };

  private static logBuffer: LogEntry[] = [];
  private static ossService: any = null;
  private static uploadInterval: NodeJS.Timeout | null = null;
  private static readonly BUFFER_SIZE = 50; // 缓冲区大小
  private static readonly UPLOAD_INTERVAL = 5 * 60 * 1000; // 5分钟上传一次

  private static get currentLevel(): LogLevel {
    return this.levelMap[Config.LOG_LEVEL] ?? LogLevel.INFO;
  }

  private static formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${level}] ${timestamp} - ${message}`;
  }

  /**
   * 初始化 OSS 日志存储
   */
  static async initOSSLogging(): Promise<void> {
    try {      // 动态导入 OSSService 以避免循环依赖
      const { OSSService } = await import('../core/storage/oss-service.js');
      this.ossService = new OSSService();
      
      if (this.ossService.isAvailable()) {
        this.info('OSS 日志存储已启用');
        this.startUploadScheduler();
      } else {
        this.info('OSS 日志存储未配置，仅使用控制台日志');
      }
    } catch (error) {
      this.error('初始化 OSS 日志存储失败', error);
    }
  }

  /**
   * 启动日志上传调度器
   */
  private static startUploadScheduler(): void {
    this.uploadInterval = setInterval(async () => {
      await this.uploadLogsToOSS();
    }, this.UPLOAD_INTERVAL);
  }

  /**
   * 上传日志到 OSS
   */
  private static async uploadLogsToOSS(force: boolean = false): Promise<void> {
    if (!this.ossService || !this.ossService.isAvailable()) {
      return;
    }

    if (!force && this.logBuffer.length < this.BUFFER_SIZE) {
      return;
    }

    if (this.logBuffer.length === 0) {
      return;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `logs_${timestamp}.json`;
      const logData = JSON.stringify({
        uploadTime: new Date().toISOString(),
        entries: [...this.logBuffer]
      }, null, 2);

      await this.ossService.uploadFromBuffer(
        Buffer.from(logData, 'utf-8'),
        {
          folder: 'logs',
          filename: filename,
          contentType: 'application/json'
        }
      );

      console.error(`[INFO] ${new Date().toISOString()} - 已上传 ${this.logBuffer.length} 条日志到 OSS`);
      this.logBuffer = []; // 清空缓冲区
    } catch (error) {
      console.error(`[ERROR] ${new Date().toISOString()} - 上传日志到 OSS 失败:`, error);
    }
  }

  /**
   * 添加日志条目到缓冲区
   */
  private static addToBuffer(entry: LogEntry): void {
    this.logBuffer.push(entry);
    
    // 如果缓冲区满了，立即上传
    if (this.logBuffer.length >= this.BUFFER_SIZE) {
      this.uploadLogsToOSS(true).catch(error => {
        console.error(`[ERROR] ${new Date().toISOString()} - 缓冲区满时上传日志失败:`, error);
      });
    }
  }
  static error(message: string, error?: any): void {
    if (this.currentLevel >= LogLevel.ERROR) {
      const formattedMessage = this.formatMessage('ERROR', message);
      if (error) {
        console.error(formattedMessage, error);
      } else {
        console.error(formattedMessage);
      }
      
      // 添加到日志缓冲区
      this.addToBuffer({
        level: 'ERROR',
        message,
        timestamp: new Date().toISOString(),
        error: error ? String(error) : undefined
      });
    }
  }

  static warn(message: string): void {
    if (this.currentLevel >= LogLevel.WARN) {
      console.error(this.formatMessage('WARN', message));
      
      // 添加到日志缓冲区
      this.addToBuffer({
        level: 'WARN',
        message,
        timestamp: new Date().toISOString()
      });
    }
  }

  static info(message: string): void {
    if (this.currentLevel >= LogLevel.INFO) {
      console.error(this.formatMessage('INFO', message));
      
      // 添加到日志缓冲区
      this.addToBuffer({
        level: 'INFO',
        message,
        timestamp: new Date().toISOString()
      });
    }
  }

  static debug(message: string, data?: any): void {
    if (this.currentLevel >= LogLevel.DEBUG) {
      const formattedMessage = this.formatMessage('DEBUG', message);
      if (data) {
        console.error(formattedMessage, data);
      } else {
        console.error(formattedMessage);
      }
      
      // 添加到日志缓冲区
      this.addToBuffer({
        level: 'DEBUG',
        message,
        timestamp: new Date().toISOString(),
        data: data ? JSON.stringify(data) : undefined
      });
    }
  }
  /**
   * 记录性能指标
   */
  static performance(operation: string, duration: number): void {
    this.info(`性能统计 - ${operation}: ${duration}ms`);
  }

  /**
   * 记录API调用
   */
  static apiCall(method: string, url: string, status?: number): void {
    const statusText = status ? ` [${status}]` : '';
    this.debug(`API调用 - ${method} ${url}${statusText}`);
  }
  /**
   * 强制上传所有缓冲的日志
   */
  static async flushLogs(): Promise<{
    logsUploaded: number;
    ossUrl?: string;
  }> {
    const logsToUpload = this.logBuffer.length;
    await this.uploadLogsToOSS(true);
    
    return {
      logsUploaded: logsToUpload,
      ossUrl: this.ossService?.isAvailable() ? 'OSS logs/' : undefined
    };
  }

  /**
   * 获取详细的日志状态信息
   */
  static getLogStatus(): {
    ossEnabled: boolean;
    bufferSize: number;
    maxBufferSize: number;
    lastUploadTime?: string;
    totalUploaded: number;
    uploadErrors: number;
    nextUploadIn: number;
    logCounts: {
      error: number;
      warn: number;
      info: number;
      debug: number;
    };
  } {
    const logCounts = this.logBuffer.reduce((counts, entry) => {
      counts[entry.level.toLowerCase() as keyof typeof counts]++;
      return counts;
    }, { error: 0, warn: 0, info: 0, debug: 0 });

    return {
      ossEnabled: this.ossService?.isAvailable() || false,
      bufferSize: this.logBuffer.length,
      maxBufferSize: this.BUFFER_SIZE,
      lastUploadTime: undefined, // 可以在实际实现中跟踪
      totalUploaded: 0, // 可以在实际实现中跟踪
      uploadErrors: 0, // 可以在实际实现中跟踪
      nextUploadIn: this.uploadInterval ? this.UPLOAD_INTERVAL : 0,
      logCounts
    };
  }

  /**
   * 获取日志统计信息
   */
  static getLogStats(): {
    bufferSize: number;
    ossEnabled: boolean;
    uploadSchedulerActive: boolean;
  } {
    return {
      bufferSize: this.logBuffer.length,
      ossEnabled: this.ossService?.isAvailable() || false,
      uploadSchedulerActive: this.uploadInterval !== null
    };
  }

  /**
   * 销毁日志系统
   */
  static async destroy(): Promise<void> {
    if (this.uploadInterval) {
      clearInterval(this.uploadInterval);
      this.uploadInterval = null;
    }
    
    // 上传剩余的日志
    await this.flushLogs();
    this.info('日志系统已关闭');
  }
}
