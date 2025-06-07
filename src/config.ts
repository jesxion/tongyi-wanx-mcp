import { existsSync, mkdirSync } from 'fs';

/**
 * 应用程序配置管理
 */
export class Config {  // API配置
  static readonly API_KEY = process.env.DASHSCOPE_API_KEY;
  static readonly BASE_URL = process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com";
  
  // 存储配置 - 必须由用户在 MCP host/client 端配置
  static readonly IMAGES_DIR = process.env.IMAGES_DIR;
  
  // Aliyun OSS 配置 - 用于云端存储和公网访问
  static readonly OSS_ACCESS_KEY_ID = process.env.OSS_ACCESS_KEY_ID;
  static readonly OSS_ACCESS_KEY_SECRET = process.env.OSS_ACCESS_KEY_SECRET;
  static readonly OSS_REGION = process.env.OSS_REGION;
  static readonly OSS_BUCKET = process.env.OSS_BUCKET;
  static readonly OSS_ENDPOINT = process.env.OSS_ENDPOINT; // 可选，如果不提供则使用默认endpoint
  static readonly OSS_ENABLE = process.env.OSS_ENABLE === 'true'; // 是否启用OSS功能
  
  // 任务配置
  static readonly MAX_WAIT_TIME = parseInt(process.env.MAX_WAIT_TIME || "300000"); // 5分钟
  static readonly POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "5000"); // 5秒
  static readonly MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS || "2");
  
  // 日志配置
  static readonly LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
  
  // 测试模式配置
  static readonly ALLOW_TEST_MODE = process.env.ALLOW_TEST_MODE === 'true';
  static readonly IS_TEST_MODE = !Config.API_KEY || Config.API_KEY === 'test-key';
  
  // 清理配置
  static readonly IMAGE_RETENTION_DAYS = parseInt(process.env.IMAGE_RETENTION_DAYS || "7");
  static readonly CLEANUP_INTERVAL_HOURS = parseInt(process.env.CLEANUP_INTERVAL_HOURS || "24");  /**
   * 验证配置
   */
  static validate(): void {
    if (!Config.API_KEY && !Config.ALLOW_TEST_MODE) {
      throw new Error("错误: 请设置 DASHSCOPE_API_KEY 环境变量或设置 ALLOW_TEST_MODE=true 进入测试模式");
    }

    if (!Config.IMAGES_DIR) {
      throw new Error("错误: 请在 MCP host/client 端设置 IMAGES_DIR 环境变量来指定图片存储目录");
    }

    // OSS 配置验证（如果启用了OSS）
    if (Config.OSS_ENABLE) {
      if (!Config.OSS_ACCESS_KEY_ID || !Config.OSS_ACCESS_KEY_SECRET || !Config.OSS_REGION || !Config.OSS_BUCKET) {
        throw new Error("错误: 启用OSS功能需要设置 OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_REGION, OSS_BUCKET 环境变量");
      }
    }

    if (Config.MAX_WAIT_TIME < 10000) {
      console.warn("警告: MAX_WAIT_TIME 设置过小，建议至少设置为 10000ms");
    }

    if (Config.POLL_INTERVAL < 1000) {
      console.warn("警告: POLL_INTERVAL 设置过小，建议至少设置为 1000ms");
    }

    // 确保图片目录存在
    if (!existsSync(Config.IMAGES_DIR)) {
      mkdirSync(Config.IMAGES_DIR, { recursive: true });
    }
  }  /**
   * 打印配置信息
   */
  static printInfo(): void {
    console.error("=== 通义万相 MCP 服务器配置 ===");
    console.error(`测试模式: ${Config.IS_TEST_MODE ? '启用' : '禁用'}`);
    console.error(`图片存储目录: ${Config.IMAGES_DIR || '未配置'}`);
    console.error(`OSS功能: ${Config.OSS_ENABLE ? '启用' : '禁用'}`);
    if (Config.OSS_ENABLE) {
      console.error(`OSS区域: ${Config.OSS_REGION || '未配置'}`);
      console.error(`OSS存储桶: ${Config.OSS_BUCKET || '未配置'}`);
      console.error(`OSS端点: ${Config.OSS_ENDPOINT || '默认端点'}`);
    }
    console.error(`最大等待时间: ${Config.MAX_WAIT_TIME}ms`);
    console.error(`轮询间隔: ${Config.POLL_INTERVAL}ms`);
    console.error(`最大并发请求: ${Config.MAX_CONCURRENT_REQUESTS}`);
    console.error(`日志级别: ${Config.LOG_LEVEL}`);
    console.error(`图片保留天数: ${Config.IMAGE_RETENTION_DAYS}天`);
    console.error("===============================");
  }
}

/**
 * 动态配置管理器
 * 支持运行时配置更新和配置变化监听
 */
export class DynamicConfigManager {
  private static listeners: Map<string, ((oldValue: any, newValue: any) => void)[]> = new Map();
  private static configCache: Map<string, any> = new Map();
  
