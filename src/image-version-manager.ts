/**
 * 图片版本管理模块
 * 提供图片版本控制、变体生成和历史记录功能
 */

import { Logger } from './logger.js';
import * as fs from 'fs';
import * as path from 'path';

export interface ImageVersion {
  id: string;
  baseImageId?: string; // 基础图片ID（如果是变体）
  prompt: string;
  timestamp: number;
  filePath: string;
  metadata: {
    width?: number;
    height?: number;
    style?: string;
    variant_type?: string;
    variant_description?: string;
    generation_params?: any;
  };
}

export interface ImageVariant {
  variantId: string;
  baseImageId: string;
  variantType: 'style_transfer' | 'color_change' | 'detail_enhance' | 'composition_adjust' | 'prompt_refinement';
  description: string;
  prompt: string;
  timestamp: number;
}

export interface VersionHistory {
  baseImageId: string;
  originalPrompt: string;
  versions: ImageVersion[];
  variants: ImageVariant[];
  createdAt: number;
  lastModified: number;
}

export class ImageVersionManager {
  private static readonly VERSION_DB_FILE = 'image_versions.json';
  private static versionHistory: Map<string, VersionHistory> = new Map();
  private static initialized = false;

  /**
   * 初始化版本管理器
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await this.loadVersionHistory();
      this.initialized = true;
      Logger.info('图片版本管理器初始化成功');
    } catch (error) {
      Logger.error('图片版本管理器初始化失败', error);
      throw error;
    }
  }

  /**
   * 创建新的图片版本记录
   */
  static async createVersion(
    imageId: string,
    prompt: string,
    filePath: string,
    metadata: any = {},
    baseImageId?: string
  ): Promise<ImageVersion> {
    await this.initialize();
    
    const version: ImageVersion = {
      id: imageId,
      baseImageId,
      prompt,
      timestamp: Date.now(),
      filePath,
      metadata: {
        ...metadata,
        generation_params: {
          model: 'wanx-v1',
          size: metadata.size || '1024*1024',
          style: metadata.style,
          timestamp: Date.now()
        }
      }
    };

    // 如果是基础图片，创建新的版本历史
    if (!baseImageId) {
      const history: VersionHistory = {
        baseImageId: imageId,
        originalPrompt: prompt,
        versions: [version],
        variants: [],
        createdAt: Date.now(),
        lastModified: Date.now()
      };
      this.versionHistory.set(imageId, history);
    } else {
      // 如果是变体，添加到对应的版本历史
      const history = this.versionHistory.get(baseImageId);
      if (history) {
        history.versions.push(version);
        history.lastModified = Date.now();
      }
    }

    await this.saveVersionHistory();
    Logger.info(`创建图片版本记录: ${imageId}${baseImageId ? ` (基于 ${baseImageId})` : ''}`);
    
    return version;
  }

  /**
   * 创建图片变体
   */
  static async createImageVariant(
    baseImageId: string,
    variantType: ImageVariant['variantType'],
    description: string,
    newPrompt: string
  ): Promise<{ variantId: string; prompt: string }> {
    await this.initialize();
    
    const variantId = `${baseImageId}_variant_${Date.now()}`;
    const variant: ImageVariant = {
      variantId,
      baseImageId,
      variantType,
      description,
      prompt: newPrompt,
      timestamp: Date.now()
    };

    const history = this.versionHistory.get(baseImageId);
    if (!history) {
      throw new Error(`找不到基础图片 ${baseImageId} 的版本历史`);
    }

    history.variants.push(variant);
    history.lastModified = Date.now();
    
    await this.saveVersionHistory();
    Logger.info(`创建图片变体: ${variantId} (基于 ${baseImageId})`);
    
    return { variantId, prompt: newPrompt };
  }

  /**
   * 获取图片的版本历史
   */
  static async getVersionHistory(imageId: string): Promise<VersionHistory | null> {
    await this.initialize();
    
    // 首先检查是否为基础图片
    let history = this.versionHistory.get(imageId);
    if (history) return history;
      // 如果不是基础图片，在所有历史中查找
    for (const hist of this.versionHistory.values()) {
      if (hist.versions.some(v => v.id === imageId) || 
          hist.variants.some(v => v.variantId === imageId)) {
        return hist;
      }
    }
    
    return null;
  }

  /**
   * 获取图片的所有变体
   */
  static async getImageVariants(baseImageId: string): Promise<ImageVariant[]> {
    await this.initialize();
    
    const history = this.versionHistory.get(baseImageId);
    return history?.variants || [];
  }

  /**
   * 获取相关图片（同一系列的所有版本和变体）
   */
  static async getRelatedImages(imageId: string): Promise<{
    baseImage: ImageVersion | null;
    versions: ImageVersion[];
    variants: ImageVariant[];
  }> {
    await this.initialize();
    
    const history = await this.getVersionHistory(imageId);
    if (!history) {
      return { baseImage: null, versions: [], variants: [] };
    }

    const baseImage = history.versions.find(v => v.id === history.baseImageId) || null;
    
    return {
      baseImage,
      versions: history.versions,
      variants: history.variants
    };
  }

