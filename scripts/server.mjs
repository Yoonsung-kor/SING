import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { AiError } from './ai.mjs';
import { validateRecommendationRequest, validateRangeRequest } from '../src/recommend.js';

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

// Shared POST handling: JSON only, size-limited, validated, and AI failures mapped to status codes.
async function handleJson(req, res, { maxBody, validate, run }) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return sendJson(res, 415, { error: 'json-only' });
  let text;
  try { text = await readBody(req, maxBody); }
  catch (error) { return sendJson(res, error.status === 413 ? 413 : 400, { error: error.status === 413 ? 'too-large' : 'bad-request' }); }
  let body;
  try { body = validate(JSON.parse(text)); }
  catch { return sendJson(res, 400, { error: 'bad-request' }); }
  if (!run) return sendJson(res, 503, { error: 'not-configured' });
  try {
    const result = await run(body);
    if (!result) return sendJson(res, 502, { error: 'upstream' });
    return sendJson(res, 200, result);
  } catch (error) {
    if (error instanceof AiError) return sendJson(res, error.code === 'timeout' ? 504 : 502, { error: error.code === 'timeout' ? 'timeout' : 'upstream' });
    return sendJson(res, 500, { error: 'server' });
  }
}

// The recommend cap covers the validator's own bounds (500 songs, 700 exclusions, 200 rejected).
const RECOMMEND_MAX_BODY = 1024 * 1024;
const RANGE_MAX_BODY = 16 * 1024;

async function handleSearch(req, res, searchSongs) {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const q = (params.get('q') ?? '').trim();
  const scope = params.get('scope') ?? 'kor';
  const mode = params.get('mode') ?? 'search';
  const page = Number(params.get('page') ?? '1');
  if (!q || q.length > 120 || !['kor', 'all'].includes(scope) || !['search', 'artist'].includes(mode) || !Number.isInteger(page) || page < 1 || page > 20) {
    return sendJson(res, 400, { error: 'bad-request' });
  }
  if (!searchSongs) return sendJson(res, 503, { error: 'not-configured' });
  try { return sendJson(res, 200, await searchSongs({ q, scope, mode, page })); }
  catch { return sendJson(res, 502, { error: 'upstream' }); }
}

export function createHandler({ root, recommend, lookupRange = null, searchSongs = null }) {
  // An empty list is a real answer ("no song fits"); only a missing result counts as an upstream failure.
  const recommendRun = recommend && (async body => {
    const result = await recommend(body);
    return result && Array.isArray(result.items) ? { items: result.items, intent: result.intent, fallback: result.fallback } : null;
  });
  const rangeRun = lookupRange && (async body => ({ range: await lookupRange(body) ?? null }));
  return async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (req.method === 'POST' && pathname === '/api/recommend') return await handleJson(req, res, { maxBody: RECOMMEND_MAX_BODY, validate: validateRecommendationRequest, run: recommendRun });
      if (req.method === 'POST' && pathname === '/api/song-range') return await handleJson(req, res, { maxBody: RANGE_MAX_BODY, validate: validateRangeRequest, run: rangeRun });
      if (req.method === 'GET' && pathname === '/api/song-search') return await handleSearch(req, res, searchSongs);
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
