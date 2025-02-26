require('dotenv').config();
const express = require('express');
const { Octokit } = require('@octokit/rest');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

// 中间件配置
app.use(bodyParser.json());

// 初始化 GitHub API 客户端
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

// 存储工作流状态的内存对象
const workflowStatus = {};

// 触发工作流的API端点
app.post('/api/trigger-workflow', async (req, res) => {
  try {
    const { ref = 'main', inputs } = req.body;
    
    if (!inputs) {
      return res.status(400).json({ error: '缺少必要的参数' });
    }

    console.log('触发工作流，参数:', inputs);

    // 触发 workflow
    await octokit.actions.createWorkflowDispatch({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      workflow_id: 'build-and-deploy.yml', // 你的工作流文件名
      ref, // 分支名
      inputs // 传递给工作流的参数
    });
    
    // 等待几秒，确保工作流已经开始运行
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 获取最近的工作流运行记录
    const workflowRuns = await octokit.actions.listWorkflowRuns({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      workflow_id: 'build-and-deploy.yml'
    });
    
    // 获取最新的运行记录
    const latestRun = workflowRuns.data.workflow_runs[0];
    
    // 初始化状态记录
    workflowStatus[latestRun.id] = {
      id: latestRun.id,
      status: latestRun.status,
      conclusion: latestRun.conclusion,
      started_at: latestRun.created_at,
      updated_at: new Date().toISOString(),
      html_url: latestRun.html_url,
      logs: [{
        time: new Date().toISOString(),
        message: '工作流已触发'
      }]
    };
    
    // 开始轮询工作流状态
    pollWorkflowStatus(latestRun.id);
    
    res.status(200).json({ 
      message: '工作流已成功触发',
      run_id: latestRun.id,
      status_url: `/api/workflow-status/${latestRun.id}`
    });
    
  } catch (error) {
    console.error('触发工作流时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取工作流状态的API端点
app.get('/api/workflow-status/:runId', (req, res) => {
  const { runId } = req.params;
  
  if (!workflowStatus[runId]) {
    return res.status(404).json({ error: '未找到该工作流的状态信息' });
  }
  
  res.status(200).json(workflowStatus[runId]);
});

// 轮询工作流状态的函数
async function pollWorkflowStatus(runId, interval = 10000) {
  let completed = false;
  
  while (!completed) {
    try {
      const { data } = await octokit.actions.getWorkflowRun({
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_REPO,
        run_id: runId
      });
      
      // 更新状态信息
      workflowStatus[runId] = {
        ...workflowStatus[runId],
        status: data.status,
        conclusion: data.conclusion,
        updated_at: new Date().toISOString()
      };
      
      // 添加日志
      workflowStatus[runId].logs.push({
        time: new Date().toISOString(),
        message: `状态: ${data.status}, 结果: ${data.conclusion || '进行中'}`
      });
      
      console.log(`工作流 ${runId} 状态: ${data.status}, 结果: ${data.conclusion || '进行中'}`);
      
      // 检查是否完成
      if (data.status === 'completed') {
        completed = true;
        console.log(`工作流 ${runId} 已完成，结果: ${data.conclusion}`);
        workflowStatus[runId].logs.push({
          time: new Date().toISOString(),
          message: `工作流已完成，最终结果: ${data.conclusion}`
        });
      } else {
        // 等待一段时间后再次检查
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    } catch (error) {
      console.error(`轮询工作流 ${runId} 状态时出错:`, error);
      
      // 添加错误日志
      if (workflowStatus[runId]) {
        workflowStatus[runId].logs.push({
          time: new Date().toISOString(),
          message: `轮询出错: ${error.message}`,
          error: true
        });
      }
      
      break;
    }
  }
}

// 健康检查API端点
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 启动服务器
app.listen(port, () => {
  console.log(`服务已启动，监听端口 ${port}`);
});
