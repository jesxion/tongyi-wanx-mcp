/**
 * 工具管理器 - 统一管理所有 MCP 工具
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface ToolLayer {
  priority: number;
  description: string;
  tools: string[];
}

export interface EnhancedTool extends Tool {
  category: string;
  priority: number;
  usage_count?: number;
  last_used?: Date;
  performance_score?: number;
}

export const TOOL_LAYERS: Record<string, ToolLayer> = {
  L1_CORE: {
    priority: 1,
    description: "核心功能 - 最高优先级",
    tools: ['text_to_image', 'image_edit', 'query_task', 'get_supported_models']
  },
  L2_SMART: {
    priority: 2,
    description: "智能辅助 - 中高优先级", 
    tools: ['optimize_prompt', 'analyze_prompt', 'get_prompt_suggestions', 'smart_image_enhance']
  },
  L3_MANAGEMENT: {
    priority: 3,
    description: "管理功能 - 中优先级",
    tools: ['search_images', 'get_system_status', 'upload_image_to_oss', 'create_image_version']
  },
  L4_ADVANCED: {
    priority: 4,
    description: "高级功能 - 中低优先级",
    tools: ['batch_generate_images', 'get_batch_status', 'create_workflow', 'evaluate_image_quality']
  },
  L5_MAINTENANCE: {
    priority: 5,
    description: "系统维护 - 低优先级",
    tools: ['repair_oss_status', 'flush_logs', 'list_oss_images', 'cancel_batch_task']
  }
};

export class ToolManager {
  private static instance: ToolManager;
  private tools: Map<string, EnhancedTool> = new Map();
  private usageStats: Map<string, { count: number; lastUsed: Date; avgResponseTime: number }> = new Map();

  private constructor() {}

  static getInstance(): ToolManager {
    if (!ToolManager.instance) {
      ToolManager.instance = new ToolManager();
    }
    return ToolManager.instance;
  }

  /**
   * 注册工具
   */
  registerTool(tool: Tool, category: string, priority: number): void {
    const enhancedTool: EnhancedTool = {
      ...tool,
      category,
      priority,
      usage_count: 0,
      performance_score: 1.0
    };
    
    this.tools.set(tool.name, enhancedTool);
    
    // 初始化使用统计
    if (!this.usageStats.has(tool.name)) {
      this.usageStats.set(tool.name, {
        count: 0,
        lastUsed: new Date(),
        avgResponseTime: 0
      });
    }
  }

  /**
   * 获取按层级分组的工具列表
   */
  getToolsByLayer(): { [layer: string]: EnhancedTool[] } {
    const result: { [layer: string]: EnhancedTool[] } = {};
    
    for (const [layerName, layerInfo] of Object.entries(TOOL_LAYERS)) {
      result[layerName] = layerInfo.tools
        .map(toolName => this.tools.get(toolName))
        .filter((tool): tool is EnhancedTool => tool !== undefined)
        .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0)); // 按使用频率排序
    }
    
    return result;
  }

  /**
   * 获取推荐工具
   */
  getRecommendedTools(lastUsedTool?: string, limit: number = 5): EnhancedTool[] {
    const allTools = Array.from(this.tools.values());
    
    // 基础推荐逻辑
    let recommendations = allTools
      .filter(tool => tool.name !== lastUsedTool) // 排除刚使用的工具
      .sort((a, b) => {
        // 综合评分：使用频率 + 性能 + 优先级
        const scoreA = (a.usage_count || 0) * 0.5 + (a.performance_score || 0) * 0.3 + (5 - a.priority) * 0.2;
        const scoreB = (b.usage_count || 0) * 0.5 + (b.performance_score || 0) * 0.3 + (5 - b.priority) * 0.2;
        return scoreB - scoreA;
      });

    // 如果有上一个使用的工具，添加相关性推荐
    if (lastUsedTool) {
      const relatedTools = this.getRelatedTools(lastUsedTool);
      recommendations = [...relatedTools, ...recommendations.filter(t => !relatedTools.includes(t))];
    }

    return recommendations.slice(0, limit);
  }

  /**
   * 获取相关工具
   */
  private getRelatedTools(toolName: string): EnhancedTool[] {
    const relationMap: { [key: string]: string[] } = {
      'text_to_image': ['optimize_prompt', 'analyze_prompt', 'create_image_version'],
      'image_edit': ['smart_image_enhance', 'evaluate_image_quality'],
      'optimize_prompt': ['text_to_image', 'analyze_prompt'],
      'batch_generate_images': ['get_batch_status', 'batch_optimize_prompts'],
      'upload_image_to_oss': ['repair_oss_status', 'list_oss_images']
    };

    const relatedNames = relationMap[toolName] || [];
    return relatedNames
      .map(name => this.tools.get(name))
      .filter((tool): tool is EnhancedTool => tool !== undefined);
  }

  /**
   * 记录工具使用
   */
  recordToolUsage(toolName: string, responseTime: number): void {
    const tool = this.tools.get(toolName);
    if (tool) {
      tool.usage_count = (tool.usage_count || 0) + 1;
      tool.last_used = new Date();
    }

    const stats = this.usageStats.get(toolName);
    if (stats) {
      stats.count += 1;
      stats.lastUsed = new Date();
      stats.avgResponseTime = (stats.avgResponseTime * (stats.count - 1) + responseTime) / stats.count;
    }
  }

  /**
   * 更新工具性能分数
   */
  updatePerformanceScore(toolName: string, score: number): void {
    const tool = this.tools.get(toolName);
    if (tool) {
      tool.performance_score = Math.max(0, Math.min(1, score)); // 限制在 0-1 范围内
    }
  }

  /**
   * 获取工具使用统计
   */
  getUsageStats(): { [toolName: string]: any } {
    const result: { [toolName: string]: any } = {};
    
    for (const [toolName, stats] of this.usageStats.entries()) {
      const tool = this.tools.get(toolName);
      result[toolName] = {
        ...stats,
        category: tool?.category,
        priority: tool?.priority,
        performance_score: tool?.performance_score
      };
    }
    
    return result;
  }

  /**
   * 获取所有工具
   */
  getAllTools(): EnhancedTool[] {
    return Array.from(this.tools.values())
      .sort((a, b) => a.priority - b.priority); // 按优先级排序
  }

  /**
   * 根据类别获取工具
   */
  getToolsByCategory(category: string): EnhancedTool[] {
    return Array.from(this.tools.values())
      .filter(tool => tool.category === category)
      .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
  }
  /**
   * 搜索工具
   */
  searchTools(query: string): EnhancedTool[] {
    const lowerQuery = query.toLowerCase();
    
    return Array.from(this.tools.values()).filter(tool => 
      tool.name.toLowerCase().includes(lowerQuery) ||
      (tool.description && tool.description.toLowerCase().includes(lowerQuery)) ||
      tool.category.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 验证工具参数
   */
  validateToolParameters(toolName: string, parameters: any): { valid: boolean; errors: string[] } {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { valid: false, errors: [`工具 '${toolName}' 不存在`] };
    }

    const errors: string[] = [];
    const schema = tool.inputSchema;

    // 这里可以实现更复杂的 JSON Schema 验证
    // 简化实现：检查必需参数
    if (schema.required) {
      for (const requiredParam of schema.required) {
        if (!(requiredParam in parameters)) {
          errors.push(`缺少必需参数: ${requiredParam}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
