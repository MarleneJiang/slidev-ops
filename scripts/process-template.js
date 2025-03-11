import fs from 'fs';
import path from 'path';
import lzString from 'lz-string'

/**
 * 生成 Slidev 格式的 slides.md 文件内容
 * @param {Object} options - 配置选项
 * @param {string} options.title - 幻灯片标题
 * @param {string} options.content - 幻灯片内容
 * @param {Object} [options.config] - 其他配置项
 * @returns {string} 生成的 slides.md 文件内容
 */
function generateSlidesMd(options) {
  const {
    title = "Slidev 演示",
    content = "# 欢迎使用 Slidev\n\n这是您的第一张幻灯片",
    config = {}
  } = options;

  // 默认配置
  const defaultConfig = {
    highlighter: "shiki",
    css: "unocss",
    colorSchema: "dark",
    transition: "fade-out",
    mdc: true,
    lang: "zh-CN",
    layout: "intro",
    glowSeed: 4,
    routerMode: "hash"
  };

  // 合并默认配置与用户提供的配置
  const mergedConfig = { ...defaultConfig, ...config };

  // 默认忽略包列表
  const ignorePackages = [
    "@antfu/install-pkg",
    "@clack/prompts",
    "@typescript-eslint/*",
    "eslint-plugin-*",
    "*-eslint-parser",
    "find-up",
    "parse-*",
    "globals",
    "pkg-types",
    "mlly",
    "local-pkg",
    "yargs",
    "fast-glob",
    "debug",
    "globby",
    "estraverse",
    "pathe",
    "acorn",
    "acorn-*",
    "pico*",
    "eslint-visitor-keys"
  ];

  // 构建YAML前置元数据
  let yamlFrontMatter = '---\n';

  // 添加基本配置
  Object.entries(mergedConfig).forEach(([key, value]) => {
    if (key === 'title') {
      yamlFrontMatter += `${key}: "${value}"\n`;
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      yamlFrontMatter += `${key}: ${value}\n`;
    } else {
      yamlFrontMatter += `${key}: "${value}"\n`;
    }
  });

  // 特别处理标题（如果有占位符）
  yamlFrontMatter = yamlFrontMatter.replace('"{{title}}"', '"' + title + '"');

  // 添加忽略包列表
  yamlFrontMatter += 'monacoTypesIgnorePackages:\n';
  ignorePackages.forEach(pkg => {
    yamlFrontMatter += `  - "${pkg}"\n`;
  });

  yamlFrontMatter += '---\n\n';

  // 组合最终的文件内容
  return yamlFrontMatter + content;
}
/**
 * 处理slides.md模板，将{{xxx}}替换为输入参数的值
 */
function processTemplate() {
  try {
    // 获取环境变量
    const environment = process.env.ENVIRONMENT || 'dev';
    const version = process.env.VERSION || 'latest';
    const author = process.env.AUTHOR || 'slidev-parser';
    const requestId = process.env.REQUEST_ID || '';
    const title = process.env.TITLE || '演示文稿';
    const args = JSON.parse(lzString.decompressFromEncodedURIComponent(process.env.ARGS || '') || '{}');
    const contentString = lzString.decompressFromEncodedURIComponent(process.env.CONTENT || '') || `# ${title}\n\n演示文稿内容\n\n环境: ${environment}\n版本: ${version}`;

    console.log(`处理模板: 环境=${environment}, 版本=${version}, 请求ID=${requestId}, 作者=${author}`, contentString);

    // 读取模板文件
    const templatePath = path.resolve(process.cwd(), 'slides.md');

    const slidesContent = generateSlidesMd({
      title: title,
      content: contentString,
      config: args
    })


    // 写回文件
    fs.writeFileSync(templatePath, slidesContent, 'utf-8');
    console.log('模板处理完成', slidesContent);
  } catch (error) {
    console.error('处理模板时出错:', error);
  }
}

// 执行处理
processTemplate();
