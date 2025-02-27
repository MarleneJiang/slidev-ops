import fs from 'fs';
import path from 'path';
import lzString from 'lz-string'
/**
 * 处理slides.md模板，将{{xxx}}替换为输入参数的值
 */
function processTemplate() {
  // 获取环境变量
  const environment = process.env.ENVIRONMENT || 'dev';
  const version = process.env.VERSION || 'latest';
  const requestId = process.env.REQUEST_ID || '';
  const title = process.env.TITLE || '演示文稿';
  const contentString = lzString.decompressFromEncodedURIComponent(process.env.CONTENT || '') || `# ${title}\n\n演示文稿内容\n\n环境: ${environment}\n版本: ${version}`;
  
  console.log(`处理模板: 环境=${environment}, 版本=${version}, 请求ID=${requestId}`, contentString);
  
  // 读取模板文件
  const templatePath = path.resolve(process.cwd(), 'slides.md');
  let content = fs.readFileSync(templatePath, 'utf-8');
  
  // 创建替换变量
  const replacements = {
    title: title,
    content: contentString,
  };
  
  // 执行替换
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  
  // 写回文件
  fs.writeFileSync(templatePath, content, 'utf-8');
  console.log('模板处理完成');
}

// 执行处理
processTemplate();
