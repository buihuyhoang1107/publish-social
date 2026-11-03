const http = require('node:http');
const { cropLongImage } = require('./crop.cjs');
const { handleTelegramDownload, handleTelegramReply } = require('./telegram-download.cjs');
const maxBytes = 20 * 1024 * 1024;
let processing = false;

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/healthz') { response.end('{"status":"ok"}'); return; }
  if (await handleTelegramDownload(request, response)) return;
  if (await handleTelegramReply(request, response)) return;
  const url = new URL(request.url, 'http://image-tools');
  if (request.method !== 'POST' || url.pathname !== '/crop') { response.writeHead(404).end(); return; }
  if (processing) { response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '3' }).end(JSON.stringify({ message: 'Bot đang xử lý ảnh khác, thử lại sau ít giây.' })); return; }
  processing = true;
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maxBytes) { response.writeHead(413).end(JSON.stringify({ message: 'Ảnh vượt quá 20 MB.' })); return; }
      chunks.push(chunk);
    }
    if (!size) throw new Error('Chưa nhận được file ảnh.');
    const parts = url.searchParams.get('output') === 'parts';
    const png = url.searchParams.get('output') === 'png';
    const result = await cropLongImage(Buffer.concat(chunks), { output: parts ? 'parts' : png ? 'png' : 'collage' });
    if (result.length > 45 * 1024 * 1024) throw new Error('Ảnh nguồn tạo ra file kết quả quá lớn. Hãy giảm dung lượng ảnh nguồn rồi gửi lại.');
    response.writeHead(200, { 'content-type': parts ? 'application/zip' : png ? 'image/png' : 'image/jpeg', 'content-length': result.length, 'content-disposition': 'attachment; filename="' + (parts ? '3-phan-anh-goc.zip' : png ? 'anh-ghep-hq.png' : 'anh-ghep.jpg') + '"', 'cache-control': 'no-store' });
    response.end(result);
  } catch (error) {
    const message = /^(Chỉ hỗ trợ|Hãy gửi|Chưa nhận|Ảnh nguồn)/.test(error.message) ? error.message : 'Không đọc được ảnh hoặc ảnh vượt giới hạn 40 triệu pixel. Hãy gửi JPG/PNG/WEBP hợp lệ.';
    response.writeHead(422, { 'content-type': 'application/json' }).end(JSON.stringify({ message }));
  } finally { processing = false; }
});

server.requestTimeout = 60000;
server.listen(3000, '0.0.0.0');
