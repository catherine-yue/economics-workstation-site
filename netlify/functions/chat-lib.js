/**
 * chat-lib.js — 经济学研究学习工作站 Agent 公共逻辑
 * 被 chat.js（同步端点）与 chat-background.js（异步端点）共用
 * 包含：多平台路由、中文BM25检索、LLM调用（限流重试+备选模型）
 */
const chunksData = require('./chunks.json');
const CHUNKS = chunksData.chunks || [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ===== 多平台 LLM 路由表 =====
// 每个平台：OpenAI 兼容 base URL + 对应 API Key 环境变量名
// 免费说明：
//   zhipu     — GLM-4-Flash / GLM-Z1-Flash 长期免费（智谱开放平台，注册即用，无需充值）
//   ark       — 火山方舟豆包免费模型（doubao-seed-lite 等标注"免费"；新用户另有赠送额度）
//   dashscope — 阿里百炼 qwen-turbo 等免费额度（新用户赠送）
//   siliconflow — 硅基流动（需账户有余额，用户已弃用，仅保留兼容）
const PLATFORMS = {
  zhipu: {
    base: 'https://open.bigmodel.cn/api/paas/v4',
    keyEnv: 'ZHIPU_API_KEY',
    label: '智谱AI（GLM-4-Flash 长期免费）',
  },
  ark: {
    base: 'https://ark.cn-beijing.volces.com/api/v3',
    keyEnv: 'ARK_API_KEY',
    label: '火山方舟豆包（免费模型）',
  },
  dashscope: {
    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyEnv: 'DASHSCOPE_API_KEY',
    label: '阿里百炼 Qwen（免费额度）',
  },
  siliconflow: {
    base: 'https://api.siliconflow.cn/v1',
    keyEnv: 'LLM_API_KEY',
    label: '硅基流动（需余额）',
  },
};

// ===== 免费兜底：无 API key 时直接返回检索到的站内段落 =====
function buildRetrievalAnswer(results) {
  if (!results.length) {
    return '未在站内检索到相关内容。请换个关键词，或浏览对应板块的索引页查找。';
  }
  const lines = results.map((r, i) => {
    const content = (r.content || '').trim();
    const code = (r.code || '').trim();
    return `【${i + 1}】${r.page_title}（${r.domain} · ${r.section}）\n${content}${code ? '\n```\n' + code + '\n```' : ''}`;
  });
  return (
    '当前未配置大模型 API Key，以下为站内检索到的相关教程内容（免费模式）。\n配置 Key 后可获得 AI 生成的完整回答。\n\n' +
    lines.join('\n\n')
  );
}

// ===== BM25 检索 =====
// 中文经济学核心术语表：整词优先匹配，降低单字分词噪声
const CN_TERMS = [
  '断点回归','双重差分','平行趋势','稳健性','异质性','内生性','工具变量','反事实','福利分解',
  '空间一般均衡','一般均衡','金融摩擦','适应性学习','贝叶斯估计','结构估计','生产函数','离散选择',
  '收缩映射','对数线性化','扰动法','脉冲响应','方差分解','稳态求解','货币政策','财政政策','零利率下限',
  '世代交叠','货币搜寻','投入产出','合成控制','安慰剂检验','机制检验','描述性统计','基准回归','因果推断',
  '处理效应','政策评估','数据清洗','面板数据','固定效应','随机效应','聚类标准误','多重共线','异常值',
  '缩尾','缺失值','稀有事件','模型设定','识别策略','先验分布','卡尔曼滤波','蒙特卡洛','似然函数','矩条件',
  '最小二乘','引力模型','贸易成本','异质企业','生产率','全要素','边际效用','通胀','产出缺口','资产价格',
  '预期','行为','政策冲击','冲击','参数','估计','模拟','校准','求解','推导','假设','稳态','均衡','家庭',
  '厂商','央行','市场出清','预算约束','欧拉方程','拉格朗日','一阶条件','效用','消费','投资','利率','工资',
  '就业','资本','折旧','价格粘性','泰勒规则','倾向得分','匹配','回归','分类','聚类','标准化','显著性',
  '置信区间','标准误','检验','系数','样本','年份','省份','企业','城市','数据','模型','理论','论文','文献',
  '综述','案例','教程','代码','操作','步骤','合并','清洗','整理'
];
// 缩写 / 同义词映射：用户用缩写或别名提问时，一并加入检索词
const SYNONYM_MAP = {
  rdd: ['断点回归'],
  did: ['双重差分'],
  'qsge': ['空间一般均衡'],
  dsge: ['一般均衡'],
  iv: ['工具变量'],
  scm: ['合成控制'],
  dml: ['双机器学习'],
  mle: ['极大似然'],
  gmm: ['广义矩'],
  blp: ['随机系数'],
  op: ['olley pakes'],
  lp: ['levinsohn petrin'],
  acf: ['ackerberg'],
  irf: ['脉冲响应'],
  var: ['向量自回归'],
  dfm: ['动态因子'],
  gap: ['增长风险'],
  hank: ['异质主体'],
  tank: ['两主体'],
  bgg: ['金融加速器'],
  gk: ['银行家约束'],
  zlb: ['零利率下限'],
  olg: ['世代交叠'],
  sw: ['smets wouters'],
  ek: ['eaton kortum'],
  ppml: ['泊松伪最大似然']
};

function tokenize(text) {
  const tokens = [];
  const lower = (text || '').toLowerCase();
  // 英文数字词
  const en = lower.match(/[a-z0-9]+/g) || [];
  tokens.push(...en);
  // 中文：先按术语表整词匹配（匹配到的词计入 tokens），剩余汉字按单字
  let cn = (text || '').replace(/[^\u4e00-\u9fa5]/g, '');
  for (const term of CN_TERMS) {
    if (!cn.includes(term)) continue;
    tokens.push(term);
    cn = cn.split(term).join(' ');
  }
  const chars = cn.replace(/\s+/g, '').split('');
  tokens.push(...chars);
  return tokens;
}

// 查询词扩展：原词 + 同义词，提升缩写问题命中率
function expandQuery(query) {
  const base = new Set(tokenize(query));
  const expanded = new Set(base);
  for (const t of base) {
    const syns = SYNONYM_MAP[t] || [];
    for (const s of syns) expanded.add(s);
  }
  return [...expanded];
}

function bm25Search(query, chunks, topK) {
  const queryTokens = expandQuery(query);
  const N = chunks.length;
  if (N === 0 || queryTokens.length === 0) return [];

  // 文档频率
  const df = {};
  for (const chunk of chunks) {
    const text = (chunk.content + ' ' + chunk.code + ' ' + chunk.page_title + ' ' + chunk.section).toLowerCase();
    const tokens = new Set(tokenize(text));
    for (const t of tokens) {
      df[t] = (df[t] || 0) + 1;
    }
  }

  // 平均文档长度
  let totalLen = 0;
  const docLens = chunks.map((c) => {
    const len = tokenize(c.content + ' ' + c.code).length;
    totalLen += len;
    return len;
  });
  const avgdl = totalLen / N || 1;

  const k1 = 1.5;
  const b = 0.75;
  const scores = chunks.map((chunk, i) => {
    const text = (chunk.content + ' ' + chunk.code + ' ' + chunk.page_title + ' ' + chunk.section).toLowerCase();
    const docTokens = tokenize(text);
    const tf = {};
    for (const t of docTokens) {
      tf[t] = (tf[t] || 0) + 1;
    }
    let score = 0;
    // 标题/章节命中加权：页面标题里出现查询词时权重更高
    const titleTokens = new Set(tokenize(chunk.page_title + ' ' + chunk.section));
    for (const qt of queryTokens) {
      if (!tf[qt]) continue;
      // 中文单字是弱特征（如"政""策""效""果"），大幅降权，避免通用词淹没模型术语
      const singleCharPenalty = /^[\u4e00-\u9fa5]$/.test(qt) ? 0.15 : 1.0;
      const idf = Math.log(1 + (N - (df[qt] || 0) + 0.5) / ((df[qt] || 0) + 0.5));
      const tfNorm = (tf[qt] * (k1 + 1)) / (tf[qt] + k1 * (1 - b + (b * docLens[i]) / avgdl));
      const boost = titleTokens.has(qt) ? 2.0 : 1.0;
      score += idf * tfNorm * boost * singleCharPenalty;
    }
    return { ...chunk, score };
  });

  return scores
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ===== 调用 LLM（OpenAI 兼容接口，按平台路由）=====
// 免费模型常见限流（HTTP 429），带指数退避重试；重试仍失败则自动尝试同平台备选免费模型
async function callLLM(prompt, bodyModel, bodyPlatform) {
  const pf = PLATFORMS[bodyPlatform] || PLATFORMS.zhipu;
  const apiKey = process.env[pf.keyEnv];
  const apiBase = pf.base;
  const model = bodyModel || 'glm-4.7-flash';

  if (!apiKey) {
    throw new Error(
      `尚未配置 ${pf.label} 的 API Key。请在 Netlify → Environment variables 中添加 ${pf.keyEnv}，然后重新部署。`
    );
  }

  // 推理模型（GLM-Z1 系列等）与非推理模型统一按 Netlify 同步函数 60s 时限校准输出上限：
  // 关键约束：生成必须在 45s 内完成（含重试/兜底/传输），否则函数被网关切断，整段回答丢失。
  // GLM-4.7-Flash 实测约 40-80 token/s，2000 token ≈ 25-45s 是安全上限；
  // 超长回答触发截断标记，前端提示用户继续追问（宁可截断提示，不可整体丢失）。
  const isReasoning = /z1|reasoning|r1/i.test(model);
  const payload = {
    model,
    messages: [
      {
        role: 'system',
        content:
          '你是经济学研究学习工作站的智能助手，擅长实证方法（Stata）、DSGE建模、结构估计和量化空间一般均衡。回答专业、准确、有步骤。请精炼输出：代码紧凑完整、要点不遗漏、避免空话套话，优先保证覆盖用户问题的每个要点。',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: isReasoning ? 1600 : 2000,
  };
  if (!isReasoning) payload.temperature = 0.3;

  // 带退避重试的请求（最多 1 次；整体受 AbortSignal 45s 限制，确保函数在 60s 时限内一定返回）
  let resp = null;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      resp = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45000),
      });
      if (resp.ok || resp.status !== 429) break;
      if (attempt === 0) await sleep(1500);
    }
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new Error('LLM 生成超时（45秒限制）。请把问题拆分成更小步骤提问，或在下方切换更快的免费模型。');
    }
    throw e;
  }

  // 限流重试仍失败：自动尝试同平台备选免费模型（仅智谱开放平台有多个免费模型；只试 1 个最快常用的，带 20s 超时防止挂起）
  if (resp && resp.status === 429 && bodyPlatform === 'zhipu') {
    const fallbacks = ['glm-4-flash'];
    for (const fb of fallbacks) {
      if (fb === model) continue;
      const fbPayload = { ...payload, model: fb };
      if (/z1/i.test(fb)) delete fbPayload.temperature;
      try {
        const fbResp = await fetch(`${apiBase}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(fbPayload),
          signal: AbortSignal.timeout(20000),
        });
        if (fbResp.ok) {
          const d = await fbResp.json();
          const c = d.choices && d.choices[0];
          return {
            content: (c && c.message && c.message.content) || '',
            truncated: (c && c.finish_reason) === 'length',
            fallbackModel: fb,
          };
        }
      } catch (e) {
        /* 备选也失败则走检索兜底 */
      }
    }
  }

  if (!resp || !resp.ok) {
    const errText = resp ? await resp.text() : '连接失败';
    throw new Error(`LLM API错误 ${resp ? resp.status : 'net'}: ${errText.slice(0, 500)}`);
  }

  const data = await resp.json();
  const choice = data.choices && data.choices[0];
  const content = (choice && choice.message && choice.message.content) || '';
  // finish_reason === 'length' 表示输出被 token 上限截断，前端据此提示继续追问
  return { content, truncated: (choice && choice.finish_reason) === 'length' };
}

// 构建 LLM prompt：检索上下文 + 用户问题 + 回答要求
function buildPrompt(question, results) {
  const context = results
    .map((r, i) => {
      return `【来源${i + 1}】${r.page_title}（${r.domain}·${r.section}）\n${r.content || ''}${r.code ? '\n```\n' + r.code + '\n```' : ''}`;
    })
    .join('\n\n');

  return `你是经济学研究学习工作站的智能助手。请基于以下站内资料回答用户问题。如果资料中没有相关内容，请如实说明，不要编造。

【站内检索结果】
${context || '（未检索到相关站内资料，请根据你的经济学知识回答，并提示用户该内容站内暂未覆盖。）'}

【用户问题】
${question}

【回答要求】
- 用中文回答，专业但易懂
- 涉及公式/代码时给出具体内容
- 标注信息来源页面
- 如果是步骤操作类问题，给出逐步操作指引
- 如果是论文框架设计类问题，给出结构化建议`;
}

// 组合最终回答：主回答 + 限流/降级提示
function composeAnswer(answer, mode, fallbackModel, llmErr) {
  if (mode === 'llm' && fallbackModel) {
    answer += `\n\n> 注：当前所选免费模型访问量过大，本次已自动切换至备选模型 ${fallbackModel} 回答，内容不受影响。`;
  }
  if (mode === 'retrieval-fallback' && llmErr) {
    answer += '\n\n（注：LLM 调用失败：' + llmErr.message + '，以上为站内检索结果。）';
    if (llmErr.message.includes('402') || llmErr.message.includes('余额')) {
      answer += '\n\n【解决方法】当前平台账户余额不足（错误 402）。请登录该平台充值或确认账户状态，也可在下方模型下拉框切换其他平台/模型；余额恢复后本回答将自动切换为 AI 生成。';
    } else if (llmErr.message.includes('401') || llmErr.message.includes('403')) {
      answer += '\n\n【解决方法】API Key 无效或已失效。请在 Netlify → Environment variables 更新对应平台的 API Key 环境变量后重新部署。';
    } else if (llmErr.message.includes('429') || llmErr.message.includes('1305')) {
      answer += '\n\n【解决方法】免费模型当前访问量过大（限流），请稍等 1-2 分钟后重试，或在下方模型下拉框切换其他免费模型。';
    }
  }
  return answer;
}

module.exports = {
  CHUNKS,
  CORS_HEADERS,
  PLATFORMS,
  sleep,
  tokenize,
  expandQuery,
  bm25Search,
  buildRetrievalAnswer,
  buildPrompt,
  composeAnswer,
  callLLM,
};
