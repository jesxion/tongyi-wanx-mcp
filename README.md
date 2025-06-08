# 通义万相 MCP 服务器 v2.3.0

一个功能全面的 Model Context Protocol (MCP) 服务器，为 Claude Desktop 等 MCP 客户端提供强大的 AI 图像生成和编辑功能。基于阿里云通义万相模型，支持文本生成图像、图像编辑、智能提示词优化、OSS 云存储等核心功能。

## ✨ 核心特性

### 🎯 完整的图像生成功能
- **文本生成图像**: 支持 wanx2.1 系列最新模型，包括 turbo 和 plus 版本
- **图像编辑**: 10种专业图像编辑功能，包括风格化、局部重绘、扩图、超分等
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
- **分层架构**: 采用现代化四层架构，代码组织清晰，职责分离
  - Core层：核心业务逻辑，独立于外部依赖
  - Features层：按功能模块组织，支持独立开发和测试
  - Handlers层：统一处理外部请求，协调各层交互
  - Infrastructure层：提供通用服务和基础设施
- **模块化设计**: 15个专门模块，每个模块职责清晰，易于维护和扩展
- **并发控制**: 智能请求队列，防止API限制，支持最大2个并发请求
- **错误恢复**: 指数退避重试机制，自动处理临时故障
- **性能监控**: 详细的性能指标和API调用统计
- **优雅关闭**: 完善的资源清理和服务关闭流程

### 💾 智能存储管理 (v2.3.0 新特性)
- **条件本地存储**: 仅在配置 IMAGES_DIR 时启用本地存储，灵活适应不同部署需求
- **阿里云 OSS 集成**: 可选的云端存储，提供永久访问链接和自动日志上传
- **智能 URL 选择**: 优先使用 OSS URL，自动回退到本地路径
- **用户图片上传**: 支持上传本地图片到 OSS 获取公网 URL
- **OSS 状态管理**: 修复图片 OSS 状态，批量管理云端资源
- **元数据持久化**: JSON格式存储图片信息，支持搜索和统计
- **自动清理**: 7天后自动清理过期图片，节省存储空间
- **存储统计**: 实时显示存储使用情况、OSS 状态和模型分布

### 🛡️ 可靠性保障
- **测试模式**: 无需API密钥即可测试所有功能
- **类型安全**: 完整的TypeScript类型定义
- **配置验证**: 启动时自动验证配置有效性
- **OSS 日志系统**: 自动缓冲并上传日志到云端（50条缓冲，5分钟自动上传）
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

复制示例配置文件：
```bash
cp .env.example .env
```

#### 必需的环境变量

**图片存储目录（推荐配置）:**
```bash
# Windows
IMAGES_DIR=C:\path\to\your\images\directory

# Linux/Mac
IMAGES_DIR=/path/to/your/images/directory
```

#### 可选的环境变量

