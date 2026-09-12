/**
 * chat.js — 同步端点（快速问题路径）
 * 长回答建议走 chat-background.js（异步，15 分钟执行时限，前端轮询）
 * 环境变量：ZHIPU_API_KEY（智谱免费）/ ARK_API_KEY / DASHSCOPE_API_KEY
 * 前端调用：POST /api/chat  body: {"question":"...", "top_k":5, "platform":"zhipu", "model":"glm-4.7-flash"}
 */
const lib = require('./chat-lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: lib.CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', ...lib.CORS_HEADERS },
      body: JSON.stringify({ error: '仅支持POST请求' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const question = body.question || body.query || '';
    if (!question) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...lib.CORS_HEADERS },
        body: JSON.stringify({ error: '请提供question参数' }),
      };
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

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...lib.CORS_HEADERS },
      body: JSON.stringify({
        answer,
        mode,
        truncated,
        sources: results.map((r) => ({
          page: r.page_title,
          section: r.section,
          domain: r.domain,
        })),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...lib.CORS_HEADERS },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