  /**
   * 注册配置变化监听器
   */
  static addConfigListener(configKey: string, listener: (oldValue: any, newValue: any) => void): void {
    if (!this.listeners.has(configKey)) {
      this.listeners.set(configKey, []);
    }
    this.listeners.get(configKey)!.push(listener);
  }

  /**
   * 移除配置监听器
   */
  static removeConfigListener(configKey: string, listener: (oldValue: any, newValue: any) => void): void {
    const listeners = this.listeners.get(configKey);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 更新配置值
   */
  static updateConfig(configKey: string, newValue: any): boolean {
    const oldValue = this.getConfigValue(configKey);
    
    // 验证配置值
    if (!this.validateConfigValue(configKey, newValue)) {
      return false;
    }

    // 更新配置缓存
    this.configCache.set(configKey, newValue);
    
    // 通知监听器
    const listeners = this.listeners.get(configKey);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(oldValue, newValue);
        } catch (error) {
          console.error(`配置监听器执行失败: ${configKey}`, error);
        }
      });
    }

    console.log(`配置已更新: ${configKey} = ${newValue} (旧值: ${oldValue})`);
    return true;
  }

  /**
   * 获取配置值
   */
  static getConfigValue(configKey: string): any {
    if (this.configCache.has(configKey)) {
      return this.configCache.get(configKey);
    }
    
    // 从Config类获取初始值
    switch (configKey) {
      case 'MAX_CONCURRENT_REQUESTS':
        return Config.MAX_CONCURRENT_REQUESTS;
      case 'POLL_INTERVAL':
        return Config.POLL_INTERVAL;
      case 'MAX_WAIT_TIME':
        return Config.MAX_WAIT_TIME;
      case 'LOG_LEVEL':
        return Config.LOG_LEVEL;
      case 'IMAGE_RETENTION_DAYS':
        return Config.IMAGE_RETENTION_DAYS;
      case 'CLEANUP_INTERVAL_HOURS':
        return Config.CLEANUP_INTERVAL_HOURS;
      default:
        return undefined;
    }
  }

  /**
   * 验证配置值
   */
  private static validateConfigValue(configKey: string, value: any): boolean {
    switch (configKey) {
      case 'MAX_CONCURRENT_REQUESTS':
        return typeof value === 'number' && value > 0 && value <= 10;
      case 'POLL_INTERVAL':
        return typeof value === 'number' && value >= 1000 && value <= 60000;
      case 'MAX_WAIT_TIME':
        return typeof value === 'number' && value >= 10000 && value <= 3600000; // 1小时最大
      case 'LOG_LEVEL':
        return ['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(value);
      case 'IMAGE_RETENTION_DAYS':
        return typeof value === 'number' && value >= 1 && value <= 365;
      case 'CLEANUP_INTERVAL_HOURS':
        return typeof value === 'number' && value >= 1 && value <= 168; // 7天最大
      default:
        return false;
    }
  }

  /**
   * 获取所有可配置的参数
   */
  static getConfigurableParams(): Record<string, {
    currentValue: any;
    description: string;
    type: string;
    validRange?: string;
  }> {
    return {
      MAX_CONCURRENT_REQUESTS: {
        currentValue: this.getConfigValue('MAX_CONCURRENT_REQUESTS'),
        description: '最大并发请求数',
        type: 'number',
        validRange: '1-10'
      },
      POLL_INTERVAL: {
        currentValue: this.getConfigValue('POLL_INTERVAL'),
        description: '任务轮询间隔(ms)',
        type: 'number',
        validRange: '1000-60000'
      },
      MAX_WAIT_TIME: {
        currentValue: this.getConfigValue('MAX_WAIT_TIME'),
        description: '最大等待时间(ms)',
        type: 'number',
        validRange: '10000-3600000'
      },
      LOG_LEVEL: {
        currentValue: this.getConfigValue('LOG_LEVEL'),
        description: '日志级别',
        type: 'string',
        validRange: 'DEBUG, INFO, WARN, ERROR'
      },
      IMAGE_RETENTION_DAYS: {
        currentValue: this.getConfigValue('IMAGE_RETENTION_DAYS'),
        description: '图片保留天数',
        type: 'number',
        validRange: '1-365'
      },
      CLEANUP_INTERVAL_HOURS: {
        currentValue: this.getConfigValue('CLEANUP_INTERVAL_HOURS'),
        description: '清理间隔小时数',
        type: 'number',
        validRange: '1-168'
      }
    };
  }

  /**
   * 批量更新配置
   */
  static updateConfigs(configs: Record<string, any>): {
    success: string[];
    failed: Array<{ key: string; reason: string }>;
  } {
    const success: string[] = [];
    const failed: Array<{ key: string; reason: string }> = [];

    for (const [key, value] of Object.entries(configs)) {
      try {
        if (this.updateConfig(key, value)) {
          success.push(key);
        } else {
          failed.push({ key, reason: '配置值验证失败' });
        }
      } catch (error) {
        failed.push({ key, reason: `更新失败: ${error}` });
      }
    }

    return { success, failed };
  }

  /**
   * 重置所有配置到默认值
   */
  static resetToDefaults(): void {
    this.configCache.clear();
    console.log('所有配置已重置为默认值');
  }
}