**API密钥（生产环境推荐）:**
1. 访问 [阿里云百炼平台](https://bailian.console.aliyun.com/)
2. 创建应用并获取 API Key
3. 在 .env 文件中配置：

```env
DASHSCOPE_API_KEY=your-api-key-here
```

**阿里云 OSS 配置（可选，启用云存储功能）:**
```env
OSS_ENABLE=true
OSS_ACCESS_KEY_ID=your-oss-access-key-id
OSS_ACCESS_KEY_SECRET=your-oss-access-key-secret
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=your-bucket-name
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

采用现代化分层架构设计，代码组织清晰，便于维护和扩展：

```
tongyi-wanx-mcp/
├── src/                          # 源代码目录
│   ├── index.ts                 # 主服务器入口 - MCP协议处理和服务启动
│   │
│   ├── core/                    # 核心业务层
│   │   ├── services/            # 业务服务
│   │   │   └── tongyi-service.ts    # 通义万相API封装
│   │   └── storage/             # 存储服务
│   │       ├── image-storage.ts     # 图片本地存储管理
│   │       └── oss-service.ts       # 阿里云OSS服务
│   │
│   ├── features/                # 功能模块层
│   │   ├── batch/               # 批处理功能
│   │   │   └── batch-operation-manager.ts  # 批量操作管理
│   │   ├── prompt/              # 提示词功能
│   │   │   ├── prompt-guides.ts     # 提示词指南和优化
│   │   │   └── prompt-optimizer.ts # 智能提示词优化器
│   │   ├── versioning/          # 版本管理功能
│   │   │   └── image-version-manager.ts    # 图片版本管理
│   │   └── workflow/            # 工作流功能
│   │       └── workflow-manager.ts         # 工作流管理器
│   │
│   ├── handlers/                # 处理器层
│   │   ├── tool-handlers.ts     # MCP工具处理器
│   │   └── tool-manager.ts      # 工具管理器
│   │
│   └── infrastructure/          # 基础设施层
│       ├── config.ts            # 配置管理 - 环境变量验证
│       ├── logger.ts            # 日志系统 - 支持OSS上传
│       ├── errors.ts            # 错误处理 - 自定义错误类型
│       ├── concurrency.ts       # 并发控制 - 请求队列管理
│       └── cache-manager.ts     # 缓存管理 - 智能缓存策略
│
├── dist/                        # 编译输出目录
├── generated_images/            # 生成图片存储目录（可选）
├── .env.example                # 环境变量配置示例
├── package.json                # 项目配置
└── tsconfig.json               # TypeScript配置
```

### 🏗️ 架构设计原则

#### 分层架构优势
1. **核心层 (Core)**: 包含核心业务逻辑，独立于外部系统
2. **功能层 (Features)**: 按业务功能组织，职责清晰
3. **处理器层 (Handlers)**: 处理外部请求，协调各层交互
4. **基础设施层 (Infrastructure)**: 提供通用服务和工具

#### 模块化设计
- 每个模块都有明确的职责边界
- 通过 `index.ts` 文件统一导出接口
- 支持独立测试和部署
- 便于功能扩展和维护

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

#### image_edit
使用通义万相进行图像编辑，支持10种编辑功能。

**必需参数：**
- `prompt`: 提示词，描述期望的编辑效果
- `function`: 图像编辑功能类型
- `base_image_url`: 基础图像的URL地址

**支持的编辑功能：**
1. **全局风格化** (`stylization_all`) - 整张图像风格迁移
2. **局部风格化** (`stylization_local`) - 局部区域风格迁移（8种风格）
3. **指令编辑** (`description_edit`) - 通过指令编辑图像
4. **局部重绘** (`description_edit_with_mask`) - 精确区域编辑
5. **去文字水印** (`remove_watermark`) - 去除文字和水印
6. **扩图** (`expand`) - 四个方向按比例扩展
7. **图像超分** (`super_resolution`) - 高清放大（1-4倍）
8. **图像上色** (`colorization`) - 黑白图像转彩色
9. **线稿生图** (`doodle`) - 基于线稿生成图像
10. **人体重绘** (`person_generation`) - 人体图像生成

**可选参数：**
- `mask_image_url`: 遮罩图像URL（局部重绘需要）
- `strength`: 图像修改幅度（0.0-1.0）
- `upscale_factor`: 超分放大倍数（1-4）
- `top_scale`, `bottom_scale`, `left_scale`, `right_scale`: 扩展比例（1.0-2.0）

#### get_image_edit_functions
获取所有图像编辑功能的详细说明和使用技巧。

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
- OSS 服务状态

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

### 云存储管理工具 (OSS) - v2.3.0 新增

#### upload_image_to_oss
上传本地图片到阿里云 OSS 获取公网访问 URL。

**参数：**
- `image_path` (必需): 本地图片文件路径

**返回：**
- OSS 公网访问 URL
- 本地文件路径  
- OSS 对象名称

#### repair_oss_status
修复图片的 OSS 状态，将本地图片重新上传到 OSS。

**参数：**
- `image_id` (必需): 要修复的图片 ID

**使用场景：**
- 图片生成时 OSS 上传失败
- OSS 配置更改后需要重新上传
- 批量修复历史图片的 OSS 状态

#### get_oss_status
获取 OSS 服务状态和配置信息。

**返回信息：**
- OSS 功能启用状态
- 配置完整性检查
- 存储桶和区域信息
- 访问密钥配置状态

#### list_oss_images
列出 OSS 中存储的图片资源。

#### get_log_status
获取日志系统状态信息，包括缓冲区状态和上传统计。

#### flush_logs
强制上传缓冲的日志到 OSS。

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

### 图像编辑提示词技巧

#### 风格化编辑
```
全局风格化：
- "转换成法国绘本风格"
- "转换成金箔艺术风格"

局部风格化：
- "把房子变成木板风格"
- "把衣服变成青花瓷风格"
- "把头发变成云朵风格"
```

#### 指令编辑
```
添加操作：
- "添加一顶红色帽子"
- "在背景中添加雪花"

修改操作：
- "把女孩的头发修改为红色"
- "把汽车的颜色改成蓝色"

移除操作：
- "移除背景中的建筑物"
- "去除图像中的文字"
```

#### 扩图提示词
```
场景扩展：
- "一位绿色仙子在森林中飞舞"
- "扩展显示更多的海滩风景"
- "展现完整的城市天际线"
```

## 🔧 配置与环境

### 环境变量配置

#### 基础配置
- `IMAGES_DIR`: 图片存储路径 (可选，不配置则不启用本地存储)
- `DASHSCOPE_API_KEY`: 通义万相API密钥 (可选，测试模式无需)
- `LOG_LEVEL`: 日志级别 (DEBUG, INFO, ERROR，默认: INFO)
- `MAX_CONCURRENT_REQUESTS`: 最大并发请求数 (默认: 2)
- `CLEANUP_INTERVAL_HOURS`: 清理间隔小时 (默认: 24)
- `IMAGE_RETENTION_DAYS`: 图片保留天数 (默认: 7)

#### 阿里云 OSS 配置 (可选)
启用 OSS 功能可以将生成的图片自动上传到云端，获得永久访问链接，避免临时 URL 过期问题。

**必需配置（启用 OSS 时）：**
- `OSS_ENABLE`: 启用 OSS 功能 (true/false，默认: false)
- `OSS_ACCESS_KEY_ID`: OSS 访问密钥 ID
- `OSS_ACCESS_KEY_SECRET`: OSS 访问密钥 Secret
- `OSS_REGION`: OSS 区域 (如: oss-cn-hangzhou)
- `OSS_BUCKET`: OSS 存储桶名称

**可选配置：**
- `OSS_ENDPOINT`: 自定义 OSS 端点
- `OSS_IMAGE_PREFIX`: 图片存储路径前缀 (默认: images/)
- `OSS_LOG_PREFIX`: 日志存储路径前缀 (默认: logs/)

💡 **OSS 功能优势**:
- ✅ 永久访问链接，不会过期
- ✅ 支持 CDN 加速，全球访问更快
- ✅ 自动备份，数据更安全
- ✅ 支持用户图片上传，便于图像编辑功能
- ✅ 智能回退，OSS 不可用时自动使用本地存储
- ✅ 自动日志上传，便于问题追踪

### OSS 存储结构

```
your-bucket/
├── images/
│   ├── generated/          # 生成的图片
│   ├── user-uploads/       # 用户上传的图片
│   ├── downloaded/         # 从 URL 下载的图片
│   └── repaired/          # 修复状态时重新上传的图片
└── logs/                   # 系统日志文件
    └── yyyy-mm-dd/        # 按日期分组的日志
```

### OSS 权限要求

您的 OSS AccessKey 需要以下权限：
- `oss:PutObject` - 上传文件
- `oss:GetObject` - 获取文件 
- `oss:DeleteObject` - 删除文件
- `oss:ListObjects` - 列出文件

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
        "DASHSCOPE_API_KEY": "your-api-key-here",
        "OSS_ENABLE": "true",
        "OSS_ACCESS_KEY_ID": "your-oss-access-key-id",
        "OSS_ACCESS_KEY_SECRET": "your-oss-access-key-secret",
        "OSS_REGION": "oss-cn-hangzhou",
        "OSS_BUCKET": "your-bucket-name"
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

#### 图像编辑示例
```json
{
  "method": "tools/call",
  "params": {
    "name": "image_edit",
    "arguments": {
      "prompt": "把女孩的头发修改为红色",
      "function": "description_edit",
      "base_image_url": "https://your-image-url.jpg",
      "strength": 0.7
    }
  }
}
```

#### OSS 管理示例
```json
{
  "method": "tools/call",
  "params": {
    "name": "upload_image_to_oss",
    "arguments": {
      "image_path": "/path/to/local/image.jpg"
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

### 图像编辑最佳实践

#### 1. 风格化编辑
```
全局风格化：明确指定目标风格
"转换成法国绘本风格" ✅
"变成好看的风格" ❌

局部风格化：具体描述要修改的部分
"把房子变成木板风格" ✅  
"把东西变成其他风格" ❌
```

#### 2. 指令编辑
```
清晰的操作指令：
"把女孩的头发修改为红色" ✅
"添加一顶蓝色帽子" ✅
"改变一些东西" ❌
```

#### 3. 遮罩制作技巧
- 白色区域：需要编辑的部分（RGB: 255,255,255）
- 黑色区域：保持不变的部分（RGB: 0,0,0）
- 边缘平滑：使用渐变过渡避免硬边

### 存储策略建议

#### 1. 本地存储 vs OSS 存储
```
仅本地存储：
- 适用于个人使用、测试环境
- 配置 IMAGES_DIR，不配置 OSS

仅 OSS 存储：
- 适用于生产环境、多用户场景
- 不配置 IMAGES_DIR，配置 OSS

混合存储：
- 适用于逐步迁移、备份需求
- 同时配置 IMAGES_DIR 和 OSS
```

#### 2. OSS 配置建议
```
开发环境：
OSS_ENABLE=false  # 使用本地存储，节省成本

测试环境：
OSS_ENABLE=true
OSS_BUCKET=your-test-bucket  # 使用测试桶

生产环境：
OSS_ENABLE=true
OSS_BUCKET=your-prod-bucket  # 使用生产桶
OSS_ENDPOINT=your-cdn-domain  # 配置 CDN 加速
```

## 🔧 故障排除

### 常见问题解决

#### 图像生成问题
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

#### 图像编辑问题
**Q: 编辑效果不理想**
A:
- 调整 `strength` 参数（0.5-0.8 通常效果较好）
- 使用更具体的编辑指令
- 检查遮罩图像质量（如需要）
- 尝试不同的编辑功能

**Q: 局部重绘不精确**
A:
- 检查遮罩图像格式和质量
- 确保遮罩边缘清晰
- 使用渐变边缘避免硬切割
- 调整编辑强度

#### 服务器问题
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

#### OSS 相关问题
**Q: OSS 上传失败**
A:
- 检查 OSS 配置是否正确
- 验证 AccessKey 权限
- 确认存储桶是否存在
- 查看网络连接状态

**Q: OSS 状态异常**
A:
- 使用 `get_oss_status` 检查配置
- 使用 `repair_oss_status` 修复状态
- 检查 OSS 服务可用性
- 验证权限配置

#### 测试模式使用
无API密钥时的功能测试：
```bash
# 启动测试模式
npm test

# 测试功能包括：
# - 提示词优化
# - 风格指南获取  
# - 服务状态查询
# - 工具列表获取
```

## 📊 版本更新历史

### v2.3.0 (当前版本) - 2024年6月
#### 新增功能
- ✅ **条件本地存储**: 仅在配置 IMAGES_DIR 时启用本地存储
- ✅ **OSS 云存储集成**: 完整的阿里云 OSS 支持，包括图片和日志存储
- ✅ **6个新增 MCP 工具**: OSS 管理、日志管理、图片上传等
- ✅ **OSS 日志系统**: 自动缓冲并上传日志到云端
- ✅ **增强的资源发现**: 支持本地和 OSS 图片资源自动发现
- ✅ **优雅关闭**: 异步清理日志和服务资源

#### 架构重构 - 2024年6月最新更新
- ✅ **分层架构设计**: 采用现代化的四层架构模式
  - **Core层**: 核心业务逻辑（services, storage）
  - **Features层**: 功能模块（batch, prompt, versioning, workflow）  
  - **Handlers层**: 请求处理器（tool-handlers, tool-manager）
  - **Infrastructure层**: 基础设施（config, logger, cache, errors）
- ✅ **模块化重构**: 所有文件按功能重新组织，提高代码可维护性
- ✅ **TypeScript 优化**: 修复所有编译错误，实现0错误编译
- ✅ **导入路径优化**: 统一使用相对路径，支持模块独立导入
- ✅ **代码质量提升**: 解决未使用变量警告，优化代码结构

#### 优化改进
- ✅ **存储策略优化**: 支持纯本地、纯OSS、混合存储三种模式
- ✅ **错误处理增强**: OSS 操作失败时优雅降级
- ✅ **性能优化**: 日志缓冲机制减少 OSS 请求频率
- ✅ **向后兼容**: 完全兼容现有本地存储功能
- ✅ **开发体验**: 更清晰的项目结构，便于新开发者理解和贡献

### v2.1.0 - 图像编辑功能
- ✅ 新增 10种图像编辑功能
- ✅ 支持风格化、局部重绘、扩图、超分等
- ✅ 遮罩图像支持
- ✅ 图像编辑参数优化

### v2.0.0 - 企业级重构
- ✅ 模块化架构设计
- ✅ TypeScript 重写
- ✅ 并发控制系统
- ✅ 智能提示词系统
- ✅ 本地图片存储

### v1.0.0 - 初始版本
- ✅ 基础文本生成图像功能
- ✅ 多模型支持
- ✅ MCP 协议实现

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
- [阿里云 OSS 控制台](https://oss.console.aliyun.com/)

## 📈 项目状态

![GitHub stars](https://img.shields.io/github/stars/jesxion/tongyi-wanx-mcp?style=social)
![GitHub forks](https://img.shields.io/github/forks/jesxion/tongyi-wanx-mcp?style=social)
![GitHub issues](https://img.shields.io/github/issues/jesxion/tongyi-wanx-mcp)
![GitHub license](https://img.shields.io/github/license/jesxion/tongyi-wanx-mcp)

---

**🎨 让AI图像生成更简单、更专业、更可靠！**

*通过智能提示词系统、完整的图像编辑功能和企业级 OSS 存储，为开发者提供最佳的AI图像生成体验。*
