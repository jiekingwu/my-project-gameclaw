FROM node:18-alpine

WORKDIR /app

# 设置北京时间
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 安装 better-sqlite3 编译所需的工具链
RUN apk add --no-cache python3 make g++

# 安装依赖（利用 Docker 缓存层）
COPY package*.json ./
RUN npm install --production && npm cache clean --force

# 清理编译工具（减小镜像体积）
RUN apk del python3 make g++

# 复制代码
COPY . .

# 确保数据目录存在 & 初始化数据库
RUN mkdir -p /app/data && node data/migrations/init.js

# 云托管固定用 80 端口
ENV PORT=80
EXPOSE 80

CMD ["node", "app.js"]
