# TypeScript Sample Project Dockerfile
FROM node:20-slim

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
RUN npm ci

# 复制源代码
COPY tsconfig.json ./
COPY src/ ./src/

# 构建TypeScript
RUN npm run build
RUN npm prune --omit=dev

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["npm", "start"]
