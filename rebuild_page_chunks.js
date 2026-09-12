// 重建指定页面的 chunks：从 HTML 正文提取（h2/h3 章节 + 文字 + 代码块），替换 8 份中该页旧 chunks
const fs = require('fs');
const path = require('path');

const PAGE_ID = process.argv[2] || 'empirical-23-significance-techniques';
const HTML_FILE = process.argv[3] || 'empirical/23-significance-techniques.html';

// ---------- 1. 读取 site-index 元数据 ----------
let siteIndex = null;
try {
  siteIndex = JSON.parse(fs.readFileSync('../deploy/unpacked/RAG语料/site-index.json', 'utf8'));
} catch (e) { siteIndex = null; }
const meta = siteIndex && siteIndex.pages ? siteIndex.pages.find(p => p.page_id === PAGE_ID) : null;

// ---------- 2. 读取 HTML 并抽取正文 ----------
const html = fs.readFileSync(HTML_FILE, 'utf8');
// 抽取 <main> 区域（若存在），否则取 <body>
const mainMatch = html.match(/<main[\s\S]*?<\/main>/i);
const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/i);
const mainHtml = mainMatch ? mainMatch[0] : (bodyMatch ? bodyMatch[1] : html);

// 去掉 script/style
const clean = mainHtml.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');

// 把 pre/code 代码块替换为占位符（先保护代码）
const codeBlocks = [];
const withPlaceholders = clean.replace(/<div class="code-block">[\s\S]*?<pre><code>([\s\S]*?)<\/code><\/pre>[\s\S]*?<\/div>/g, (m, code) => {
  const idx = codeBlocks.length;
  // 解 HTML 实体并去标签
  const plain = code
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '');
  codeBlocks.push(plain.trim());
  return `\n@@CODEBLOCK_${idx}@@\n`;
});

// 抽取标题元数据（从 head 的 title）
const titleMatch = html.match(/<title>([^<]*)<\/title>/);
const pageTitle = titleMatch ? titleMatch[1].replace(/\|.*$/, '').trim() : (meta ? meta.title : PAGE_ID);

// ---------- 3. 按 h2/h3 切分 ----------
// 把 withPlaceholders 按 <h2 / <h3 分割
const secs = withPlaceholders.split(/(?=<h[23][ >])/).filter(s => s.trim());

const chunks = [];
let currentH2 = '';
let currentH3 = '';
let secCount = 0;

function htmlToText(s) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

for (const sec of secs) {
  const h2m = sec.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const h3m = sec.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
  if (h2m) {
    currentH2 = htmlToText(h2m[1]).replace(/^\d+\s*/, '').trim();
    currentH3 = '';
    // 章节自身的文字（h2 后、下一个 h3 前的内容）
    const rest = sec.replace(/<h2[\s\S]*?<\/h2>/i, '');
    const text = htmlToText(rest.replace(/@@CODEBLOCK_\d+@@/g, ''));
    if (text.length > 30) {
      chunks.push({ content: text });
      secCount++;
    }
    continue;
  }
  if (h3m) {
    currentH3 = htmlToText(h3m[1]).replace(/<[^>]+>/g, '').trim();
    const rest = sec.replace(/<h3[\s\S]*?<\/h3>/i, '');
    // 文本部分（去掉代码占位）
    const text = htmlToText(rest.replace(/@@CODEBLOCK_\d+@@/g, ''));
    // 代码部分
    const codeIdx = [];
    let m;
    const codeRe = /@@CODEBLOCK_(\d+)@@/g;
    while ((m = codeRe.exec(rest)) !== null) codeIdx.push(parseInt(m[1]));
    if (text.length > 20) {
      chunks.push({ content: text });
      secCount++;
    }
    for (const ci of codeIdx) {
      chunks.push({ content: '', code: codeBlocks[ci] });
      secCount++;
    }
    continue;
  }
  // 无标题的内容（引言前的 TOC 等）忽略
}

// ---------- 4. 组装正式 chunk ----------
const finalChunks = chunks.map((c, i) => ({
  page_id: PAGE_ID,
  page_title: pageTitle,
  domain: meta ? meta.domain : '实证论文',
  group: meta ? meta.group : '',
  number: meta ? meta.number : '',
  section: '章节片段' + (i + 1),
  content: c.content || '',
  code: c.code || '',
}));

// ---------- 5. 替换 8 份中的旧 chunks ----------
const dir = path.dirname(HTML_FILE);
const apiDir = path.join(path.dirname(dir), 'api');
let all = [];
for (let p = 0; p < 8; p++) {
  const d = JSON.parse(fs.readFileSync(path.join(apiDir, 'chunks_' + p + '.json'), 'utf8'));
  all.push(...d.chunks);
}
const before = all.length;
all = all.filter(c => c.page_id !== PAGE_ID);
const removed = before - all.length;
all = all.concat(finalChunks);
console.log('旧 chunks 移除:', removed, '| 新增:', finalChunks.length, '| 总数:', before, '->', all.length);

// 重新平均拆 8 份
const PARTS = 8;
const per = Math.ceil(all.length / PARTS);
for (let p = 0; p < PARTS; p++) {
  const part = all.slice(p * per, (p + 1) * per);
  fs.writeFileSync(path.join(apiDir, 'chunks_' + p + '.json'), JSON.stringify({ chunks: part }));
  console.log('chunks_' + p + '.json:', part.length, 'chunks,', (fs.statSync(path.join(apiDir, 'chunks_' + p + '.json')).size / 1024).toFixed(0) + 'KB');
}
console.log('完成。该页样例:');
finalChunks.slice(0, 3).forEach(c => console.log(' -', (c.content || c.code || '').slice(0, 60).replace(/\n/g, ' ')));
