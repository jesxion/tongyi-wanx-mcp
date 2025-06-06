# 通义万相 MCP 服务器

一个高性能、模块化的 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 通义万相文生图服务器，提供企业级的AI图像生成和智能提示词优化功能。

## ✨ 功能特性

### 🎨 强大的图像生成能力
- **多模型支持**: 支持 wanx2.1-t2i-turbo、wanx2.1-t2i-plus、wanx2.0-t2i-turbo
- **中英文提示词**: 完全支持中文和英文描述，智能提示词扩展
- **灵活参数控制**: 自定义图像尺寸、数量、种子值、负向提示词等
- **异步任务处理**: 支持长时间任务的状态查询和管理
- **批量生成**: 一次可生成1-4张图片

### 🧠 智能提示词系统
- **自动优化**: 将简单描述转换为专业级提示词
- **风格库**: 包含20+种艺术风格（3D卡通、水彩、写实、国风水墨等）
- **结构化指南**: 涵盖主体、场景、风格、镜头、光线等各个方面
- **丰富示例**: 提供大量实用的提示词模板和最佳实践

### 🏗️ 企业级架构设计
- **模块化设计**: 7个专门模块，职责清晰，易于维护和扩展
- **并发控制**: 智能请求队列，防止API限制，支持最大2个并发请求
- **错误恢复**: 指数退避重试机制，自动处理临时故障
- **性能监控**: 详细的性能指标和API调用统计
- **优雅关闭**: 完善的资源清理和服务关闭流程

### 💾 智能存储管理
- **本地图片存储**: 自动下载并本地保存生成的图片
- **元数据持久化**: JSON格式存储图片信息，支持搜索和统计
- **自动清理**: 7天后自动清理过期图片，节省存储空间
- **存储统计**: 实时显示存储使用情况和模型分布

### 🛡️ 可靠性保障
- **测试模式**: 无需API密钥即可测试所有功能
- **类型安全**: 完整的TypeScript类型定义
- **配置验证**: 启动时自动验证配置有效性
- **详细日志**: 分级日志系统，便于问题诊断

## 🚀 快速开始

### 📋 环境要求
- Node.js >= 18
- npm 或 yarn
- 通义万相 API 密钥（可选，测试模式无需密钥）

### 1. 克隆项目

```bash
git clone https://github.com/jesxion/tongyi-wanx-mcp.git
cd tongyi-wanx-mcp
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

#### 必需的环境变量

**图片存储目录（必需）:**
```powershell
# Windows (PowerShell)
$env:IMAGES_DIR="C:\path\to\your\images\directory"

# Linux/Mac
export IMAGES_DIR="/path/to/your/images/directory"
```

#### 可选的环境变量

**API密钥（生产环境推荐）:**
如果要使用真实的图像生成功能，需要配置API密钥：

1. 访问 [阿里云百炼平台](https://bailian.console.aliyun.com/)
2. 创建应用并获取 API Key
3. 设置环境变量：

**Windows (PowerShell):**
```powershell
$env:DASHSCOPE_API_KEY="your-api-key-here"
```

**Linux/Mac:**
```bash
export DASHSCOPE_API_KEY="your-api-key-here"
```

**或者创建 `.env` 文件:**
```env
IMAGES_DIR=./your-images-directory
DASHSCOPE_API_KEY=your-api-key-here
```

### 4. 编译和运行

```bash
# 编译TypeScript
npm run build

# 启动服务器
npm start

# 或者开发模式（自动重载）
npm run dev
```

### 5. 验证安装

```bash
# 运行测试（测试模式，无需API密钥）
npm test
```

如果看到 "🎉 所有测试完成！" 说明安装成功。

## 📋 项目结构

```
tongyi-wanx-mcp/
├── src/                    # 源代码目录
│   ├── index.ts           # 主服务器文件
│   ├── config.ts          # 配置管理模块
│   ├── logger.ts          # 日志系统模块
│   ├── errors.ts          # 错误处理模块
│   ├── concurrency.ts     # 并发控制模块
│   ├── image-storage.ts   # 图片存储模块
│   └── tongyi-service.ts  # 通义万相服务模块
├── dist/                  # 编译输出目录
├── generated_images/      # 生成图片存储目录
├── test_images/          # 测试图片存储目录
├── OPTIMIZATION.md        # 优化文档
├── CLEANUP-SUMMARY.md     # 清理总结
├── test.js               # 测试脚本
└── package.json          # 项目配置

## 🛠️ 可用工具

