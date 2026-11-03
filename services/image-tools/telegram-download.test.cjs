const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { requestTelegram, handleTelegramDownload, downloadTelegramFile, handleTelegramReply } = require('./telegram-download.cjs');

const fixture = async (t, handler) => {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return (options, callback) => http.request({ ...options, hostname: '127.0.0.1', port: server.address().port }, callback);
};

test('Buffer complete bytes before returning a Telegram file', async t => {
  const expected = Buffer.alloc(1200000, 121);
  const request = await fixture(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'image/jpeg' });
    res.write(expected.subarray(0, 600000));
    setTimeout(() => res.end(expected.subarray(600000)), 20);
  });
  const result = await requestTelegram('/file/bot123:secret/documents/file_1.jpg', { request });
  assert.deepEqual(result.body, expected);
  assert.equal(result.contentType, 'image/jpeg');
});

test('A stalled download reaches its deadline and never exposes the token', async t => {
  const request = await fixture(t, (_req, res) => { res.writeHead(200); res.write('partial'); });
  await assert.rejects(requestTelegram('/file/bot123:secret/documents/file_1.jpg', { request, timeout: 50 }), error => error.message === 'Telegram download timeout' && !error.message.includes('secret'));
});

test('Interrupted and oversized files cannot be returned as complete images', async t => {
  const interrupted = await fixture(t, (_req, res) => { res.writeHead(200, { 'content-length': 100 }); res.write('partial'); setTimeout(() => res.destroy(), 10); });
  await assert.rejects(requestTelegram('/file', { request: interrupted }), /interrupted/);
  const oversized = await fixture(t, (_req, res) => res.end(Buffer.alloc(100)));
  await assert.rejects(requestTelegram('/file', { request: oversized, maxBytes: 10 }), /limit/);
});

test('The gateway rejects writes, arbitrary hosts and unsupported file paths', async () => {
  for (const url of ['/telegram-download/bot123:secret/sendMessage', '/telegram-download/file/bot123:secret/../config', '/telegram-download/file/bot123:secret/documents/file_1.exe', '/telegram-download/https://example.com']) {
    let status;
    const response = { writeHead: code => { status = code; return response; }, end() {} };
    assert.equal(await handleTelegramDownload({ url, method: 'GET' }, response), true);
    assert.equal(status, 404);
  }
});

test('The gateway serves original videos from both video and document paths with bounded downloads', async () => {
  for (const file of ['videos/file_1.mp4', 'documents/file_2.MP4', 'videos/file_3.mov', 'documents/file_4.webm']) {
    const bytes = Buffer.from('original-video-bytes');
    let headers, body;
    const response = { writeHead(code, value) { assert.equal(code, 200); headers = value; return this; }, end(value) { body = value; } };
    const request = { url: '/telegram-download/file/bot123:secret/' + file, method: 'GET', async *[Symbol.asyncIterator]() {} };
    await handleTelegramDownload(request, response, async (path, options) => {
      assert.equal(path, '/file/bot123:secret/' + file);
      assert.equal(options.maxBytes, 20 * 1024 * 1024);
      assert.equal(options.timeout, 20000);
      return { statusCode: 200, contentType: 'video/mp4', body: bytes };
    });
    assert.equal(headers['content-length'], bytes.length);
    assert.deepEqual(body, bytes);
  }
});

test('Metadata retries transient timeouts and preserves the getFile payload', async () => {
  const payload = Buffer.from(JSON.stringify({ file_id: 'original-file-id' }));
  let attempts = 0, result;
  const response = { writeHead(code) { assert.equal(code, 200); return this; }, end(body) { result = JSON.parse(body); } };
  const request = { url: '/telegram-download/bot123:secret/getFile', method: 'POST', async *[Symbol.asyncIterator]() { yield payload; } };
  await handleTelegramDownload(request, response, async (_path, options) => {
    assert.equal(options.timeout, 30000);
    assert.deepEqual(options.body, payload);
    if (++attempts < 3) throw new Error('Telegram download timeout');
    return { statusCode: 200, body: Buffer.from('{"ok":true}') };
  });
  assert.equal(attempts, 3);
  assert.equal(result.ok, true);
});

test('Permanent Telegram errors are returned without retrying', async () => {
  let attempts = 0;
  const response = { writeHead(code) { assert.equal(code, 400); return this; }, end() {} };
  await handleTelegramDownload({ url: '/telegram-download/bot123:secret/getFile', method: 'GET', async *[Symbol.asyncIterator]() {} }, response, async () => {
    attempts++;
    return { statusCode: 400, body: Buffer.from('{"ok":false}') };
  });
  assert.equal(attempts, 1);
});

test('Ranged downloads recover a stalled chunk and assemble exact original bytes', async () => {
  const expected = Buffer.alloc(160000);
  for (let i = 0; i < expected.length; i++) expected[i] = i % 251;
  let retried = false;
  const result = await downloadTelegramFile('/file', async (_path, options) => {
    const [, from, to] = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
    const start = Number(from), end = Math.min(expected.length - 1, Number(to));
    if (start === 65536 && !retried) { retried = true; throw new Error('Telegram download timeout'); }
    return { statusCode: 206, contentType: 'video/mp4', contentRange: `bytes ${start}-${end}/${expected.length}`, body: expected.subarray(start, end + 1) };
  });
  assert.equal(retried, true);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, expected);
});

test('A mismatched range cannot be saved as a complete video', async () => {
  await assert.rejects(downloadTelegramFile('/file', async () => ({ statusCode: 206, contentRange: 'bytes 0-65535/100000', body: Buffer.alloc(12) })), /range/);
});

test('Reply gateway preserves dynamic buttons and sends only once', async () => {
  const payload = { chat_id: 456, text: 'Xem trước', reply_markup: { inline_keyboard: [[{ text: 'Kiểm tra', callback_data: 'import:preview:abcdef123456' }]] } };
  let calls = 0;
  const request = { url: '/telegram-reply', method: 'POST', headers: { 'x-telegram-token': '123:secret' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)); } };
  const response = { writeHead(code) { assert.equal(code, 200); return this; }, end() {} };
  await handleTelegramReply(request, response, async (path, options) => {
    calls++;
    assert.equal(path, '/bot123:secret/sendMessage');
    assert.deepEqual(JSON.parse(options.body), payload);
    return { statusCode: 200, body: Buffer.from('{"ok":true}') };
  });
  assert.equal(calls, 1);
});

test('Reply gateway rejects unauthenticated requests', async () => {
  let status;
  const response = { writeHead(code) { status = code; return this; }, end() {} };
  await handleTelegramReply({ url: '/telegram-reply', method: 'POST', headers: {} }, response, () => assert.fail('Must not send'));
  assert.equal(status, 403);
});
