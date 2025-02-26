# Slidev-Ops

## API 接口说明

### 触发工作流

```
POST /api/trigger-workflow
```

请求体:
```json
{
  "ref": "main", // 可选，默认为 main
  "inputs": {
    "environment": "dev",
    "version": "1.0.0"
    // 其他工作流需要的参数
  }
}
```

响应:
```json
{
  "message": "工作流已成功触发",
  "run_id": 12345678,
  "status_url": "/api/workflow-status/12345678",
  "html_url": "https://github.com/owner/repo/actions/runs/12345678",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

> **注意**: 系统会自动添加唯一的`request_id`到工作流输入参数中，用于快速识别和查找工作流运行记录。

### 查询工作流状态

```
GET /api/workflow-status/:runId
```

响应:
```json
{
  "id": 12345678,
  "status": "completed",
  "conclusion": "success",
  "started_at": "2023-01-01T12:00:00Z",
  "updated_at": "2023-01-01T12:10:00Z",
  "html_url": "https://github.com/owner/repo/actions/runs/12345678"
}
```

### 查询最近工作流运行记录

```
GET /api/workflow-runs?page=1&per_page=10
```

响应:
```json
{
  "total_count": 42,
  "runs": [
    {
      "id": 12345678,
      "status": "completed",
      "conclusion": "success",
      "started_at": "2023-01-01T12:00:00Z",
      "updated_at": "2023-01-01T12:10:00Z",
      "html_url": "https://github.com/owner/repo/actions/runs/12345678",
      "environment": "dev"
    },
    // ...更多运行记录
  ]
}
```

### 健康检查

```
GET /health
```

响应:
```json
{
  "status": "ok",
  "timestamp": "2023-01-01T12:00:00Z"
}
```

## 前端轮询示例

```javascript
async function pollWorkflowStatus(runId, onStatusChange, interval = 5000) {
  let completed = false;
  
  while (!completed) {
    try {
      const response = await fetch(`/api/workflow-status/${runId}`);
      const data = await response.json();
      
      // 回调通知状态变化
      onStatusChange(data);
      
      if (data.status === 'completed') {
        completed = true;
      } else {
        // 等待间隔再次查询
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    } catch (error) {
      console.error('获取工作流状态时出错:', error);
      break;
    }
  }
}
