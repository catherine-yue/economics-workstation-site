/**
 * chat.js — Vercel 版 RAG Agent 同步端点
 * 环境变量：ZHIPU_API_KEY（智谱免费，默认）/ ARK_API_KEY / DASHSCOPE_API_KEY
 * 前端调用：POST /api/chat  body: {"question":"...", "top_k":5, "platform":"zhipu", "model":"glm-4.7-flash"}
 * Vercel Hobby 函数最长 300s，LLM 生成完全够用（内部仍设 45s 兜底超时）
 */
const lib = require('./chat-lib');

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  // CORS（同源部署下前端无需跨域；保留以兼容直连调试）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: '仅支持POST请求' });
    return;
  }

  try {
    const body = req.body || {};
    const question = body.question || body.query || '';
    if (!question) {
      res.status(400).json({ error: '请提供question参数' });
      return;
    }

    const topK = Math.min(parseInt(body.top_k) || 5, 10);
    const bodyModel = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : null;
    const bodyPlatform = typeof body.platform === 'string' && body.platform.trim() ? body.platform.trim() : 'zhipu';
    const pf = lib.PLATFORMS[bodyPlatform] || lib.PLATFORMS.zhipu;

    // 1. BM25 检索
    const results = lib.bm25Search(question, lib.CHUNKS, topK);

    // 2. 构建 prompt 并调用 LLM（未配置 key 时走检索兜底）
    const prompt = lib.buildPrompt(question, results);
    let answer;
    let mode = 'llm';
    let truncated = false;
    if (!process.env[pf.keyEnv]) {
      answer = lib.buildRetrievalAnswer(results);
      mode = 'retrieval';
    } else {
      try {
        const llmResult = await lib.callLLM(prompt, bodyModel, bodyPlatform);
        answer = lib.composeAnswer(llmResult.content, 'llm', llmResult.fallbackModel, null);
        truncated = llmResult.truncated;
      } catch (err) {
        answer = lib.composeAnswer(lib.buildRetrievalAnswer(results), 'retrieval-fallback', null, err);
        mode = 'retrieval-fallback';
      }
    }

    res.status(200).json({
      answer,
      mode,
      truncated,
      sources: results.map((r) => ({
        page: r.page_title,
        section: r.section,
        domain: r.domain,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