  /**
   * 生成变体提示词建议
   */
  static generateVariantPrompts(
    originalPrompt: string,
    variantType: ImageVariant['variantType']
  ): string[] {
    const suggestions: string[] = [];
    
    switch (variantType) {
      case 'style_transfer':
        suggestions.push(
          originalPrompt.replace(/写实|真实/, '动漫风格'),
          originalPrompt.replace(/动漫/, '水彩画风格'),
          originalPrompt + '，油画风格',
          originalPrompt + '，3D渲染风格'
        );
        break;
        
      case 'color_change':
        suggestions.push(
          originalPrompt + '，暖色调',
          originalPrompt + '，冷色调',
          originalPrompt + '，黑白色调',
          originalPrompt + '，复古色调'
        );
        break;
        
      case 'detail_enhance':
        suggestions.push(
          originalPrompt + '，超高清细节',
          originalPrompt + '，精致纹理',
          originalPrompt + '，丰富细节',
          originalPrompt + '，电影级质感'
        );
        break;
        
      case 'composition_adjust':
        suggestions.push(
          originalPrompt + '，特写镜头',
          originalPrompt + '，全景视角',
          originalPrompt + '，鸟瞰视角',
          originalPrompt + '，低角度拍摄'
        );
        break;
        
      case 'prompt_refinement':
        suggestions.push(
          originalPrompt + '，专业摄影',
          originalPrompt + '，艺术级作品',
          originalPrompt + '，获奖作品',
          originalPrompt + '，大师级构图'
        );
        break;
    }
    
    return suggestions.filter(s => s !== originalPrompt);
  }

  /**
   * 删除版本记录
   */
  static async deleteVersion(imageId: string): Promise<boolean> {
    await this.initialize();
    
    // 检查是否为基础图片
    if (this.versionHistory.has(imageId)) {
      this.versionHistory.delete(imageId);
      await this.saveVersionHistory();
      Logger.info(`删除版本历史: ${imageId}`);
      return true;
    }
      // 在版本和变体中查找并删除
    for (const history of this.versionHistory.values()) {
      const versionIndex = history.versions.findIndex(v => v.id === imageId);
      if (versionIndex !== -1) {
        history.versions.splice(versionIndex, 1);
        history.lastModified = Date.now();
        await this.saveVersionHistory();
        Logger.info(`删除版本记录: ${imageId}`);
        return true;
      }
      
      const variantIndex = history.variants.findIndex(v => v.variantId === imageId);
      if (variantIndex !== -1) {
        history.variants.splice(variantIndex, 1);
        history.lastModified = Date.now();
        await this.saveVersionHistory();
        Logger.info(`删除变体记录: ${imageId}`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * 获取版本统计信息
   */
  static async getVersionStats(): Promise<{
    totalSeries: number;
    totalVersions: number;
    totalVariants: number;
    averageVersionsPerSeries: number;
  }> {
    await this.initialize();
    
    const totalSeries = this.versionHistory.size;
    let totalVersions = 0;
    let totalVariants = 0;
    
    for (const history of this.versionHistory.values()) {
      totalVersions += history.versions.length;
      totalVariants += history.variants.length;
    }
    
    return {
      totalSeries,
      totalVersions,
      totalVariants,
      averageVersionsPerSeries: totalSeries > 0 ? Math.round(totalVersions / totalSeries * 100) / 100 : 0
    };
  }

  /**
   * 清理过期版本（可选功能）
   */
  static async cleanupOldVersions(daysOld: number = 30): Promise<number> {
    await this.initialize();
    
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    let deletedCount = 0;
    
    for (const [baseId, history] of this.versionHistory.entries()) {
      if (history.createdAt < cutoffTime) {
        // 删除文件系统中的相关文件
        for (const version of history.versions) {
          try {
            if (fs.existsSync(version.filePath)) {
              fs.unlinkSync(version.filePath);
            }
          } catch (error) {
            Logger.warn(`删除过期图片文件失败: ${version.filePath}`);
          }
        }
        
        this.versionHistory.delete(baseId);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      await this.saveVersionHistory();
      Logger.info(`清理了 ${deletedCount} 个过期版本系列`);
    }
    
    return deletedCount;
  }

  /**
   * 保存版本历史到文件
   */
  private static async saveVersionHistory(): Promise<void> {
    try {
      const data = Object.fromEntries(this.versionHistory);
      const dbPath = path.join(process.cwd(), this.VERSION_DB_FILE);
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      Logger.error('保存版本历史失败', error);
      throw error;
    }
  }

  /**
   * 从文件加载版本历史
   */
  private static async loadVersionHistory(): Promise<void> {
    try {
      const dbPath = path.join(process.cwd(), this.VERSION_DB_FILE);
      
      if (fs.existsSync(dbPath)) {
        const data = fs.readFileSync(dbPath, 'utf-8');
        const parsed = JSON.parse(data);
        this.versionHistory = new Map(Object.entries(parsed));
        Logger.info(`加载了 ${this.versionHistory.size} 个版本历史记录`);
      } else {
        this.versionHistory = new Map();
        Logger.info('创建新的版本历史数据库');
      }
    } catch (error) {
      Logger.error('加载版本历史失败', error);
      this.versionHistory = new Map();
    }
  }

  /**
   * 获取所有版本历史（用于调试）
   */
  static async getAllVersionHistory(): Promise<Map<string, VersionHistory>> {
    await this.initialize();
    return new Map(this.versionHistory);
  }
}
