/**
 * fix_pagination.js — 按新侧边栏顺序重生成 empirical 板块全部页面的 上一节/下一节 翻页链
 * 同时顺带修复历史遗留的乱链（如 15 页 prev 指向 11）。
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

/* 新实证顺序（29 个方法页，按侧边栏显示顺序） */
const ORDER = [
  '15-potential-outcomes-dag.html',
  '27-ejd-method-map.html',
  '01-data-cleaning.html',
  '02-data-merge.html',
  '03-descriptive-stats.html',
  '14-eda-sample-construction.html',
  '04-baseline-regression.html',
  '05-endogeneity-iv.html',
  '06-did.html',
  '07-rdd.html',
  '24-synthetic-control.html',
  '25-dynamic-panel-gmm.html',
  '26-spatial-econometrics.html',
  '28-bunching-kink.html',
  '16-dml.html',
  '08-robustness.html',
  '09-mechanism.html',
  '10-heterogeneity.html',
  '17-causal-forest.html',
  '29-nonparametric-semiparametric.html',
  '30-bayesian-empirical.html',
  '23-significance-techniques.html',
  '18-big-data-forecasting.html',
  '19-nowcasting-dfm.html',
  '20-quantile-gar.html',
  '21-text-analysis.html',
  '22-tvp-var.html',
  '12-replication-workflow.html',
];

const INDEX = 'index.html';

/** 从目标页提取标题（用于翻页按钮显示名） */
const titleCache = {};
function pageTitle(file) {
  if (titleCache[file]) return titleCache[file];
  let t = file.replace('.html', '').replace(/-/g, ' ');
  try {
    const html = fs.readFileSync(path.join(ROOT, 'empirical', file), 'utf8');
    const m = html.match(/<title>([^<|]+)/);
    if (m) t = m[1].trim();
  } catch (e) { /* 首页等特殊页 */ }
  titleCache[file] = t;
  return t;
}

let fixed = 0;
for (let i = 0; i < ORDER.length; i++) {
  const cur = ORDER[i];
  const prev = i === 0 ? INDEX : ORDER[i - 1];
  const next = i === ORDER.length - 1 ? INDEX : ORDER[i + 1];
  const fp = path.join(ROOT, 'empirical', cur);
  let html = fs.readFileSync(fp, 'utf8');

  const prevHtml = `<a href="${prev}" class="prev">\n        <div class="nav-label">上一节 ←</div>\n        <div class="nav-title">${pageTitle(prev)}</div>\n      </a>`;
  const nextHtml = `<a href="${next}" class="next">\n        <div class="nav-label">下一节 →</div>\n        <div class="nav-title">${pageTitle(next)}</div>\n      </a>`;

  // 替换 prev 块
  const prevRe = /<a href="[^"]*" class="prev">[\s\S]*?<\/a>/;
  const nextRe = /<a href="[^"]*" class="next">[\s\S]*?<\/a>/;
  let changed = false;
  if (prevRe.test(html)) { html = html.replace(prevRe, prevHtml); changed = true; }
  if (nextRe.test(html)) { html = html.replace(nextRe, nextHtml); changed = true; }
  if (changed) { fs.writeFileSync(fp, html); fixed++; }
}
console.log('翻页链重生成:', fixed, '页');
