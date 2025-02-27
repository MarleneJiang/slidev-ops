import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
// uuid
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// 中间件配置
app.use(bodyParser.json());

// 初始化 GitHub API 客户端
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

// 触发工作流的API端点
app.post('/api/trigger-workflow', async (req, res) => {
  try {
    const { ref = 'main', inputs={} } = req.body;
    
    if (!inputs || Object.keys(inputs).length === 0) {
      return res.status(400).json({ error: '缺少必要的参数' });
    }

    console.log('触发工作流，参数:', inputs);

    const requestId = uuidv4();
    console.log(`请求ID: ${requestId}`);

    // 触发 workflow
    await octokit.actions.createWorkflowDispatch({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      workflow_id: 'build-and-deploy.yml', // 你的工作流文件名
      ref, // 分支名
      inputs:{
        ...inputs,
        request_id: requestId // 传递给工作流的参数
      } // 传递给工作流的参数
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
    
    res.status(200).json({ 
      message: '工作流已成功触发',
      run_id: latestRun.id,
      status_url: `/api/workflow-status/${latestRun.id}`,
      html_url: latestRun.html_url
    });
    
  } catch (error) {
    console.error('触发工作流时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取工作流状态的API端点 - 直接查询GitHub API而不存储状态
app.get('/api/workflow-status/:runId', async (req, res) => {
  try {
    const { runId } = req.params;
    
    const { data } = await octokit.actions.getWorkflowRun({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      run_id: runId
    });
    
    res.status(200).json({
      id: data.id,
      status: data.status,
      conclusion: data.conclusion,
      started_at: data.created_at,
      updated_at: data.updated_at,
      html_url: data.html_url
    });
    
  } catch (error) {
    console.error(`获取工作流 ${req.params.runId} 状态时出错:`, error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 获取最近工作流运行记录的API端点
app.get('/api/workflow-runs', async (req, res) => {
  try {
    const { page = 1, per_page = 10 } = req.query;
    
    const workflowRuns = await octokit.actions.listWorkflowRuns({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      workflow_id: 'build-and-deploy.yml',
      page: parseInt(page),
      per_page: parseInt(per_page)
    });
    
    res.status(200).json({
      total_count: workflowRuns.data.total_count,
      runs: workflowRuns.data.workflow_runs.map(run => ({
        id: run.id,
        status: run.status,
        conclusion: run.conclusion,
        started_at: run.created_at,
        updated_at: run.updated_at,
        html_url: run.html_url,
        environment: run.display_title
      }))
    });
    
  } catch (error) {
    console.error('获取工作流运行记录时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 健康检查API端点
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 启动服务器
app.listen(port, () => {
  console.log(`服务已启动，监听端口 ${port}`);
});
