const https = require('node:https');

// Never log token-bearing URLs or authorization headers.
const requestTelegram = (path, { method = 'GET', body, headers = {}, timeout = 90000, maxBytes = 20 * 1024 * 1024, request = https.request } = {}) => new Promise((resolve, reject) => {
  let response;
  let settled = false;
  const finish = (error, result) => {
    if (settled) return;
    settled = true;
    clearTimeout(deadline);
    if (error) { response?.destroy(); outgoing.destroy(); reject(error); }
    else resolve(result);
  };
  const outgoing = request({ hostname: 'api.telegram.org', port: 443, path, method, family: 4, agent: false, headers: { ...headers, ...(body ? { 'content-type': 'application/json', 'content-length': body.length } : {}) } }, incoming => {
    response = incoming;
    const chunks = [];
    let length = 0;
    incoming.on('data', chunk => {
      length += chunk.length;
      if (length > maxBytes) { finish(new Error('Telegram file exceeds download limit')); return; }
      chunks.push(chunk);
    });
    incoming.on('end', () => finish(undefined, { statusCode: incoming.statusCode, contentType: incoming.headers['content-type'], contentRange: incoming.headers['content-range'], body: Buffer.concat(chunks) }));
    incoming.on('error', () => finish(new Error('Telegram download interrupted')));
    incoming.on('aborted', () => finish(new Error('Telegram download interrupted')));
  });
  const deadline = setTimeout(() => finish(new Error('Telegram download timeout')), timeout);
  outgoing.on('error', () => finish(new Error('Telegram download connection failed')));
  outgoing.end(body);
});

const downloadTelegramFile = async (path, download) => {
  const chunkSize = 64 * 1024;
  const fetchChunk = async (start, end) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await download(path, { headers: { Range: `bytes=${start}-${end}` }, timeout: 20000, maxBytes: 20 * 1024 * 1024 });
        if (result.statusCode >= 500) throw new Error('Telegram file temporarily unavailable');
        return result;
      } catch (error) { if (attempt === 2 || /exceeds download limit/.test(error.message)) throw error; }
    }
  };
  const first = await fetchChunk(0, chunkSize - 1);
  if (first.statusCode !== 206) return first;
  const range = /^bytes 0-(\d+)\/(\d+)$/.exec(first.contentRange ?? '');
  if (!range || Number(range[1]) + 1 !== first.body.length) throw new Error('Invalid Telegram file range');
  const total = Number(range[2]);
  if (total > 20 * 1024 * 1024) throw new Error('Telegram file exceeds download limit');
  if (first.body.length !== Math.min(chunkSize, total)) throw new Error('Incomplete Telegram file range');
  const bytes = Buffer.alloc(total);
  first.body.copy(bytes);
  let next = first.body.length;
  let failed = false;
  const worker = async () => {
    while (!failed && next < total) {
      const start = next;
      const end = Math.min(total - 1, start + chunkSize - 1);
      next = end + 1;
      try {
        const part = await fetchChunk(start, end);
        if (part.statusCode !== 206 || part.contentRange !== `bytes ${start}-${end}/${total}` || part.body.length !== end - start + 1) throw new Error('Incomplete Telegram file range');
        part.body.copy(bytes, start);
      } catch (error) { failed = true; throw error; }
    }
  };
  await Promise.all([worker(), worker()]);
  return { statusCode: 200, contentType: first.contentType, body: bytes };
};

const handleTelegramReply = async (request, response, send = requestTelegram) => {
  if (request.url !== '/telegram-reply') return false;
  const token = request.headers['x-telegram-token'];
  if (request.method !== 'POST' || !/^\d+:[A-Za-z0-9_-]+$/.test(token ?? '')) { response.writeHead(403).end(); return true; }
  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 65536) { response.writeHead(413).end(); return true; }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const payload = JSON.parse(body);
    if (!Number.isSafeInteger(payload.chat_id) || typeof payload.text !== 'string') { response.writeHead(400).end(); return true; }
    // Sending is never retried: an ambiguous response must not duplicate a reply.
    const result = await send('/bot' + token + '/sendMessage', { method: 'POST', body, timeout: 30000, maxBytes: 65536 });
    response.writeHead(result.statusCode, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(result.body);
  } catch {
    response.writeHead(504, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, description: 'Telegram reply could not be confirmed.' }));
  }
  return true;
};

const handleTelegramDownload = async (request, response, download = requestTelegram) => {
  if (!request.url.startsWith('/telegram-download/')) return false;
  const path = request.url.slice('/telegram-download'.length);
  const metadata = /^\/bot\d+:[A-Za-z0-9_-]+\/getFile(?:\?file_id=[A-Za-z0-9_%+-]+)?$/.test(path);
  const file = /^\/file\/bot\d+:[A-Za-z0-9_-]+\/(?:documents|photos|videos)\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|txt|mp4|mov|webm)$/i.test(path);
  if (!(metadata && ['GET', 'POST'].includes(request.method) || file && request.method === 'GET')) { response.writeHead(404).end(); return true; }
  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 4096) { response.writeHead(413).end(); return true; }
      chunks.push(chunk);
    }
    let result;
    if (file) result = await downloadTelegramFile(path, download);
    else {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await download(path, { method: request.method, body: length ? Buffer.concat(chunks) : undefined, timeout: 30000, maxBytes: 65536 });
          if (result.statusCode < 500 || attempt === 2) break;
        } catch (error) {
          if (attempt === 2 || /exceeds download limit/.test(error.message)) throw error;
        }
      }
    }
    response.writeHead(result.statusCode, { 'content-type': result.contentType || 'application/octet-stream', 'content-length': result.body.length, 'cache-control': 'no-store' });
    response.end(result.body);
  } catch {
    response.writeHead(504, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error_code: 504, description: 'Telegram download failed or timed out. Please retry.' }));
  }
  return true;
};

module.exports = { requestTelegram, handleTelegramDownload, handleTelegramReply, downloadTelegramFile };
