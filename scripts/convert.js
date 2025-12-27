const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const TurndownService = require('turndown');

const rootDir = process.cwd();
const docsDir = path.join(rootDir, 'docs');

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const chapterTitles = {
  1: '基础知识',
  2: '分治策略',
  3: '动态规划',
  4: '贪心法',
  5: '回溯与分支界限'
};

function chineseToNumber(chStr) {
  // 支持到“二十”，覆盖常见的章节与题号
  const map = { '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  if (!chStr) return 0;
  if (chStr === '十') return 10;
  if (chStr.includes('十')) {
    const [ten, unit] = chStr.split('十');
    const tens = ten ? map[ten] : 1;
    const units = unit ? map[unit] : 0;
    return tens * 10 + units;
  }
  return map[chStr] ?? 0;
}

function parseFilename(file) {
  // 形如："第一章 第一题.docx"
  const base = file.replace(/\.docx$/i, '');
  const parts = base.split(/\s+/);
  let chapter = parts[0] || '未分章';
  let problem = parts[1] || base;
  // 解析数字用于排序
  const chapterMatch = chapter.match(/^第(.+?)章$/);
  const problemMatch = problem.match(/^第(.+?)题$/);
  const chapterNum = chapterMatch ? chineseToNumber(chapterMatch[1]) : 0;
  const problemNum = problemMatch ? chineseToNumber(problemMatch[1]) : 0;

  if (chapterTitles[chapterNum]) {
    chapter = `${chapter}：${chapterTitles[chapterNum]}`;
  }

  return { chapter, problem, chapterNum, problemNum };
}

async function convertDocxToMd(srcPath) {
  const result = await mammoth.convertToHtml({ path: srcPath });
  const html = result.value || '';
  const md = turndown.turndown(html);
  return md.trim();
}

function writeFileSafe(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function sortChapters(chapters) {
  return Array.from(chapters.values()).sort((a, b) => a.chapterNum - b.chapterNum);
}

function sortProblems(problems) {
  return problems.sort((a, b) => a.problemNum - b.problemNum);
}

async function main() {
  ensureDir(docsDir);

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const docxFiles = entries
    .filter((e) => e.isFile() && /\.docx$/i.test(e.name))
    .map((e) => e.name);

  const chapters = new Map(); // key: chapterName, value: { chapterName, chapterNum, problems: [{ name, num }] }

  for (const file of docxFiles) {
    const { chapter, problem, chapterNum, problemNum } = parseFilename(file);
    const srcPath = path.join(rootDir, file);
    const md = await convertDocxToMd(srcPath);

    const chapterDir = path.join(docsDir, chapter);
    ensureDir(chapterDir);

    const targetMdPath = path.join(chapterDir, `${problem}.md`);
    writeFileSafe(targetMdPath, `# ${chapter} · ${problem}\n\n${md}\n`);

    if (!chapters.has(chapter)) {
      chapters.set(chapter, { chapterName: chapter, chapterNum, problems: [] });
    }
    chapters.get(chapter).problems.push({ name: problem, problemNum });
  }

  // 生成 docs/README.md
  const chapterList = sortChapters(chapters)
    .map((c) => `- [${c.chapterName}](/${encodeURI(c.chapterName)}/README.md)`)
    .join('\n');
  const readme = `# 算法分析复习\n\n> 本站点由 Docx 自动转换生成，左侧为章节导航。\n\n## 章节\n\n${chapterList || '- 暂无内容'}\n`;
  writeFileSafe(path.join(docsDir, 'README.md'), readme);

  // 生成每章 README 以及侧边栏 _sidebar.md
  let sidebar = `- [总览](/README.md)\n`;
  for (const c of sortChapters(chapters)) {
    sidebar += `- ${c.chapterName}\n`;
    const problems = sortProblems(c.problems);
    const chapterIndex = problems
      .map((p) => `- [${p.name}](/${encodeURI(c.chapterName)}/${encodeURI(p.name)}.md)`) 
      .join('\n');
    const chapterReadme = `# ${c.chapterName}\n\n${chapterIndex || '- 暂无题目'}\n`;
    writeFileSafe(path.join(docsDir, c.chapterName, 'README.md'), chapterReadme);

    for (const p of problems) {
      sidebar += `  - [${p.name}](/${encodeURI(c.chapterName)}/${encodeURI(p.name)}.md)\n`;
    }
  }

  writeFileSafe(path.join(docsDir, '_sidebar.md'), sidebar);

  if (docxFiles.length === 0) {
    console.log('未找到 .docx 文件，请将题目文件放在项目根目录。');
  } else {
    console.log(`已转换 ${docxFiles.length} 个文件，内容位于 docs/ 目录。`);
  }
}

main().catch((err) => {
  console.error('转换过程中出现错误:', err);
  process.exit(1);
});