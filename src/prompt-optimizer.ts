/**
 * 智能提示词优化模块
 * 提供提示词分析、优化建议和自动增强功能
 */

export interface PromptAnalysis {
  components: {
    subject: string[];
    style: string[];
    lighting: string[];
    composition: string[];
    quality: string[];
    missing: string[];
  };
  strength: number; // 0-100
  clarity: number;  // 0-100
  completeness: number; // 0-100
}

export interface OptimizationSuggestion {
  type: string;
  description: string;
  examples: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface PromptOptimizationResult {
  original: string;
  optimized: string;
  analysis: PromptAnalysis;
  suggestions: OptimizationSuggestion[];
  improvements: {
    clarity_gain: number;
    completeness_gain: number;
    estimated_quality_boost: number;
  };
}

export class PromptOptimizer {
  // 关键词数据库
  private static readonly KEYWORDS = {
    lighting: [
      '柔和的自然光', '戏剧性的侧光', '温暖的黄昏光线', '冷色调月光',
      '工作室打光', '环境光', '逆光', '顶光', '轮廓光', '霓虹灯光',
      '烛光', '日出光线', '午后阳光', '蓝色时刻'
    ],
    quality: [
      '高质量', '精致细节', '8K分辨率', '超高清', '专业摄影',
      '锐利对焦', '完美构图', '艺术级', '获奖作品', '大师级作品',
      '电影级', '商业级', '极致细节', '超写实'
    ],
    composition: [
      '三分法构图', '对称构图', '黄金比例', '浅景深', '广角镜头',
      '特写镜头', '鸟瞰视角', '低角度拍摄', '虚化背景', '前景虚化',
      '中央构图', '对角线构图', '框架构图', '引导线构图'
    ],
    styles: {
      '写实': ['超写实', '照片级', '纪实摄影', '自然主义', '逼真质感'],
      '动漫': ['日式动漫', '赛璐璐风格', '漫画风格', 'Studio Ghibli风格', '二次元'],
      '水彩': ['水彩画', '透明水彩', '湿画法', '流动感', '水墨晕染'],
      '油画': ['油画质感', '厚涂技法', '古典油画', '印象派风格', '油彩笔触'],
      '3D': ['三维渲染', 'C4D风格', 'Blender渲染', '次世代', '卡通3D'],
      '概念艺术': ['概念设计', '概念插画', 'Matte Painting', '游戏原画', '电影概念图']
    },
    subjects: {
      '人物': ['肖像', '半身像', '全身像', '群像', '剪影'],
      '动物': ['宠物', '野生动物', '鸟类', '海洋生物', '昆虫'],
      '风景': ['自然风光', '城市景观', '建筑', '山水', '海景'],
      '静物': ['产品', '食物', '花卉', '装饰品', '艺术品']
    }
  };

  /**
   * 分析并优化提示词
   */
  static analyzeAndOptimize(
    originalPrompt: string,
    targetStyle?: string,
    level: string = 'advanced'
  ): PromptOptimizationResult {
    const analysis = this.analyzePrompt(originalPrompt);
    const suggestions = this.generateSuggestions(analysis, targetStyle, level);
    const optimizedPrompt = this.buildOptimizedPrompt(originalPrompt, suggestions);
    
    return {
      original: originalPrompt,
      optimized: optimizedPrompt,
      analysis,
      suggestions,
      improvements: this.calculateImprovements(analysis, optimizedPrompt)
    };
  }

  /**
   * 提示词成分分析
   */
  private static analyzePrompt(prompt: string): PromptAnalysis {
    const lowerPrompt = prompt.toLowerCase();
    
    const components = {
      subject: this.extractSubjects(prompt),
      style: this.extractStyles(lowerPrompt),
      lighting: this.extractLighting(lowerPrompt),
      composition: this.extractComposition(lowerPrompt),
      quality: this.extractQuality(lowerPrompt),
      missing: [] as string[]
    };
    
    // 检查缺失的重要元素
    components.missing = this.findMissingElements(components);
    
    return {
      components,
      strength: this.calculatePromptStrength(components),
      clarity: this.calculateClarity(prompt),
      completeness: this.calculateCompleteness(components)
    };
  }

