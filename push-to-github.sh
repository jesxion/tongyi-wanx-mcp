#!/bin/bash

# 通义万相MCP服务器 GitHub推送脚本
# 使用方法: ./push-to-github.sh <your-github-username>

if [ "$#" -ne 1 ]; then
    echo "使用方法: $0 <your-github-username>"
    echo "例如: $0 jesxion"
    exit 1
fi

USERNAME=$1
REPO_NAME="tongyi-wanx-mcp"

echo "🚀 准备推送 $REPO_NAME 到 GitHub..."
echo "用户名: $USERNAME"
echo "仓库: https://github.com/$USERNAME/$REPO_NAME"

# 添加远程仓库
echo "📡 添加远程仓库..."
git remote add origin https://github.com/$USERNAME/$REPO_NAME.git

# 设置默认分支为main
echo "🌟 设置默认分支..."
git branch -M main

# 推送到GitHub
echo "⬆️ 推送代码到GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo "✅ 成功推送到GitHub!"
    echo "🔗 仓库地址: https://github.com/$USERNAME/$REPO_NAME"
    echo ""
    echo "📋 后续步骤:"
    echo "• 在GitHub上编辑仓库描述和标签"
    echo "• 添加MIT许可证 (建议)"
    echo "• 设置GitHub Pages (如果需要)"
    echo "• 配置GitHub Actions (如果需要CI/CD)"
else
    echo "❌ 推送失败，请检查:"
    echo "• GitHub仓库是否已创建"
    echo "• 用户名是否正确"
    echo "• 是否有推送权限"
fi
