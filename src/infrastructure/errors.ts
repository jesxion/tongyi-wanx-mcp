import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { Logger } from './logger.js';

/**
 * 熔断器状态枚举
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * 熔断器配置
 */
interface CircuitBreakerConfig {
  failureThreshold: number; // 失败阈值
  timeout: number; // 熔断超时时间(ms)
  monitoringPeriod: number; // 监控周期(ms)
}

/**
 * 熔断器类 - 防止级联故障
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private nextAttemptTime = 0;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig = {
      failureThreshold: 5,
      timeout: 60000, // 1分钟
      monitoringPeriod: 10000 // 10秒
    }
  ) {
    Logger.debug(`熔断器初始化: ${name}, 失败阈值: ${config.failureThreshold}`);
  }

  /**
   * 执行被保护的操作
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new TongyiError(
          'CIRCUIT_BREAKER_OPEN',
          `熔断器 ${this.name} 处于开放状态，请稍后重试`,
          undefined,
          undefined,
          false
        );
      }
      // 尝试半开状态
      this.state = CircuitBreakerState.HALF_OPEN;
      Logger.info(`熔断器 ${this.name} 进入半开状态，尝试恢复`);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * 操作成功时调用
   */
  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitBreakerState.CLOSED;
    if (this.state !== CircuitBreakerState.CLOSED) {
      Logger.info(`熔断器 ${this.name} 恢复到关闭状态`);
    }
  }
  /**
   * 操作失败时调用
   */
  private onFailure(): void {
    this.failureCount++;

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.timeout;
      Logger.warn(`熔断器 ${this.name} 开启，失败次数: ${this.failureCount}`);
    }
  }

  /**
   * 获取熔断器状态
   */
  getStatus(): {
    state: CircuitBreakerState;
    failureCount: number;
    nextAttemptTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      nextAttemptTime: this.nextAttemptTime
    };
  }
  /**
   * 手动重置熔断器
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.nextAttemptTime = 0;
    Logger.info(`熔断器 ${this.name} 已手动重置`);
  }
}

/**
 * 通义万相服务错误类
 */
export class TongyiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode?: number,
    public originalError?: any,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'TongyiError';
  }

  /**
   * 转换为 MCP 错误
   */
  toMcpError(): McpError {
    let errorCode: ErrorCode;
    
    switch (this.code) {
      case 'AUTH_ERROR':
        errorCode = ErrorCode.InvalidRequest;
        break;
      case 'RATE_LIMIT':
        errorCode = ErrorCode.InternalError;
        break;
      case 'VALIDATION_ERROR':
        errorCode = ErrorCode.InvalidParams;
        break;
      case 'NETWORK_ERROR':
      case 'SERVER_ERROR':
        errorCode = ErrorCode.InternalError;
        break;
      default:
        errorCode = ErrorCode.InternalError;
    }
    
    return new McpError(errorCode, this.message);
  }
}

/**
 * 错误处理工具类
 */
export class ErrorHandler {
  /**
   * 处理 API 响应错误
   */
  static handleApiError(response: any, context: string): never {
    const status = response.status;
    const statusText = response.statusText || '未知错误';
    
    // 根据状态码分类处理
    if (status === 401 || status === 403) {
      throw new TongyiError(
        'AUTH_ERROR', 
        'API密钥无效或已过期，请检查 DASHSCOPE_API_KEY 环境变量', 
        status
      );
    } else if (status === 429) {
      throw new TongyiError(
        'RATE_LIMIT', 
        '请求频率超限，请稍后重试', 
        status, 
        null, 
        true // 可重试
      );
    } else if (status === 400) {
      throw new TongyiError(
        'VALIDATION_ERROR', 
        `请求参数错误: ${statusText}`, 
        status
      );
    } else if (status >= 500) {
      throw new TongyiError(
        'SERVER_ERROR', 
        `服务器内部错误: ${status} ${statusText}`, 
        status, 
        null, 
        true // 可重试
      );
    } else if (status >= 400) {
      throw new TongyiError(
        'CLIENT_ERROR', 
        `客户端错误: ${status} ${statusText}`, 
        status
      );
    }
    
    // 网络错误或其他未知错误
    throw new TongyiError(
      'NETWORK_ERROR', 
      `${context}: ${status} ${statusText}`, 
      status, 
      null, 
      true // 可重试
    );
  }

  /**
   * 处理通义万相 API 业务错误
   */
  static handleTongyiApiError(result: any, context: string): never {
    const code = result.code || 'UNKNOWN';
    const message = result.message || '未知错误';
    
    // 根据通义万相的错误码进行分类
    if (code.includes('InvalidApiKey') || code.includes('Forbidden')) {
      throw new TongyiError('AUTH_ERROR', `API认证失败: ${message}`, undefined, result);
    } else if (code.includes('Throttling') || code.includes('FlowControl')) {
      throw new TongyiError('RATE_LIMIT', `请求限流: ${message}`, undefined, result, true);
    } else if (code.includes('InvalidParameter') || code.includes('ValidationFailed')) {
      throw new TongyiError('VALIDATION_ERROR', `参数验证失败: ${message}`, undefined, result);
    } else if (code.includes('InternalError') || code.includes('ServiceUnavailable')) {
      throw new TongyiError('SERVER_ERROR', `服务内部错误: ${message}`, undefined, result, true);
    }
    
    throw new TongyiError('API_ERROR', `${context}: ${code} - ${message}`, undefined, result);
  }

  /**
   * 包装异步操作，提供统一的错误处理
   */
  static async wrapAsync<T>(
    operation: () => Promise<T>, 
    context: string, 
    maxRetries: number = 0
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // 如果是可重试的错误且还有重试次数
        if (error instanceof TongyiError && error.retryable && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // 指数退避，最大10秒
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // 不可重试或重试次数用完，抛出错误
        if (error instanceof TongyiError) {
          throw error;
        }
        
        // 包装未知错误
        throw new TongyiError(
          'UNKNOWN_ERROR', 
          `${context}执行失败: ${error instanceof Error ? error.message : String(error)}`, 
          undefined, 
          error
        );
      }
    }
    
    throw lastError!;
  }

  /**
   * 验证参数并抛出友好的错误信息
   */
  static validateRequired(value: any, fieldName: string): void {
    if (value === undefined || value === null || value === '') {
      throw new TongyiError(
        'VALIDATION_ERROR', 
        `必填参数 ${fieldName} 不能为空`
      );
    }
  }

  /**
   * 验证字符串长度
   */
  static validateStringLength(value: string, fieldName: string, maxLength: number): void {
    if (value && value.length > maxLength) {
      throw new TongyiError(
        'VALIDATION_ERROR', 
        `参数 ${fieldName} 长度不能超过 ${maxLength} 个字符，当前长度: ${value.length}`
      );
    }
  }
}