  private static extractSubjects(prompt: string): string[] {
    const subjects: string[] = [];
    const lowerPrompt = prompt.toLowerCase();
    
    // 检查各类主体
    Object.entries(this.KEYWORDS.subjects).forEach(([, keywords]) => {
      keywords.forEach(keyword => {
        if (lowerPrompt.includes(keyword.toLowerCase())) {
          subjects.push(keyword);
        }
      });
    });
    
    // 常见主体检测
    const commonSubjects = [
      '女孩', '男人', '女人', '孩子', '老人', '动物', '建筑', '风景', '花朵',
      '猫', '狗', '鸟', '树', '山', '海', '天空', '云', '太阳', '月亮'
    ];
    
    commonSubjects.forEach(subject => {
      if (lowerPrompt.includes(subject)) {
        subjects.push(subject);
      }
    });
    
    return [...new Set(subjects)]; // 去重
  }

  private static extractStyles(prompt: string): string[] {
    const styles: string[] = [];
    Object.entries(this.KEYWORDS.styles).forEach(([style, keywords]) => {
      if (prompt.includes(style.toLowerCase()) || 
          keywords.some(keyword => prompt.includes(keyword.toLowerCase()))) {
        styles.push(style);
      }
    });
    return styles;
  }

  private static extractLighting(prompt: string): string[] {
    return this.KEYWORDS.lighting.filter(light => 
      prompt.includes(light.toLowerCase()) || 
      prompt.includes(light.replace(/的|光|线/g, ''))
    );
  }

  private static extractComposition(prompt: string): string[] {
    return this.KEYWORDS.composition.filter(comp => 
      prompt.includes(comp.toLowerCase()) ||
      prompt.includes(comp.replace(/构图|镜头|拍摄/g, ''))
    );
  }

  private static extractQuality(prompt: string): string[] {
    return this.KEYWORDS.quality.filter(quality => 
      prompt.includes(quality.toLowerCase())
    );
  }

  private static findMissingElements(components: any): string[] {
    const missing: string[] = [];
    
    if (components.lighting.length === 0) missing.push('lighting');
    if (components.quality.length === 0) missing.push('quality');
    if (components.composition.length === 0) missing.push('composition');
    if (components.style.length === 0) missing.push('style');
    
    return missing;
  }

  private static calculatePromptStrength(components: any): number {
    let score = 0;
    score += Math.min(components.subject.length * 20, 40);
    score += Math.min(components.style.length * 20, 30);
    score += Math.min(components.lighting.length * 15, 20);
    score += Math.min(components.composition.length * 15, 20);
    score += Math.min(components.quality.length * 10, 15);
    
    return Math.min(score, 100);
  }

  private static calculateClarity(prompt: string): number {
    const words = prompt.split(/\s+|，|,/).length;
    const hasCommas = /[，,]/.test(prompt);
    const hasSpecifics = /\d+/.test(prompt);
    const hasDescriptiveWords = /美丽|漂亮|精致|优雅|神秘|温柔|强壮/.test(prompt);
    
    let score = Math.min(words * 3, 50);
    if (hasCommas) score += 20;
    if (hasSpecifics) score += 15;
    if (hasDescriptiveWords) score += 15;
    
    return Math.min(score, 100);
  }

  private static calculateCompleteness(components: any): number {
    const totalCategories = 4; // style, lighting, composition, quality
    const filledCategories = [
      components.style.length > 0,
      components.lighting.length > 0,
      components.composition.length > 0,
      components.quality.length > 0
    ].filter(Boolean).length;
    
    return Math.round((filledCategories / totalCategories) * 100);
  }

