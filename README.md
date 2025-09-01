# AI图片生成器

基于Google Vertex AI的多用户图片生成网页应用，支持会话持久化和实时更新。

## 功能特点

- 🎨 基于Google Vertex AI Gemini 2.5 Flash Image Preview模型
- 👥 多用户并发支持
- 💾 会话持久化（刷新页面不丢失数据，关闭页面自动清空）
- ⚡ 实时任务状态更新
- 🎛️ 丰富的生成参数控制（宽高比、风格、质量）
- 📱 响应式设计，支持移动端
- 🔄 任务队列管理
- 📥 图片下载功能

## 技术架构

### 前端
- React + TypeScript
- Tailwind CSS
- Socket.io Client
- React Hot Toast

### 后端
- Node.js + Express
- Socket.io
- Redis（会话存储和任务队列）
- Google Vertex AI

## 快速开始

### 环境要求
- Node.js 18+
- Redis 7+
- Google Cloud Account with Vertex AI enabled

### 安装和运行

1. **克隆项目**
```bash
git clone <repository-url>
cd google_ai
```

2. **配置环境变量**
```bash
# 确保.env文件包含以下配置
AI_PROVIDER=vertex
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account.json
VERTEX_MODEL_ID=gemini-2.5-flash-image-preview
AI_TEMPERATURE=0.0
AI_USE_STREAMING=true
AI_MAX_OUTPUT_TOKENS=8192
AI_MAX_RETRIES=2
AI_RETRY_DELAY_MS=2000

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# 服务器配置
SERVER_PORT=3001
CLIENT_PORT=3000

# 会话配置
SESSION_TTL=86400
```

3. **启动Redis**
```bash
# 使用Docker
docker run -d -p 6379:6379 redis:7-alpine

# 或使用本地Redis
redis-server
```

4. **安装后端依赖并启动**
```bash
cd backend
npm install
npm run dev
```

5. **安装前端依赖并启动**
```bash
cd frontend
npm install
npm start
```

6. **使用Docker Compose（推荐）**
```bash
docker-compose up -d
```

## 项目结构

```
/
├── backend/              # 后端服务
│   ├── routes/          # API路由
│   ├── services/        # 核心服务
│   │   ├── sessionManager.js    # 会话管理
│   │   ├── taskQueue.js         # 任务队列
│   │   ├── vertexAI.js          # Vertex AI集成
│   │   └── websocket.js         # WebSocket处理
│   └── server.js        # 服务器入口
├── frontend/            # 前端应用
│   ├── src/
│   │   ├── components/  # React组件
│   │   ├── contexts/    # Context提供者
│   │   ├── hooks/       # 自定义Hook
│   │   ├── services/    # API和WebSocket服务
│   │   ├── types/       # TypeScript类型定义
│   │   └── utils/       # 工具函数
│   └── public/
├── shared/              # 共享类型定义
├── docker-compose.yml   # Docker编排
└── CLAUDE.md           # 项目文档
```

## API文档

### 会话管理
- `POST /api/sessions/create` - 创建新会话
- `GET /api/sessions/:sessionId` - 获取会话信息
- `PUT /api/sessions/:sessionId/settings` - 更新会话设置
- `DELETE /api/sessions/:sessionId` - 删除会话

### 图片生成
- `POST /api/generate/image` - 提交生成任务
- `GET /api/generate/history/:sessionId` - 获取生成历史
- `GET /api/generate/queue/:sessionId` - 获取队列状态
- `DELETE /api/generate/task/:taskId` - 取消任务

### WebSocket事件
- `task_queued` - 任务已排队
- `task_processing` - 任务处理中
- `task_completed` - 任务完成
- `task_failed` - 任务失败
- `queue_status` - 队列状态更新

## 部署

### Docker部署
```bash
docker-compose up -d
```

### 生产环境配置
1. 设置环境变量
2. 配置Redis持久化
3. 使用Nginx反向代理
4. 配置SSL证书
5. 设置日志收集

## 故障排除

### 常见问题

1. **Redis连接失败**
   - 检查Redis服务是否运行
   - 验证连接配置

2. **Vertex AI认证失败**
   - 确认服务账号文件路径正确
   - 验证Google Cloud项目配置

3. **WebSocket连接断开**
   - 检查网络连接
   - 查看服务器日志

### 日志查看
```bash
# 后端日志
docker-compose logs backend

# 前端日志
docker-compose logs frontend

# Redis日志
docker-compose logs redis
```

## 开发

### 后端开发
```bash
cd backend
npm run dev  # 使用nodemon热重载
```

### 前端开发
```bash
cd frontend
npm start   # 启动开发服务器
```

### 类型检查
```bash
cd frontend
npm run build  # 编译TypeScript并检查类型
```

## 贡献

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 创建Pull Request

## 许可证

MIT License