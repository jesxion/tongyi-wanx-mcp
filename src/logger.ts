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
 * 简单而高效的日志系统
 */
export class Logger {
  private static levelMap: Record<string, LogLevel> = {
    'ERROR': LogLevel.ERROR,
    'WARN': LogLevel.WARN,
    'INFO': LogLevel.INFO,
    'DEBUG': LogLevel.DEBUG
  };

  private static get currentLevel(): LogLevel {
    return this.levelMap[Config.LOG_LEVEL] ?? LogLevel.INFO;
  }

  private static formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${level}] ${timestamp} - ${message}`;
  }

  static error(message: string, error?: any): void {
    if (this.currentLevel >= LogLevel.ERROR) {
      const formattedMessage = this.formatMessage('ERROR', message);
      if (error) {
        console.error(formattedMessage, error);
      } else {
        console.error(formattedMessage);
      }
    }
  }

  static warn(message: string): void {
    if (this.currentLevel >= LogLevel.WARN) {
      console.error(this.formatMessage('WARN', message));
    }
  }

  static info(message: string): void {
    if (this.currentLevel >= LogLevel.INFO) {
      console.error(this.formatMessage('INFO', message));
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
}
