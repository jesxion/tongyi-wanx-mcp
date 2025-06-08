/**
 * 工作流管理系统 - 支持复杂的自动化图像处理流程
 */

import { Logger } from '../../infrastructure/index.js';

export interface WorkflowStep {
  id: string;
  action: string;
  parameters: any;
  conditions?: {
    if?: string;
    then?: string;
    else?: string;
  };
  retry_config?: {
    max_retries: number;
    retry_delay: number;
  };
  timeout?: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: WorkflowStep[];
  triggers: {
    schedule?: string;
    file_upload?: boolean;
    manual?: boolean;
  };
  variables?: { [key: string]: any };
  created_at: Date;
  updated_at: Date;
}

export interface WorkflowExecution {
  execution_id: string;
  workflow_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  current_step?: string;
  input_data: any;
  output_data?: any;
  error?: string;
  started_at: Date;
  completed_at?: Date;
  steps_executed: {
    step_id: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    started_at?: Date;
    completed_at?: Date;
    output?: any;
    error?: string;
    retry_count?: number;
  }[];
  metadata: {
    total_steps: number;
    completed_steps: number;
    failed_steps: number;
    execution_time?: number;
  };
}

export class WorkflowManager {
  private static instance: WorkflowManager;
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private activeExecutions: Set<string> = new Set();

  private constructor() {}

  static getInstance(): WorkflowManager {
    if (!WorkflowManager.instance) {
      WorkflowManager.instance = new WorkflowManager();
    }
    return WorkflowManager.instance;
  }

  /**
   * 创建工作流
   */
  async createWorkflow(definition: Omit<WorkflowDefinition, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const workflow: WorkflowDefinition = {
      ...definition,
      id: workflowId,
      created_at: new Date(),
      updated_at: new Date()
    };

    // 验证工作流定义
    const validation = this.validateWorkflow(workflow);
    if (!validation.valid) {
      throw new Error(`工作流验证失败: ${validation.errors.join(', ')}`);
    }

    this.workflows.set(workflowId, workflow);
    Logger.info(`工作流已创建: ${workflowId} - ${definition.name}`);

    return workflowId;
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(
    workflowId: string, 
    inputData: any = {}, 
    options: {
      dry_run?: boolean;
      stop_on_error?: boolean;
      parallel_steps?: boolean;
    } = {}
  ): Promise<string> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`工作流不存在: ${workflowId}`);
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const execution: WorkflowExecution = {
      execution_id: executionId,
      workflow_id: workflowId,
      status: 'pending',
      input_data: inputData,
      started_at: new Date(),
      steps_executed: workflow.steps.map(step => ({
        step_id: step.id,
        status: 'pending'
      })),
      metadata: {
        total_steps: workflow.steps.length,
        completed_steps: 0,
        failed_steps: 0
      }
    };

    this.executions.set(executionId, execution);
    this.activeExecutions.add(executionId);

    // 异步执行工作流
    this.runWorkflowExecution(execution, workflow, options).catch(error => {
      Logger.error(`工作流执行失败: ${executionId}`, error);
      execution.status = 'failed';
      execution.error = error.message;
      execution.completed_at = new Date();
      this.activeExecutions.delete(executionId);
    });