### 核心生成工具

#### text_to_image
生成AI图像的核心工具，支持多种参数自定义。

**参数：**
- `prompt` (必需): 图像描述，最长800字符
- `model`: 模型选择，可选值：
  - `wanx2.1-t2i-turbo` (默认) - 速度快，适合快速原型
  - `wanx2.1-t2i-plus` - 细节丰富，适合高质量输出
  - `wanx2.0-t2i-turbo` - 性价比高，适合日常使用
- `negative_prompt`: 负向提示词，最长500字符
- `size`: 图像尺寸，格式为 宽*高 (默认: 1024*1024)
  - 支持范围：512-1440像素
  - 常用尺寸：1024*1024、1024*576、576*1024
- `n`: 生成数量 1-4 (默认: 1)
- `seed`: 随机种子，用于控制生成的随机性 (可选)
- `prompt_extend`: 智能提示词扩展 (默认: true)
- `watermark`: 添加AI水印 (默认: false)
- `wait_for_completion`: 等待完成 (默认: true)

**示例：**
```json
{
  "model": "wanx2.1-t2i-plus",
  "prompt": "一只可爱的橘猫，坐在窗台上，阳光洒在毛发上，温暖的色调，日系摄影风格，高质量，4K，精细细节",
  "negative_prompt": "模糊，低质量，变形",
  "size": "1024*1024",
  "n": 2,
  "prompt_extend": true,
  "watermark": false
}
```

### 任务管理工具

#### query_task
查询图像生成任务状态和结果。

**参数：**
- `task_id` (必需): 任务ID

**返回状态：**
- `PENDING`: 任务排队中
- `RUNNING`: 任务执行中
- `SUCCEEDED`: 任务完成
- `FAILED`: 任务失败

#### get_supported_models
获取所有支持的模型列表及详细说明。

### 服务监控工具

#### get_service_status
获取服务状态信息，包括：
- 测试模式状态
- API密钥配置状态
- 并发请求情况
- 图片存储统计

#### get_image_stats
获取详细的图片存储统计信息：
- 总图片数量
- 存储空间使用
- 各模型使用分布
- 创建时间统计

#### search_images
搜索本地存储的图片。

**参数：**
- `query` (必需): 搜索关键词，可匹配提示词或模型名称

## 💡 智能提示词功能

本项目内置了强大的提示词优化系统，通过MCP的Prompts功能提供智能提示词处理。

### 可用的提示词模板

#### optimize-prompt
将简单描述优化为专业级提示词。

**参数：**
- `description` (必需): 简单的图像描述
- `style` (可选): 风格类型
  - `3D卡通`、`废土风`、`点彩画`、`超现实`
  - `水彩`、`粘土`、`写实`、`陶瓷`
  - `3D`、`水墨`、`折纸`、`工笔`、`国风水墨`
- `shot_type` (可选): 景别类型
  - `特写`、`近景`、`中景`、`远景`、`鸟瞰`

**示例：**
```
输入: "一只猫"
优化后: "一只可爱的橘猫，毛发蓬松，绿色眼睛，3D卡通风格，特写镜头，高质量渲染，精细细节，专业摄影，4K分辨率"
```

#### prompt-guide-[type]
获取详细的提示词写作指南，支持多种类型：

- `prompt-guide-basic`: 基础提示词公式和入门指南
- `prompt-guide-advanced`: 进阶提示词技巧
- `prompt-guide-styles`: 20+种艺术风格参考
- `prompt-guide-shot-types`: 景别和构图指南
- `prompt-guide-perspectives`: 视角和角度参考
- `prompt-guide-lens-types`: 镜头类型和效果
- `prompt-guide-lighting`: 光线和氛围设置

#### style-examples-[style]
获取特定风格的示例提示词，支持所有内置风格：

```
style-examples-3d-cartoon    # 3D卡通风格示例
style-examples-watercolor    # 水彩风格示例
style-examples-realistic     # 写实风格示例
style-examples-chinese-ink   # 国风水墨风格示例
... 等等
```

### 使用方法

通过MCP客户端调用提示词功能：

```json
{
  "method": "prompts/get",
  "params": {
    "name": "optimize-prompt",
    "arguments": {
      "description": "夕阳下的城市",
      "style": "废土风", 
      "shot_type": "远景"
    }
  }
}
```

## 📚 提示词写作指南

### 基础公式
```
主体 + 场景 + 风格
```

