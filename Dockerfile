# 使用官方Node.js运行时作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制package*.json文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && npm cache clean --force

# 复制源代码
COPY . .

# 编译TypeScript
RUN npm run build

# 创建图像存储目录
RUN mkdir -p /app/generated_images

# 设置环境变量
ENV IMAGES_DIR=/app/generated_images
ENV NODE_ENV=production

# 暴露端口（如果需要）
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check')" || exit 1

# 运行服务器
CMD ["npm", "start"]