  /**
   * 生成优化建议
   */
  private static generateSuggestions(
    analysis: PromptAnalysis,
    targetStyle?: string,
    level: string = 'advanced'
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    
    // 基于缺失元素生成建议
    analysis.components.missing.forEach(missing => {
      switch (missing) {
        case 'lighting':
          suggestions.push({
            type: 'add_lighting',
            description: '添加光线描述以增强画面氛围和质感',
            examples: this.KEYWORDS.lighting.slice(0, 3),
            priority: 'high'
          });
          break;
        case 'quality':
          suggestions.push({
            type: 'add_quality',
            description: '添加质量修饰词提升图像品质和细节',
            examples: this.KEYWORDS.quality.slice(0, 3),
            priority: 'medium'
          });
          break;
        case 'composition':
          suggestions.push({
            type: 'add_composition',
            description: '添加构图描述改善画面结构和视觉效果',
            examples: this.KEYWORDS.composition.slice(0, 3),
            priority: 'medium'
          });
          break;
        case 'style':
          suggestions.push({
            type: 'add_style',
            description: '指定艺术风格以获得更一致的视觉效果',
            examples: Object.keys(this.KEYWORDS.styles).slice(0, 3),
            priority: 'high'
          });
          break;
      }
    });
    
    // 风格建议
    if (targetStyle && !analysis.components.style.includes(targetStyle)) {
      const styleKeywords = this.KEYWORDS.styles[targetStyle as keyof typeof this.KEYWORDS.styles];
      if (styleKeywords) {
        suggestions.push({
          type: 'style_enhancement',
          description: `增强${targetStyle}风格特征以获得更符合预期的效果`,
          examples: styleKeywords.slice(0, 3),
          priority: 'high'
        });
      }
    }
    
    // 高级建议
    if (level === 'professional' && analysis.strength < 80) {
      suggestions.push({
        type: 'professional_enhancement',
        description: '添加专业级修饰词提升整体质量',
        examples: ['电影级质感', '商业摄影水准', '艺术大师作品'],
        priority: 'medium'
      });
    }
    
    return suggestions;
  }

  /**
   * 构建优化后的提示词
   */
  private static buildOptimizedPrompt(
    original: string,
    suggestions: OptimizationSuggestion[]
  ): string {
    let optimized = original.trim();
    
    // 确保结尾有适当的标点
    if (!optimized.endsWith('。') && !optimized.endsWith('.') && !optimized.endsWith('，') && !optimized.endsWith(',')) {
      optimized += '，';
    }
    
    // 应用高优先级建议
    const highPrioritySuggestions = suggestions.filter(s => s.priority === 'high');
    highPrioritySuggestions.forEach(suggestion => {
      if (suggestion.examples.length > 0) {
        const enhancement = suggestion.examples[0];
        optimized += ` ${enhancement}`;
      }
    });
    
    // 应用中优先级建议（限制数量避免过长）
    const mediumPrioritySuggestions = suggestions
      .filter(s => s.priority === 'medium')
      .slice(0, 2);
    
    mediumPrioritySuggestions.forEach(suggestion => {
      if (suggestion.examples.length > 0) {
        const enhancement = suggestion.examples[0];
        optimized += `，${enhancement}`;
      }
    });
    
    return optimized;
  }

  private static calculateImprovements(analysis: PromptAnalysis, optimized: string): any {
    const optimizedAnalysis = this.analyzePrompt(optimized);
    
    return {
      clarity_gain: Math.max(0, optimizedAnalysis.clarity - analysis.clarity),
      completeness_gain: Math.max(0, optimizedAnalysis.completeness - analysis.completeness),
      estimated_quality_boost: Math.max(0, optimizedAnalysis.strength - analysis.strength)
    };
  }

  /**
   * 获取风格关键词建议
   */
  static getStyleSuggestions(style: string): string[] {
    return this.KEYWORDS.styles[style as keyof typeof this.KEYWORDS.styles] || [];
  }

  /**
   * 获取所有可用风格
   */
  static getAvailableStyles(): string[] {
    return Object.keys(this.KEYWORDS.styles);
  }
}
