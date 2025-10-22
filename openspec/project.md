# Project Context

## Purpose
AI 图片生成器是一款基于 Google Vertex AI 的多用户图像生成平台。项目目标是为创作者提供低延迟、可协作、可持续迭代的图像生成体验，支持任务排队、实时状态更新和参数化控制。

## Tech Stack
- 前端：React + TypeScript、Tailwind CSS、Socket.io Client、React Hot Toast
- 后端：Node.js (Express)、Socket.io、Redis、Google Vertex AI SDK
- 基础设施：Docker Compose 用于全栈编排，Redis 负责会话持久化和任务队列

## Project Conventions

### Code Style
- TypeScript/JavaScript 使用 2 空格缩进、单引号、分号结尾；保持 ESLint/Prettier 默认风格
- React 组件采用函数式组件和 Hooks；组件文件 PascalCase，hooks 以 `use` 前缀命名
- 共享类型放在 `shared/`，前后端各自使用相对路径导入

### Architecture Patterns
- 后端遵循路由 (`backend/routes`) + 服务 (`backend/services`) 分层，核心逻辑集中在服务层
- WebSocket 通过 Socket.io 提供实时更新；Redis 用于会话存储和任务排队
- 前端以状态提升 + 自定义 hooks 组织业务逻辑，使用服务层 (`frontend/src/services/`) 与后端交互

### Testing Strategy
- Jest 是前后端通用测试框架；后端重点单元测试服务与路由，前端关注关键 UI 流程和状态管理
- 对关键行为空路径编写高价值测试，确保生成任务和会话管理的核心逻辑稳定

### Git Workflow
- 分支：`feature/<summary>` 或 `fix/<issue-id>` 命名
- 提交：遵循 Conventional Commits（如 `feat:`, `fix:`, `chore:`）
- PR 需包含变更说明、关联 issue、测试记录；UI 变更附带截图或动图

## Domain Context
平台围绕图像生成工作流设计：用户提交 Vertex AI 模型任务，通过任务队列顺序执行，并在前端实时展示生成进度与结果。系统同时支持模板导入、会话持久化及移动端响应式体验。

## Important Constraints
- 严禁将 Google Cloud 服务账号凭证提交到仓库，需通过 Docker 挂载或本地 `.env` 指定路径
- 后端读取根目录 `.env`，需保持配置同步；Redis 必须可用以维持队列和会话
- 目标是在 100 行以下的增量中完成功能，优先使用简单、可审计的实现

## External Dependencies
- Google Vertex AI Gemini 2.5 Flash Image Preview 模型用于图像生成
- Redis 7+ 作为任务队列和会话存储
- Socket.io 提供实时通信通道
