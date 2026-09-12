/**
 * build_sidebar.js — 全站侧边栏重建
 * 新设计：
 *  1. 四大板块（实证/DSGE/结构估计/QSGE）各用独立色条板块头，<details> 原生折叠
 *  2. 每个板块内按学习路线连续编号（01-N），分组标题带序号徽章
 *  3. 当前页对应条目高亮，且当前页所在板块默认展开，其余折叠
 *  4. 顶部快捷入口：首页 + AI助手
 * 用法：node build_sidebar.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

/* ---------------- 导航数据 ---------------- */
const BLOCKS = [
  {
    id: 'emp', badge: 'EMP', label: '实证论文', sub: '实证 · 28页',
    color: '#d9a25f', dir: 'empirical', index: 'index.html', indexName: '实证总览与路线',
    stages: [
      { stage: '① 研究设计与识别策略', items: [
        { f: '15-potential-outcomes-dag.html', name: '潜在结果与因果图' },
        { f: '27-ejd-method-map.html', name: '顶刊方法地图与复现' },
      ]},
      { stage: '② 数据准备与描述', items: [
        { f: '01-data-cleaning.html', name: '数据清洗' },
        { f: '02-data-merge.html', name: '数据合并与面板' },
        { f: '03-descriptive-stats.html', name: '描述性统计' },
        { f: '14-eda-sample-construction.html', name: 'EDA与样本构造' },
      ]},
      { stage: '③ 基准回归与因果识别', items: [
        { f: '04-baseline-regression.html', name: '基准回归' },
        { f: '05-endogeneity-iv.html', name: '内生性与IV' },
        { f: '06-did.html', name: 'DID双重差分' },
        { f: '07-rdd.html', name: 'RDD断点回归' },
        { f: '24-synthetic-control.html', name: '合成控制法 SCM' },
        { f: '25-dynamic-panel-gmm.html', name: '动态面板 GMM' },
        { f: '26-spatial-econometrics.html', name: '空间计量入门' },
        { f: '28-bunching-kink.html', name: 'Bunching/Kink聚束' },
        { f: '16-dml.html', name: 'DML去偏机器学习', adv: true },
      ]},
      { stage: '④ 诊断稳健与机制异质', items: [
        { f: '08-robustness.html', name: '稳健性检验' },
        { f: '09-mechanism.html', name: '机制检验' },
        { f: '10-heterogeneity.html', name: '异质性分析' },
        { f: '17-causal-forest.html', name: '因果森林与政策学习', adv: true },
        { f: '29-nonparametric-semiparametric.html', name: '非参/半参方法', adv: true },
        { f: '30-bayesian-empirical.html', name: '贝叶斯实证推断', adv: true },
        { f: '23-significance-techniques.html', name: '显著性手法库与规范判别' },
      ]},
      { stage: '⑤ 预测与前沿应用', items: [
        { f: '18-big-data-forecasting.html', name: '大数据宏观预测' },
        { f: '19-nowcasting-dfm.html', name: '即时预测与DFM' },
        { f: '20-quantile-gar.html', name: '分位数回归与GaR' },
        { f: '21-text-analysis.html', name: '文本分析与叙事冲击' },
        { f: '22-tvp-var.html', name: 'TVP-VAR与风险溯源' },
      ]},
      { stage: '⑥ 论文工程', items: [
        { f: '12-replication-workflow.html', name: '论文复现流程' },
      ]},
    ],
  },
  {
    id: 'dsge', badge: 'DSGE', label: 'DSGE 模型', sub: '宏观建模 · 21页',
    color: '#6fa8dc', dir: 'dsge', index: 'index.html', indexName: 'DSGE总览与路线',
    stages: [
      { stage: '模型分支 Branches', items: [
        { f: '09-rbc-model.html', name: 'RBC基准模型' },
        { f: '10-nk-three-equation.html', name: 'NK三方程模型' },
        { f: '11-medium-scale-sw.html', name: '中尺度模型(SW)' },
        { f: '12-small-open-economy.html', name: '小国开放经济' },
        { f: '07-financial-frictions.html', name: '金融摩擦(BGG/GK)' },
        { f: '13-fiscal-monetary-rules.html', name: '财政与货币政策规则' },
        { f: '14-tank.html', name: 'TANK两主体模型' },
        { f: '21-hank.html', name: 'HANK异质性主体' },
        { f: '17-olg.html', name: 'OLG世代交叠' },
        { f: '18-money-search.html', name: '货币搜寻模型' },
        { f: '19-zlb-occasionally-binding.html', name: 'ZLB偶发约束(OccBin)' },
        { f: '20-multi-sector-dsge.html', name: '多部门IO-DSGE' },
        { f: '16-adaptive-learning.html', name: '适应性学习与行为预期' },
      ]},
      { stage: '求解与估计方法 Methods', items: [
        { f: '01-model-building.html', name: '模型构建' },
        { f: '02-first-order-conditions.html', name: '一阶条件推导' },
        { f: '03-steady-state.html', name: '稳态求解' },
        { f: '04-log-linearization.html', name: '对数线性化' },
        { f: '15-perturbation-methods.html', name: '扰动法(一阶/二阶)' },
        { f: '05-dynare-solving.html', name: 'Dynare实操' },
        { f: '06-bayesian-estimation.html', name: '贝叶斯估计' },
        { f: '08-irf-simulation.html', name: 'IRF与模拟' },
      ]},
    ],
  },
  {
    id: 'structural', badge: 'STR', label: '结构估计', sub: '微观结构 · 22页',
    color: '#7fc97f', dir: 'structural', index: 'index.html', indexName: '结构估计总览',
    stages: [
      { stage: '模型分支 Branches', items: [
        { f: '03-discrete-choice.html', name: '离散选择总览' },
        { f: '07-binary-choice.html', name: '二值选择(Logit/Probit)' },
        { f: '08-multinomial-ordered.html', name: '多项与有序选择' },
        { f: '09-mixed-logit.html', name: '混合Logit' },
        { f: '04-blp.html', name: 'BLP随机系数模型' },
        { f: '05-dynamic-structural.html', name: '动态结构模型总览' },
        { f: '10-production-function.html', name: '生产函数估计(OP/LP/ACF)' },
        { f: '11-auctions.html', name: '拍卖模型' },
        { f: '12-search-matching.html', name: '搜索与匹配模型' },
        { f: '15-dynamic-games.html', name: '动态博弈/产业动态' },
        { f: '16-education-human-capital.html', name: '教育/人力资本' },
        { f: '18-lifecycle-consumption-savings.html', name: '生命周期消费储蓄' },
        { f: '19-market-structure-entry.html', name: '市场结构与进入退出' },
        { f: '20-housing-location-choice.html', name: '住房与区位选择' },
        { f: '21-insurance-risk-preference.html', name: '保险需求与风险偏好' },
        { f: '22-investment-financing-dynamic.html', name: '投资融资动态结构' },
      ]},
      { stage: '估计方法 Methods', items: [
        { f: '01-mle.html', name: '极大似然估计 MLE' },
        { f: '02-gmm.html', name: '广义矩估计 GMM' },
        { f: '06-counterfactual.html', name: '反事实分析' },
        { f: '13-nonlinear-gmm-smm.html', name: '非线性GMM/SMM' },
        { f: '14-mpec.html', name: 'MPEC方法' },
        { f: '17-ai-structural-estimation.html', name: 'AI驱动结构估计' },
      ]},
    ],
  },
  {
    id: 'qsge', badge: 'QSGE', label: 'QSGE 空间一般均衡', sub: '量化空间 · 17页',
    color: '#b39ddb', dir: 'qsge', index: 'index.html', indexName: 'QSGE总览与路线',
    stages: [
      { stage: '模型分支 Branches', items: [
        { f: '01-armington.html', name: 'Armington模型' },
        { f: '02-eaton-kortum.html', name: 'Eaton-Kortum模型' },
        { f: '03-gravity.html', name: '结构引力与PPML' },
        { f: '08-melitz-model.html', name: 'Melitz异质企业模型' },
        { f: '06-rrh-spatial.html', name: 'RRH空间一般均衡' },
        { f: '07-trade-migration-land.html', name: '贸易+迁移+土地' },
        { f: '09-dynamic-spatial.html', name: '动态空间一般均衡' },
        { f: '11-gvc-value-added.html', name: 'GVC增加值贸易' },
        { f: '12-caliendo-parro-multisector.html', name: '多部门EK量化贸易' },
        { f: '13-ahlfeldt-city-commute.html', name: '城市通勤空间均衡' },
        { f: '14-allen-arkolakis-unified.html', name: '空间经济统一框架' },
        { f: '15-alonso-muth-mills.html', name: '单中心城市土地利用' },
        { f: '16-quantitative-heckscher-ohlin.html', name: '定量HOV要素禀赋' },
        { f: '17-monte-redding-rh.html', name: '通勤贸易一体化' },
      ]},
      { stage: '估计与反事实方法 Methods', items: [
        { f: '04-welfare-decomposition.html', name: '福利分解(ACR)' },
        { f: '05-counterfactual-solving.html', name: '帽代数反事实' },
        { f: '10-trade-cost-estimation.html', name: '贸易成本结构估计' },
      ]},
    ],
  },
];

