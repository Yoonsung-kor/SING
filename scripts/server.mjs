import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { AiError } from './ai.mjs';
import { validateRecommendationRequest } from '../src/recommend.js';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8' };
const staticHeaders = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(self)',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

function readBody(req, maxBody) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBody) { settled = true; reject(Object.assign(new Error('too large'), { status: 413 })); req.resume(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks).toString('utf8')); } });
    req.on('error', error => { if (!settled) { settled = true; reject(error); } });
  });
}

async function handleRecommend(req, res, { recommend, maxBody }) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return sendJson(res, 415, { error: 'json-only' });
  let text;
  try { text = await readBody(req, maxBody); }
  catch (error) { return sendJson(res, error.status === 413 ? 413 : 400, { error: error.status === 413 ? 'too-large' : 'bad-request' }); }
  let body;
  try { body = validateRecommendationRequest(JSON.parse(text)); }
  catch { return sendJson(res, 400, { error: 'bad-request' }); }
  if (!recommend) return sendJson(res, 503, { error: 'not-configured' });
  try {
    const items = await recommend(body);
    if (!Array.isArray(items) || !items.length) return sendJson(res, 502, { error: 'upstream' });
    return sendJson(res, 200, { items });
  } catch (error) {
    if (error instanceof AiError) return sendJson(res, error.code === 'timeout' ? 504 : 502, { error: error.code === 'timeout' ? 'timeout' : 'upstream' });
    return sendJson(res, 500, { error: 'server' });
  }
}

export function createHandler({ root, recommend, maxBody = 16384 }) {
  return async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (req.method === 'POST' && pathname === '/api/recommend') return await handleRecommend(req, res, { recommend, maxBody });
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (!/^(index\.html|src\/[\w.-]+|assets\/[\w.-]+|tests\/browser[\w.-]*)$/.test(relative)) { res.writeHead(404).end('Not found'); return; }
      const filename = path.resolve(root, relative);
      if (!filename.startsWith(root) || !(await stat(filename)).isFile()) { res.writeHead(404).end('Not found'); return; }
      const data = await readFile(filename);
      res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', ...staticHeaders });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { if (!res.headersSent) res.writeHead(404).end('Not found'); }
  };
}
