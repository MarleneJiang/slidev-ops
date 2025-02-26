import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';  // 需要安装: npm install uuid

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
    const { ref = 'main', inputs = {} } = req.body;
    
    // 生成一个唯一标识符并添加到输入参数中
    const requestId = uuidv4();
    const enrichedInputs = {
      ...inputs,
      request_id: requestId  // 添加请求ID到工作流输入参数
    };
    
    console.log(`触发工作流，请求ID: ${requestId}, 参数:`, enrichedInputs);

    // 触发 workflow
    await octokit.actions.createWorkflowDispatch({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      workflow_id: 'build-and-deploy.yml',
      ref,
      inputs: enrichedInputs
    });
    
    // 轮询查找包含该UUID的工作流，设置总超时为3秒
    const workflowRun = await findWorkflowRunByRequestId(requestId, 10, 300, 3000);
    
    // 如果找不到对应的工作流，获取最近的一个作为备选
    if (!workflowRun) {
      console.log(`没有找到请求ID为 ${requestId} 的工作流，获取最新运行记录`);
      const { data } = await octokit.actions.listWorkflowRuns({
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_REPO,
        workflow_id: 'build-and-deploy.yml'
      });
      
      const latestRun = data.workflow_runs[0];
      
      res.status(200).json({ 
        message: '工作流已触发，但未能精确定位运行记录',
        run_id: latestRun.id,
        status_url: `/api/workflow-status/${latestRun.id}`,
        html_url: latestRun.html_url,
        request_id: requestId
      });
    } else {
      res.status(200).json({ 
        message: '工作流已成功触发',
        run_id: workflowRun.id,
        status_url: `/api/workflow-status/${workflowRun.id}`,
        html_url: workflowRun.html_url,
        request_id: requestId
      });
    }
    
  } catch (error) {
    console.error('触发工作流时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 使用 Promise.race 实现总体超时的查找工作流运行记录
async function findWorkflowRunByRequestId(requestId, maxAttempts = 10, interval = 300, totalTimeout = 3000) {
  console.log(`开始查找请求ID为 ${requestId} 的工作流，总超时: ${totalTimeout}ms...`);
  
  // 设置一个超时 Promise
  const timeoutPromise = new Promise(resolve => {
    setTimeout(() => {
      console.log(`查找工作流超时 (${totalTimeout}ms)`);
      resolve(false);
    }, totalTimeout);
  });
  
  // 设置查找工作流的 Promise
  const findPromise = (async () => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        console.log(`尝试 ${attempt + 1}/${maxAttempts} 查找工作流...`);
        
        // 获取最近的工作流运行记录
        const { data } = await octokit.actions.listWorkflowRuns({
          owner: process.env.GITHUB_OWNER,
          repo: process.env.GITHUB_REPO,
          workflow_id: 'build-and-deploy.yml',
          per_page: 5  // 只检查最近的几条记录
        });
        
        // 遍历运行记录
        for (const run of data.workflow_runs) {
          try {
            // 获取工作流运行的详细信息，包括输入参数
            const runDetail = await octokit.actions.getWorkflowRun({
              owner: process.env.GITHUB_OWNER,
              repo: process.env.GITHUB_REPO,
              run_id: run.id
            });
            
            // 检查是否包含我们的请求ID
            if (runDetail.data.event === 'workflow_dispatch' && 
                runDetail.data.inputs && 
                runDetail.data.inputs.request_id === requestId) {
              console.log(`找到匹配的工作流运行记录，ID: ${run.id}, 尝试次数: ${attempt + 1}`);
              return run;
            }
          } catch (error) {
            console.error(`获取工作流 ${run.id} 详情时出错:`, error);
          }
        }
        
        // 如果没找到，等待一段时间后再试
        await new Promise(resolve => setTimeout(resolve, interval));
      } catch (error) {
        console.error(`查找工作流时出错 (尝试 ${attempt + 1}/${maxAttempts}):`, error);
      }
    }
    
    // 如果达到最大尝试次数仍未找到，返回 false
    console.log(`在 ${maxAttempts} 次尝试后未找到请求ID为 ${requestId} 的工作流，返回false`);
    return false;
  })();
  
  // 使用 Promise.race 实现总体超时，竞争哪个先完成
  return Promise.race([findPromise, timeoutPromise]);
}

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