/* 编号：板块内连续编号，从 1 开始 */
(function numberBlocks() {
  for (const blk of BLOCKS) {
    let n = 0;
    for (const st of blk.stages) {
      for (const it of st.items) {
        n += 1;
        it.num = String(n).padStart(2, '0');
      }
    }
  }
})();

/* ---------------- 路径工具 ---------------- */
/** 计算从 fromDir（HTML所在目录，'.' 或 'empirical' 等）到 target 的相对路径 */
function relPath(fromDir, target) {
  // target 形如 'empirical/01-data-cleaning.html' 或 'index.html'
  if (fromDir === '.') return target;
  if (target.startsWith(fromDir + '/')) return target.slice(fromDir.length + 1);
  return '../' + target;
}

/* ---------------- 生成侧边栏 HTML ---------------- */
function buildSidebar(currentFile) {
  // currentFile: 相对 ROOT 的路径，如 'empirical/01-data-cleaning.html' / 'index.html'
  const curDir = path.dirname(currentFile); // '.' 或 'empirical'
  const curBase = path.basename(currentFile); // '01-data-cleaning.html'

  // 当前页属于哪个板块（文件名匹配）
  let activeBlock = null;
  for (const blk of BLOCKS) {
    for (const st of blk.stages) {
      for (const it of st.items) {
        if (it.f === curBase) { activeBlock = blk; }
      }
    }
    if (blk.index === curBase && blk.dir === curDir) activeBlock = blk;
  }
  // 根 index.html → 总览页（无板块展开）
  const isRootIndex = (currentFile === 'index.html');

  const lines = [];
  lines.push('<aside class="sidebar" id="sidebar">');
  lines.push('  <div class="sidebar-header">');
  lines.push('    <div class="logo">经济学研究工作站</div>');
  lines.push('    <div class="subtitle">ECON RESEARCH WORKSTATION</div>');
  lines.push('  </div>');
  lines.push('  <nav class="sidebar-nav">');

  // 快捷入口
  lines.push('    <div class="nav-quick">');
  lines.push(`      <a class="quick-btn${currentFile === 'index.html' ? ' active' : ''}" href="${relPath(curDir, 'index.html')}">🏠 首页</a>`);
  lines.push(`      <a class="quick-btn" href="${relPath(curDir, 'agent.html')}">🤖 AI 助手</a>`);
  lines.push('    </div>');

  // 总览
  lines.push(`    <a class="nav-item plain${currentFile === 'index.html' ? ' active' : ''}" href="${relPath(curDir, 'index.html')}">首页总览</a>`);

  // 四大板块
  for (const blk of BLOCKS) {
    const open = (activeBlock && activeBlock.id === blk.id) ? ' open' : '';
    const idxHref = relPath(curDir, blk.dir + '/' + blk.index);
    lines.push(`    <details class="side-block ${blk.id}"${open} style="--blk:${blk.color}">`);
    lines.push(`      <summary class="side-block-head">`);
    lines.push(`        <span class="block-badge" style="background:${blk.color}">${blk.badge}</span>`);
    lines.push(`        <span class="block-label">${blk.label}<i class="block-sub">${blk.sub}</i></span>`);
    lines.push(`        <span class="block-arrow">▾</span>`);
    lines.push(`      </summary>`);
    lines.push(`      <div class="side-block-body">`);
    lines.push(`        <a class="nav-item sub${activeBlock && activeBlock.id === blk.id && curBase === blk.index ? ' active' : ''}" href="${idxHref}">${blk.indexName}</a>`);
    for (const st of blk.stages) {
      lines.push(`        <div class="side-stage"><span class="stage-num">${st.stage.split(' ')[0]}</span>${st.stage.replace(st.stage.split(' ')[0], '').trim()}</div>`);
      for (const it of st.items) {
        const href = relPath(curDir, blk.dir + '/' + it.f);
        const active = (activeBlock && activeBlock.id === blk.id && it.f === curBase) ? ' active' : '';
        const adv = it.adv ? ' <span class="diff advanced">进阶</span>' : '';
        lines.push(`        <a class="nav-item${active}" href="${href}"><span class="num">${it.num}</span>${it.name}${adv}</a>`);
      }
    }
    lines.push('      </div>');
    lines.push('    </details>');
  }

  lines.push('  </nav>');
  lines.push('</aside>');
  return lines.join('\n');
}

/* ---------------- 遍历全站重建 ---------------- */
let count = 0;
for (const dir of ['.', 'empirical', 'dsge', 'structural', 'qsge']) {
  const files = fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.html'));
  for (const f of files) {
    if (dir === '.' && f === 'agent.html') continue; // agent 独立界面
    const rel = dir === '.' ? f : dir + '/' + f;
    const fp = path.join(ROOT, rel);
    const html = fs.readFileSync(fp, 'utf8');
    const asideRe = /<aside class="sidebar"[\s\S]*?<\/aside>/;
    if (!asideRe.test(html)) { console.log('跳过（无aside）:', rel); continue; }
    const nav = buildSidebar(rel);
    const next = html.replace(asideRe, nav);
    fs.writeFileSync(fp, next);
    count++;
  }
}
console.log('重建侧边栏完成:', count, '页');
