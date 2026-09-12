// 构建时静态高亮：直接把每个 pre code 里的注释包成 <span class="cm/cm-l">，不依赖 JS
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function dec(s) {
  return s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function hlText(raw) {
  return raw.split('\n').map(function (line) {
    if (/^\s*\*/.test(line)) return '<span class="cm-l">' + esc(line) + '</span>';
    var ci = line.indexOf('//');
    if (ci >= 0) return esc(line.slice(0, ci)) + '<span class="cm">' + esc(line.slice(ci)) + '</span>';
    var bi = line.indexOf('/*');
    if (bi >= 0) {
      var bj = line.indexOf('*/', bi + 2);
      if (bj >= 0) return esc(line.slice(0, bi)) + '<span class="cm">' + esc(line.slice(bi, bj + 2)) + '</span>' + esc(line.slice(bj + 2));
    }
    return esc(line);
  }).join('\n');
}

function walk(d, out) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith('.html')) out.push(p);
  }
}

const files = [];
walk(ROOT, files);
let done = 0, skipped = 0;
for (const f of files) {
  let html = fs.readFileSync(f, 'utf8');
  const newHtml = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (m, inner) => {
    if (inner.includes('<span')) return m; // 已包 span，幂等跳过
    const raw = dec(inner);
    return '<pre><code>' + hlText(raw) + '</code></pre>';
  });
  if (newHtml !== html) {
    fs.writeFileSync(f, newHtml);
    done++;
  } else {
    skipped++;
  }
}
console.log('静态高亮完成:', done, '页 | 跳过:', skipped, '页');
