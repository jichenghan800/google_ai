# 本地开发启动指南

## 快速启动命令

### 后端启动
```bash
# 停止现有进程
pkill -f "nodemon.*server.js"

# 启动后端开发服务器
cd /root/google_ai/backend && NODE_ENV=development REDIS_HOST=localhost HOST=0.0.0.0 PORT=3001 npm run dev > ../backend.log 2>&1 &
```

### 前端启动
```bash
# 使用3003端口避免与其他服务冲突
cd /root/google_ai/frontend && PORT=3003 HOST=0.0.0.0 npm start > ../frontend.log 2>&1 &
```

### Redis启动
```bash
# 如果Redis未运行
docker run -d -p 6379:6379 redis:7-alpine
```

## 环境配置

### 前端环境变量 (.env)
```bash
# 本地开发配置
REACT_APP_API_URL=http://localhost:3001/api  
REACT_APP_SOCKET_URL=http://localhost:3001

# 外网访问配置
# REACT_APP_API_URL=http://47.236.135.3:3001/api
# REACT_APP_SOCKET_URL=http://47.236.135.3:3001
```

### 后端环境变量 (.env)
```bash
NODE_ENV=development
REDIS_HOST=localhost
HOST=0.0.0.0
PORT=3001
AI_PROVIDER=vertex
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=global
GOOGLE_APPLICATION_CREDENTIALS=/app/your-credentials-file.json
```

## 常用检查命令

### 检查服务状态
```bash
# 检查端口占用
lsof -i:3000  # 前端
lsof -i:3001  # 后端
lsof -i:6379  # Redis

# 检查进程
ps aux | grep "npm.*start"      # 前端进程
ps aux | grep "nodemon"         # 后端进程
ps aux | grep "redis"           # Redis进程
```

### 查看日志
```bash
# 后端日志
tail -f /root/google_ai/backend.log

# 前端日志  
tail -f /root/google_ai/frontend.log

# Docker日志
docker-compose logs backend
docker-compose logs frontend
```

### 停止所有服务
```bash
# 停止本地开发服务
pkill -f "npm.*start"
pkill -f "nodemon.*server.js"

# 停止Docker服务
docker-compose down
```

## 故障排除

### 端口冲突
```bash
# 如果3000端口被Docker占用
docker stop ai-generator-frontend

# 如果3001端口被占用
lsof -ti:3001 | xargs kill -9
```

### 前端连接问题
1. 检查 `/root/google_ai/frontend/.env` 中的API地址
2. 确保后端在3001端口运行
3. 重启前端服务

### 后端启动失败
1. 检查Redis是否运行
2. 检查Google Cloud凭证文件
3. 查看后端日志排查错误

## 访问地址

- **本地访问**: http://localhost:3000
- **外网访问**: http://47.236.135.3:3000
- **后端API**: http://localhost:3001/api 或 http://47.236.135.3:3001/api
