import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

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