    Logger.info(`工作流执行已启动: ${executionId}`);
    return executionId;
  }

  /**
   * 实际执行工作流
   */
  private async runWorkflowExecution(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    options: any
  ): Promise<void> {
    execution.status = 'running';
    let context = { ...execution.input_data };

    try {
      for (const step of workflow.steps) {
        const stepExecution = execution.steps_executed.find(s => s.step_id === step.id)!;
        
        // 检查是否应该执行此步骤
        if (step.conditions && !this.evaluateCondition(step.conditions.if, context)) {
          stepExecution.status = 'skipped';
          continue;
        }

        stepExecution.status = 'running';
        stepExecution.started_at = new Date();

        try {
          // 如果是试运行模式，只验证不执行
          if (options.dry_run) {
            stepExecution.output = { dry_run: true, would_execute: step.action };
          } else {
            // 执行步骤
            const result = await this.executeStep(step, context);
            stepExecution.output = result;
            context = { ...context, ...result };
          }

          stepExecution.status = 'completed';
          stepExecution.completed_at = new Date();
          execution.metadata.completed_steps++;

        } catch (error) {
          Logger.error(`工作流步骤执行失败: ${step.id}`, error);
          
          // 重试逻辑
          const maxRetries = step.retry_config?.max_retries || 0;
          const retryCount = stepExecution.retry_count || 0;
          
          if (retryCount < maxRetries) {
            stepExecution.retry_count = retryCount + 1;
            Logger.info(`重试步骤 ${step.id}, 重试次数: ${stepExecution.retry_count}`);
            
            if (step.retry_config?.retry_delay) {
              await new Promise(resolve => setTimeout(resolve, step.retry_config!.retry_delay));
            }
            
            // 重新执行当前步骤
            continue;
          }

          stepExecution.status = 'failed';
          stepExecution.error = error instanceof Error ? error.message : String(error);
          stepExecution.completed_at = new Date();
          execution.metadata.failed_steps++;

          if (options.stop_on_error) {
            throw error;
          }
        }
      }

      execution.status = 'completed';
      execution.output_data = context;

    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
    } finally {
      execution.completed_at = new Date();
      execution.metadata.execution_time = execution.completed_at.getTime() - execution.started_at.getTime();
      this.activeExecutions.delete(execution.execution_id);
    }
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(step: WorkflowStep, context: any): Promise<any> {
    // 解析参数中的变量
    const resolvedParams = this.resolveParameters(step.parameters, context);
    
    // 这里应该调用实际的工具执行
    // 为了演示，我们模拟不同的操作
    switch (step.action) {
      case 'text_to_image':
        return { image_url: 'https://example.com/generated.jpg', task_id: 'mock_task_123' };
      
      case 'optimize_prompt':
        return { optimized_prompt: `Enhanced: ${resolvedParams.prompt}` };
      
      case 'image_edit':
        return { edited_image_url: 'https://example.com/edited.jpg' };
      
      default:
        throw new Error(`未知的操作类型: ${step.action}`);
    }
  }

  /**
   * 解析参数中的变量引用
   */
  private resolveParameters(parameters: any, context: any): any {
    const resolved = JSON.parse(JSON.stringify(parameters));
    
    const resolveValue = (obj: any): any => {
      if (typeof obj === 'string' && obj.startsWith('${') && obj.endsWith('}')) {
        const varName = obj.slice(2, -1);
        return this.getNestedValue(context, varName);
      } else if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
          obj[key] = resolveValue(obj[key]);
        }
      }
      return obj;
    };

    return resolveValue(resolved);
  }

  /**
   * 获取嵌套对象的值
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * 评估条件表达式
   */
  private evaluateCondition(condition: string | undefined, context: any): boolean {
    if (!condition) return true;
    
    // 简单的条件评估实现
    // 支持基本的比较操作：equals, not_equals, exists, not_exists
    try {
      // 安全的条件评估（避免eval）
      const operators = ['==', '!=', '>', '<', '>=', '<='];
      
      for (const op of operators) {
        if (condition.includes(op)) {
          const [left, right] = condition.split(op).map(s => s.trim());
          const leftValue = this.getNestedValue(context, left);
          const rightValue = this.parseValue(right, context);
          
          switch (op) {
            case '==': return leftValue == rightValue;
            case '!=': return leftValue != rightValue;
            case '>': return leftValue > rightValue;
            case '<': return leftValue < rightValue;
            case '>=': return leftValue >= rightValue;
            case '<=': return leftValue <= rightValue;
          }
        }
      }
      
      // 检查存在性
      if (condition.startsWith('exists(') && condition.endsWith(')')) {
        const varName = condition.slice(7, -1);
        return this.getNestedValue(context, varName) !== undefined;
      }
        return true;
    } catch (error) {
      Logger.warn(`条件评估失败: ${condition} - ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * 解析值（支持字符串、数字、变量引用）
   */
  private parseValue(value: string, context: any): any {
    value = value.trim();
    
    // 字符串字面量
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    
    // 数字
    if (/^\d+(\.\d+)?$/.test(value)) {
      return parseFloat(value);
    }
    
    // 变量引用
    return this.getNestedValue(context, value);
  }

  /**
   * 验证工作流定义
   */
  private validateWorkflow(workflow: WorkflowDefinition): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查基本字段
    if (!workflow.name) errors.push('工作流名称不能为空');
    if (!workflow.steps || workflow.steps.length === 0) errors.push('工作流必须包含至少一个步骤');

    // 检查步骤
    const stepIds = new Set<string>();
    for (const step of workflow.steps || []) {
      if (!step.id) errors.push('步骤必须有ID');
      if (stepIds.has(step.id)) errors.push(`重复的步骤ID: ${step.id}`);
      stepIds.add(step.id);
      
      if (!step.action) errors.push(`步骤 ${step.id} 缺少操作类型`);
      if (!step.parameters) errors.push(`步骤 ${step.id} 缺少参数`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 获取工作流执行状态
   */
  getExecutionStatus(executionId: string): WorkflowExecution | null {
    return this.executions.get(executionId) || null;
  }

  /**
   * 取消工作流执行
   */
  cancelExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (!execution || !this.activeExecutions.has(executionId)) {
      return false;
    }

    execution.status = 'cancelled';
    execution.completed_at = new Date();
    this.activeExecutions.delete(executionId);
    
    Logger.info(`工作流执行已取消: ${executionId}`);
    return true;
  }

  /**
   * 获取所有工作流
   */
  getAllWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * 获取工作流定义
   */
  getWorkflow(workflowId: string): WorkflowDefinition | null {
    return this.workflows.get(workflowId) || null;
  }

  /**
   * 删除工作流
   */
  deleteWorkflow(workflowId: string): boolean {
    // 检查是否有正在执行的实例
    const activeExecutions = Array.from(this.executions.values())
      .filter(exec => exec.workflow_id === workflowId && this.activeExecutions.has(exec.execution_id));
    
    if (activeExecutions.length > 0) {
      throw new Error(`无法删除工作流，存在 ${activeExecutions.length} 个正在执行的实例`);
    }

    return this.workflows.delete(workflowId);
  }

  /**
   * 获取执行统计
   */
  getExecutionStatistics(): {
    total_executions: number;
    active_executions: number;
    completed_executions: number;
    failed_executions: number;
    avg_execution_time: number;
  } {
    const executions = Array.from(this.executions.values());
    const completed = executions.filter(e => e.status === 'completed');
    const failed = executions.filter(e => e.status === 'failed');
    
    const avgTime = completed.length > 0 
      ? completed.reduce((sum, e) => sum + (e.metadata.execution_time || 0), 0) / completed.length
      : 0;

    return {
      total_executions: executions.length,
      active_executions: this.activeExecutions.size,
      completed_executions: completed.length,
      failed_executions: failed.length,
      avg_execution_time: avgTime
    };
  }
}
