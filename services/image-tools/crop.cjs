const sharp = require('sharp');
const { zipSync } = require('fflate');

sharp.cache({ memory: 48 });
sharp.concurrency(1);
const canvasWidth = 3240;
const canvasHeight = 5760;
const border = 24;
const panelWidth = 936;
const innerWidth = panelWidth - border * 2;

async function findCutPoints(source, info) {
  const preview = await sharp(source).resize({ width: 96 }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const cuts = [0];
  for (const fraction of [1 / 3, 2 / 3]) {
    const ideal = Math.round(preview.info.height * fraction);
    let best = ideal;
    const radius = Math.max(1, Math.min(24, Math.round(preview.info.height * 0.025)));
    let score = Infinity;
    for (let row = Math.max(1, ideal - radius); row <= Math.min(preview.info.height - 2, ideal + radius); row++) {
      let sum = 0, squared = 0, difference = 0;
      for (let column = 0; column < 96; column++) {
        const value = preview.data[row * 96 + column];
        sum += value; squared += value * value;
        difference += Math.abs(value - preview.data[(row - 1) * 96 + column]);
      }
      const candidate = squared / 96 - (sum / 96) ** 2 + difference / 96 * 3 + Math.abs(row - ideal) / radius * 80;
      if (candidate < score) { score = candidate; best = row; }
    }
    cuts.push(Math.round(best / preview.info.height * info.height));
  }
  cuts.push(info.height);
  return cuts;
}

async function cropLongImage(input, { output = 'collage' } = {}) {
  const image = sharp(input, { limitInputPixels: 40000000, animated: false, failOn: 'error' });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error('Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP tĩnh.');
  const { data: source, info } = await image.rotate().png().toBuffer({ resolveWithObject: true });
  if (info.width < 240) throw new Error(`Ảnh nguồn chỉ rộng ${info.width}px, quá nhỏ để ghép rõ chữ. Hãy gửi File/Tài liệu từ ảnh gốc, rộng ít nhất 240px.`);
  if (info.height < info.width * 2) throw new Error('Hãy gửi ảnh chụp toàn trang theo chiều dọc, cao ít nhất gấp 2 lần chiều rộng.');
  const cuts = await findCutPoints(source, info);
  if (output === 'parts') {
    const parts = {};
    for (let index = 0; index < 3; index++) {
      parts[`phan-${index + 1}.png`] = await sharp(source).extract({ left: 0, top: cuts[index], width: info.width, height: cuts[index + 1] - cuts[index] }).png({ compressionLevel: 6 }).toBuffer();
    }
    return Buffer.from(zipSync(parts, { level: 0 }));
  }
  const maxSectionHeight = Math.max(...cuts.slice(1).map((bottom, index) => bottom - cuts[index]));
  const innerHeight = Math.min(4548, Math.round(maxSectionHeight / info.width * innerWidth));
  const panelHeight = innerHeight + border * 2;
  const top = Math.round((canvasHeight - panelHeight) / 2);
  const smallBackground = await sharp(source).flatten({ background: '#ffffff' }).resize(1080, 1920, { fit: 'cover' }).blur(44).modulate({ saturation: 0.35 }).toBuffer();
  const background = await sharp(smallBackground).resize(canvasWidth, canvasHeight).png().toBuffer();
  const wash = Buffer.from(`<svg width="${canvasWidth}" height="${canvasHeight}"><rect width="100%" height="100%" fill="#f5f0e8" fill-opacity="0.78"/></svg>`);
  const shadowSvg = Buffer.from(`<svg width="${canvasWidth}" height="${canvasHeight}">${[0, 1, 2].map(index => `<rect x="${144 + index * 1008}" y="${top + 30}" width="${panelWidth}" height="${panelHeight}" fill="#000" fill-opacity="0.22"/>`).join('')}</svg>`);
  const shadow = await sharp(shadowSvg).blur(36).png().toBuffer();
  const panels = [];
  for (let index = 0; index < 3; index++) {
    const panel = await sharp(source).extract({ left: 0, top: cuts[index], width: info.width, height: cuts[index + 1] - cuts[index] }).flatten({ background: '#ffffff' })
      .resize(innerWidth, innerHeight, { fit: 'contain', background: '#ffffff' })
      .extend({ top: border, bottom: border, left: border, right: border, background: '#ffffff' }).png().toBuffer();
    panels.push({ input: panel, left: 144 + index * 1008, top });
  }
  const result = sharp(background).composite([{ input: wash }, { input: shadow }, ...panels]);
  return output === 'png' ? result.png({ compressionLevel: 6 }).toBuffer() : result.jpeg({ quality: 97, chromaSubsampling: '4:4:4' }).toBuffer();
}

module.exports = { cropLongImage, findCutPoints };
