/**
 * chat-background.js — 异步 Agent 端点（Background Function，执行时限 15 分钟）
 * 适用于长回答（4096-8192 token，含代码块），不再受同步函数时限限制
 *
 * 流程：客户端 POST → 立即返回 202 + taskId → 后台检索+LLM → 结果写入 Netlify Blobs
 *       → 前端轮询 /api/chat-status?task=taskId 取结果
 *
 * 调用：POST /api/chat-background  body: {"question":"...", "top_k":5, "platform":"zhipu", "model":"glm-4.7-flash"}
 */
const { getStore } = require('@netlify/blobs');
const lib = require('./chat-lib');

const STORE_NAME = 'agent-tasks';

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

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    body = {};
  }
  const question = body.question || body.query || '';
  if (!question) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', ...lib.CORS_HEADERS },
      body: JSON.stringify({ error: '请提供question参数' }),
    };
  }

  // 优先使用前端生成的 taskId（Background Function 的 202 响应不带 body，前端无法从响应获取）
  // 前端生成：crypto.randomUUID()；后端生成作为兜底
  const taskId =
    (body.taskId && String(body.taskId).slice(0, 80)) ||
    (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
    Date.now() + '-' + Math.random().toString(36).slice(2);

  // 后台执行（不 await）：Netlify 在收到 202 后保持函数运行，直到后台任务完成
  runTask(taskId, body)
    .catch(async (err) => {
      try {
        const store = getStore({ name: STORE_NAME });
        await store.set(taskId, JSON.stringify({ done: true, error: err.message || '后台任务异常' }));
      } catch (e) {
        /* 存储失败则无法轮询到结果，前端会超时提示 */
      }
    });

  return {
    statusCode: 202,
    headers: { 'Content-Type': 'application/json', ...lib.CORS_HEADERS },
    body: JSON.stringify({ taskId }),
  };
};

async function runTask(taskId, body) {
  const question = body.question || body.query || '';
  const topK = Math.min(parseInt(body.top_k) || 5, 10);
  const bodyModel = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : null;
  const bodyPlatform = typeof body.platform === 'string' && body.platform.trim() ? body.platform.trim() : 'zhipu';
  const pf = lib.PLATFORMS[bodyPlatform] || lib.PLATFORMS.zhipu;

  // 1. BM25 检索
  const results = lib.bm25Search(question, lib.CHUNKS, topK);

  // 2. 构建 prompt 并调用 LLM
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

  // 3. 结果写入 Netlify Blobs，前端轮询读取
  const store = getStore({ name: STORE_NAME });
  await store.set(
    taskId,
    JSON.stringify({
      done: true,
      answer,
      mode,
      truncated,
      sources: results.map((r) => ({
        page: r.page_title,
        section: r.section,
        domain: r.domain,
      })),
    })
  );
}
