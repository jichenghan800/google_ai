## ADDED Requirements
### Requirement: Cancel Pending Image Tasks
Users MUST be able to 撤销尚未完成的图像生成任务，并立即获得状态反馈。

#### Scenario: Cancel queued task
- **GIVEN** 用户会话中存在处于排队状态的生成任务
- **WHEN** 用户在客户端点击取消操作
- **THEN** 系统从队列中移除该任务
- **AND** 通过 WebSocket 广播取消结果和原因
- **AND** 客户端在任务列表中标记为已取消

#### Scenario: Cancel running task
- **GIVEN** 任务正在执行且支持中断
- **WHEN** 用户发送取消请求
- **THEN** 系统通知执行进程停止该任务并释放占用资源
- **AND** Redis 中的任务状态更新为已取消
- **AND** 客户端收到取消通知并停止进度指示