**示例：**
"25岁中国女孩，圆脸，看着镜头，优雅的民族服装，商业摄影，室外，电影级光照，半身特写，精致的淡妆，锐利的边缘。"

### 进阶公式
```
主体（主体描述）+ 场景（场景描述）+ 风格（定义风格）+ 镜头语言 + 氛围词 + 细节修饰
```

### 风格分类

#### 艺术风格
- **3D卡通**: 立体感强，色彩鲜艳，适合可爱风格
- **水彩**: 柔和渐变，梦幻效果，艺术感强
- **写实**: 细节丰富，逼真质感，商业摄影
- **国风水墨**: 传统美学，意境深远，中国风

#### 科幻/奇幻风格
- **废土风**: 后末日美学，金属质感
- **超现实**: 梦境般的奇幻效果
- **蒸汽朋克**: 复古科技，机械美学

#### 传统艺术风格
- **工笔画**: 精细线条，传统技法
- **折纸**: 几何简约，立体感
- **陶瓷**: 光滑质感，古典美

### 景别与构图

#### 景别类型
- **特写 (Close-up)**: 突出细节，情感表达，1/3画面
- **近景 (Medium Close-up)**: 半身人像，商业摄影
- **中景 (Medium Shot)**: 全身展示，环境结合
- **远景 (Long Shot)**: 广阔视野，宏观场面
- **鸟瞰 (Bird's Eye View)**: 俯视角度，全局视角

#### 构图技巧
- **三分法**: 黄金分割点构图
- **对称构图**: 平衡稳定的视觉效果
- **引导线**: 利用线条引导视线
- **框架构图**: 利用环境元素形成画框

### 光线与氛围

#### 光线效果
- **自然光**: 柔和真实，户外拍摄感
- **逆光**: 轮廓分明，梦幻光环效果
- **侧光**: 立体感强，戏剧性光影
- **顶光**: 均匀照明，商业摄影风格
- **氛围光**: 情感渲染，意境营造

#### 时间与环境
- **黄金时刻**: 日出日落，温暖色调
- **蓝调时刻**: 日落后，冷色调氛围
- **夜景**: 人工光源，霓虹灯效果
- **室内**: 受控光线，温馨氛围

### 质量增强关键词

#### 画质词汇
- `高质量`、`4K`、`8K`、`超高清`
- `精细细节`、`锐利清晰`、`专业摄影`
- `电影级`、`商业摄影`、`大师作品`

#### 技术词汇
- `景深`、`浅景深`、`长焦镜头`
- `HDR`、`专业打光`、`工作室光线`
- `后期处理`、`调色`、`电影色调`

## 🔧 配置与环境

### 环境变量配置
- `IMAGES_DIR`: 图片存储路径 (**必需**, 必须在 MCP host/client 端配置)
- `DASHSCOPE_API_KEY`: 通义万相API密钥 (可选，测试模式无需)
- `LOG_LEVEL`: 日志级别 (DEBUG, INFO, ERROR，默认: INFO)
- `MAX_CONCURRENT_REQUESTS`: 最大并发请求数 (默认: 2)
- `CLEANUP_INTERVAL_HOURS`: 清理间隔小时 (默认: 24)
- `IMAGE_RETENTION_DAYS`: 图片保留天数 (默认: 7)

### 模型对比

| 模型 | 特点 | 速度 | 质量 | 适用场景 |
|------|------|------|------|----------|
| wanx2.1-t2i-turbo | 速度优先 | ⭐⭐⭐ | ⭐⭐ | 快速原型、批量生成 |
| wanx2.1-t2i-plus | 质量优先 | ⭐⭐ | ⭐⭐⭐ | 高质量输出、商业用途 |
| wanx2.0-t2i-turbo | 性价比 | ⭐⭐⭐ | ⭐⭐ | 日常使用、成本控制 |

### 支持的图像尺寸

| 比例 | 尺寸 | 适用场景 |
|------|------|----------|
| 1:1 | 1024×1024 | 头像、图标、社交媒体 |
| 16:9 | 1024×576 | 横屏壁纸、YouTube缩略图 |
| 9:16 | 576×1024 | 手机壁纸、Instagram Story |
| 4:3 | 1024×768 | 传统照片比例 |
| 3:4 | 768×1024 | 肖像照片 |

### 性能优化配置

#### 并发控制
- **默认并发数**: 2个请求
- **队列管理**: 自动排队等待
- **超时设置**: 5分钟任务超时
- **重试机制**: 指数退避重试

#### 存储管理
- **自动清理**: 每24小时清理一次
- **图片压缩**: 自动优化存储空间
- **元数据缓存**: JSON格式快速检索
- **搜索索引**: 支持关键词搜索

## 📝 使用示例

### MCP客户端集成

#### Claude Desktop 配置
在 Claude Desktop 的配置文件中添加：

```json
{
  "mcpServers": {
    "tongyi-wanx": {
      "command": "node",
      "args": ["C:/path/to/tongyi-wanx-mcp/dist/index.js"],
      "env": {
        "IMAGES_DIR": "C:/path/to/your/images/directory",
        "DASHSCOPE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

#### 基础图像生成
```json
{
  "method": "tools/call",
  "params": {
    "name": "text_to_image",
    "arguments": {
      "prompt": "一朵盛开的樱花，粉色花瓣，春天的公园，阳光透过树叶，日系摄影风格，浅景深，高质量，4K",
      "model": "wanx2.1-t2i-plus",
      "size": "1024*1024",
      "negative_prompt": "模糊，低质量，变形，多余的手指",
      "n": 2
    }
  }
}
```

#### 批量生成不同风格
```json
{
  "method": "tools/call",
  "params": {
    "name": "text_to_image", 
    "arguments": {
      "prompt": "山水风景，古典建筑，中国风，国画风格，水墨画，意境深远，高质量",
      "model": "wanx2.1-t2i-plus",
      "size": "1024*576",
      "n": 4,
      "seed": 12345
    }
  }
}
```

### 提示词优化示例

#### 优化简单描述
```json
{
  "method": "prompts/get",
  "params": {
    "name": "optimize-prompt",
    "arguments": {
      "description": "夕阳下的城市",
      "style": "写实",
      "shot_type": "远景"
    }
  }
}
```

**优化结果：**
"现代化城市天际线，夕阳西下，金色阳光洒在高楼大厦上，玻璃幕墙反射温暖光线，写实摄影风格，远景拍摄，电影级构图，专业摄影，高质量，4K分辨率"

#### 获取风格指南
```json
{
  "method": "prompts/get",
  "params": {
    "name": "prompt-guide-styles"
  }
}
```

#### 获取特定风格示例
```json
{
  "method": "prompts/get",
  "params": {
    "name": "style-examples-watercolor"
  }
}
```

### 服务监控示例

#### 检查服务状态
```json
{
  "method": "tools/call",
  "params": {
    "name": "get_service_status"
  }
}
```

**返回示例：**
```json
{
  "service_status": {
    "isTestMode": false,
    "hasApiKey": true,
    "concurrencyStatus": {
      "activeRequests": 1,
      "maxConcurrent": 2,
      "queueLength": 0
    }
  },
  "image_storage": {
    "totalImages": 156,
    "totalSize": "2.3GB",
    "modelDistribution": {
      "wanx2.1-t2i-plus": 89,
      "wanx2.1-t2i-turbo": 67
    }
  }
}
```

#### 搜索历史图片
```json
{
  "method": "tools/call",
  "params": {
    "name": "search_images",
    "arguments": {
      "query": "猫咪"
    }
  }
}
```

## 🎯 最佳实践

### 提示词优化技巧

#### 1. 结构化描述
```
✅ 好的提示词:
"25岁亚洲女性，长发，微笑，穿白色连衣裙，站在樱花树下，春日阳光，日系摄影风格，浅景深，专业摄影，高质量"

❌ 避免的提示词:
"好看的女孩"
```

#### 2. 具体而非抽象
```
✅ 具体描述:
"金色夕阳，温暖光线，橘红色天空"

❌ 抽象描述:  
"美丽的夕阳"
```

#### 3. 负向提示词的使用
常用负向提示词：
- `模糊, 低质量, 变形, 多余的手指, 错误的解剖结构`
- `过度曝光, 欠曝光, 噪点, 失真`
- `水印, 文字, 标志, 签名`

#### 4. 质量增强关键词
必备质量词：
- `高质量, 4K, 8K, 专业摄影, 精细细节`
- `锐利清晰, 电影级, 商业摄影, 大师作品`
- `专业打光, HDR, 后期处理`

### 参数调优建议

#### 模型选择策略
```python
# 快速迭代和测试
model = "wanx2.1-t2i-turbo"

# 高质量最终输出
model = "wanx2.1-t2i-plus" 

# 成本控制
model = "wanx2.0-t2i-turbo"
```

#### 尺寸选择指南
```python
# 社交媒体头像
size = "1024*1024"

# 横屏壁纸/横幅
size = "1024*576" 

# 手机壁纸/竖屏内容
size = "576*1024"

# 印刷品/高分辨率需求
size = "1440*1440"
```

#### 种子值的艺术
```python
# 保持一致性 - 相同种子生成相似风格
seed = 12345

# 探索变化 - 不同种子探索可能性
seed = random.randint(1, 1000000)

# 系列创作 - 递增种子保持风格一致性
for i in range(10):
    seed = base_seed + i
```

### 高级技巧

#### 1. 提示词分层结构
```
主体层: "25岁中国女性，黑色长发，温柔笑容"
场景层: "坐在咖啡厅窗边，温暖的下午阳光"
风格层: "日系摄影风格，胶片质感，浅景深"
技术层: "专业摄影，85mm镜头，f/1.4光圈"
质量层: "高质量，4K分辨率，精细细节"
```

#### 2. 情感氛围营造
```
温馨: "温暖光线，柔和色调，舒适氛围"
神秘: "昏暗光线，对比强烈，戏剧性"
浪漫: "金色时刻，柔焦效果，梦幻光晕"
力量: "强烈对比，锐利线条，动态构图"
```

#### 3. 风格融合技巧
```
"3D卡通风格 + 日系摄影美学"
"水彩画效果 + 现代都市场景"  
"国风水墨 + 科幻元素"
"写实摄影 + 梦幻色彩"
```

### 故障排除指南

#### 常见问题解决

**Q: 生成的图像与描述不符**
A: 
- 检查提示词是否足够具体
- 尝试添加更多细节描述
- 使用负向提示词排除不需要的元素
- 调整模型选择

**Q: 图像质量不理想**
A:
- 使用 `wanx2.1-t2i-plus` 模型
- 添加质量增强关键词
- 检查图像尺寸设置
- 优化提示词结构

**Q: 任务生成失败**
A:
- 检查API密钥配置
- 确认提示词内容合规
- 查看服务器日志错误信息
- 重试或调整参数

**Q: 服务器响应慢**
A:
- 检查并发请求数量
- 等待当前任务完成
- 使用更快的模型 `turbo` 版本
- 减少生成图片数量

#### 测试模式使用
无API密钥时的功能测试：
```bash
# 启动测试模式
npm test

# 测试提示词优化
# 测试风格指南获取
# 测试服务状态查询
# 测试工具列表
```

## 🚀 开发与扩展

### 项目架构

```
src/
├── index.ts              # 主服务器 - MCP协议处理
├── config.ts             # 配置管理 - 环境变量验证
├── logger.ts             # 日志系统 - 分级日志记录
├── errors.ts             # 错误处理 - 自定义错误类型
├── concurrency.ts        # 并发控制 - 请求队列管理
├── image-storage.ts      # 图片存储 - 本地存储管理
└── tongyi-service.ts     # 通义服务 - API封装
```

### 模块说明

#### 核心模块
- **index.ts**: MCP服务器主入口，处理工具调用和提示词请求
- **config.ts**: 配置管理，支持环境变量验证和测试模式
- **tongyi-service.ts**: 通义万相API封装，支持异步任务处理

#### 支持模块  
- **logger.ts**: 结构化日志系统，支持性能监控
- **errors.ts**: 统一错误处理，包含重试机制
- **concurrency.ts**: 并发控制，防止API限制
- **image-storage.ts**: 图片存储管理，支持元数据和清理

### 扩展开发

#### 添加新工具
```typescript
// 在 index.ts 中添加新工具
const tools = [
  // 现有工具...
  {
    name: "your_new_tool",
    description: "您的新工具描述",
    inputSchema: {
      type: "object",
      properties: {
        // 参数定义
      }
    }
  }
];

// 在工具调用处理中添加逻辑
if (name === "your_new_tool") {
  // 处理逻辑
}
```

#### 添加新提示词模板
```typescript
// 在 prompts 数组中添加
{
  name: "your-prompt-template",
  description: "您的提示词模板",
  arguments: [
    {
      name: "param",
      description: "参数描述",
      required: true
    }
  ]
}
```

#### 添加新配置选项
```typescript
// 在 config.ts 中扩展配置
const ConfigSchema = z.object({
  // 现有配置...
  yourNewOption: z.string().default("default_value")
});
```

### 性能优化

#### 并发控制调优
```typescript
// 根据API限制调整并发数
const MAX_CONCURRENT = process.env.MAX_CONCURRENT || 2;

// 调整队列超时时间  
const QUEUE_TIMEOUT = process.env.QUEUE_TIMEOUT || 300000;
```

#### 存储优化
```typescript
// 调整清理策略
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24小时
const RETENTION_DAYS = 7; // 保留7天

// 添加压缩选项
const ENABLE_COMPRESSION = true;
```

#### 日志优化
```typescript
// 生产环境减少日志级别
const LOG_LEVEL = process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG';

// 添加日志轮转
const LOG_ROTATION = {
  maxFiles: 5,
  maxSize: '10m'
};
```

### 部署建议

#### Docker 部署
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
```

#### 环境配置
```bash
# 生产环境
NODE_ENV=production
LOG_LEVEL=INFO
MAX_CONCURRENT_REQUESTS=3
IMAGE_RETENTION_DAYS=30

# 开发环境  
NODE_ENV=development
LOG_LEVEL=DEBUG
MAX_CONCURRENT_REQUESTS=1
```

#### 监控集成
```typescript
// 添加健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// 添加指标收集
const metrics = {
  requestCount: 0,
  errorCount: 0,
  avgResponseTime: 0
};
```

## 🤝 贡献指南

### 贡献方式

我们欢迎各种形式的贡献！

#### 报告问题
- 使用 [GitHub Issues](https://github.com/jesxion/tongyi-wanx-mcp/issues) 报告bug
- 提供详细的重现步骤和环境信息
- 包含相关的日志输出

#### 功能请求
- 通过 Issues 提出新功能建议
- 详细描述功能需求和使用场景
- 考虑向后兼容性

#### 代码贡献
1. Fork 项目仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 开发环境设置

```bash
# 1. 克隆项目
git clone https://github.com/jesxion/tongyi-wanx-mcp.git
cd tongyi-wanx-mcp

# 2. 安装依赖
npm install

# 3. 创建环境配置
cp .env.example .env
# 编辑 .env 文件添加您的API密钥

# 4. 启动开发模式
npm run dev
```

### 代码规范

#### TypeScript 规范
- 使用严格的类型检查
- 为所有公共接口提供类型定义
- 避免使用 `any` 类型

#### 代码风格
- 使用 2 空格缩进
- 使用分号结尾
- 函数和变量使用 camelCase
- 常量使用 UPPER_SNAKE_CASE

#### 提交信息规范
```
feat: 添加新功能
fix: 修复bug
docs: 更新文档
style: 代码格式调整
refactor: 重构代码
test: 添加测试
chore: 构建工具或依赖更新
```

### 测试指南

```bash
# 运行所有测试
npm test

# 运行测试（测试模式）
npm run test:watch

# 构建检查
npm run build
```

### 版本发布

我们遵循 [语义化版本](https://semver.org/) 规范：
- **MAJOR**: 不兼容的API变更
- **MINOR**: 向后兼容的功能添加
- **PATCH**: 向后兼容的问题修复

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [阿里云通义万相](https://tongyi.aliyun.com/) - 提供强大的AI图像生成服务
- [Model Context Protocol](https://modelcontextprotocol.io/) - 提供标准化的AI服务协议
- [TypeScript](https://www.typescriptlang.org/) - 提供类型安全的开发体验
- [Zod](https://zod.dev/) - 提供运行时类型验证

## 📞 联系方式

- **作者**: Jesxion
- **邮箱**: jesxion@gmail.com
- **GitHub**: [@jesxion](https://github.com/jesxion)
- **项目主页**: [tongyi-wanx-mcp](https://github.com/jesxion/tongyi-wanx-mcp)

## 🔗 相关链接

- [通义万相官方文档](https://help.aliyun.com/zh/dashscope/developer-reference/api-details-9)
- [MCP 协议规范](https://modelcontextprotocol.io/docs)
- [阿里云百炼平台](https://bailian.console.aliyun.com/)
- [项目优化文档](OPTIMIZATION.md)

## 📈 项目状态

![GitHub stars](https://img.shields.io/github/stars/jesxion/tongyi-wanx-mcp?style=social)
![GitHub forks](https://img.shields.io/github/forks/jesxion/tongyi-wanx-mcp?style=social)
![GitHub issues](https://img.shields.io/github/issues/jesxion/tongyi-wanx-mcp)
![GitHub license](https://img.shields.io/github/license/jesxion/tongyi-wanx-mcp)

---

**🎨 让AI图像生成更简单、更专业、更可靠！**

*通过智能提示词系统和企业级架构，为开发者提供最佳的AI图像生成体验。*
