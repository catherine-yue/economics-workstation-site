// 全站视觉改造：①注入 Stata 注释高亮 JS（注释绿色、命令暖白）②"代码使用指南"callout 升级为绿色 codeguide 色块
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const HL_SCRIPT = `
<script>
/* 代码注释高亮：注释(绿) vs 命令(暖白)，便于一眼区分哪行是解释、哪行能运行 */
(function () {
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function hl() {
    document.querySelectorAll('.code-block pre code').forEach(function (el) {
      var raw = el.textContent;
      var out = raw.split('\\n').map(function (line) {
        if (/^\\s*\\*/.test(line)) return '<span class="cm-l">' + esc(line) + '</span>';
        var ci = line.indexOf('//');
        if (ci >= 0) return esc(line.slice(0, ci)) + '<span class="cm">' + esc(line.slice(ci)) + '</span>';
        var bi = line.indexOf('/*');
        if (bi >= 0) {
          var bj = line.indexOf('*/', bi + 2);
          if (bj >= 0) return esc(line.slice(0, bi)) + '<span class="cm">' + esc(line.slice(bi, bj + 2)) + '</span>' + esc(line.slice(bj + 2));
        }
        return esc(line);
      }).join('\\n');
      el.innerHTML = out;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hl);
  else hl();
})();
</script>
`;

function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (f.endsWith('.html')) out.push(p);
  }
}

const files = [];
walk(ROOT, files);
console.log('HTML 文件数:', files.length);

let injected = 0, guideUpgraded = 0;
for (const f of files) {
  let html = fs.readFileSync(f, 'utf8');
  if (!html.includes('代码注释高亮')) {
    if (html.includes('</body>')) {
      html = html.replace('</body>', HL_SCRIPT + '\n</body>');
    } else {
      html += HL_SCRIPT;
    }
    injected++;
  }
  // "代码使用指南" callout → 绿色 codeguide 色块
  const before = html;
  html = html.replace(
    /<div class="callout info">\s*<div class="callout-title">代码使用指南<\/div>/g,
    '<div class="callout codeguide">\n<div class="callout-title">📖 代码使用指南（绿色块=解释说明；下方深色块=Stata 代码，注释为绿色）</div>'
  );
  if (html !== before) guideUpgraded++;
  fs.writeFileSync(f, html);
}
console.log('注入高亮 JS:', injected, '| 升级代码使用指南色块:', guideUpgraded);
