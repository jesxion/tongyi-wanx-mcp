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