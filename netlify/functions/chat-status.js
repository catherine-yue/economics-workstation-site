/**
 * chat-status.js — 异步任务结果查询端点
 * 客户端轮询：GET /api/chat-status?task=<taskId>
 * 返回：{done:false} 或 {done:true, answer, mode, truncated, sources, error}
 */
const { getStore } = require('@netlify/blobs');
const lib = require('./chat-lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: lib.CORS_HEADERS, body: '' };
  }
  try {
    const url = new URL(event.rawUrl || `https://placeholder/${event.rawQuery || ''}`);
    const taskId = url.searchParams.get('task');
    if (!taskId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...lib.CORS_HEADERS },
        body: JSON.stringify({ error: '缺少task参数' }),
      };
    }

    const store = getStore({ name: 'agent-tasks' });
    const val = await store.get(taskId, { type: 'text' });
    if (!val) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...lib.CORS_HEADERS },
        body: JSON.stringify({ done: false }),
      };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...lib.CORS_HEADERS },
      body: val,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...lib.CORS_HEADERS },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
