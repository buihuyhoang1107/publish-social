const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { cropLongImage, findCutPoints } = require('./crop.cjs');
const { unzipSync } = require('fflate');

test('Long image becomes a high-resolution lossless PNG with ordered source sections', async () => {
  const strips = await Promise.all(['#ec2424', '#24b724', '#2424ec'].map(background => sharp({ create: { width: 300, height: 1200, channels: 3, background } }).png().toBuffer()));
  const source = await sharp({ create: { width: 300, height: 3600, channels: 3, background: '#fff' } }).composite(strips.map((input, index) => ({ input, top: index * 1200, left: 0 }))).png().toBuffer();
  const result = await cropLongImage(source, { output: 'png' });
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.width, 3240); assert.equal(metadata.height, 5760); assert.equal(metadata.format, 'png');
  const pixels = await sharp(result).removeAlpha().raw().toBuffer();
  for (let index = 0; index < 3; index++) {
    const offset = (2880 * 3240 + 612 + index * 1008) * 3;
    assert.ok(pixels[offset + index] > 150);
    assert.ok(pixels[offset + (index + 1) % 3] < 100);
  }
});

test('Keep the approved three-column layout with cuts near each third', async () => {
  const svg = Buffer.from('<svg width="300" height="3180"><rect width="300" height="3180" fill="white"/><rect width="300" height="1000" fill="red"/><rect y="1060" width="300" height="1200" fill="green"/><rect y="2320" width="300" height="860" fill="blue"/></svg>');
  const source = await sharp(svg).png().toBuffer();
  const cuts = await findCutPoints(source, { width: 300, height: 3180 });
  assert.ok(Math.abs(cuts[1] - 1060) < 100);
  assert.ok(Math.abs(cuts[2] - 2120) < 100);
  const jpg = await cropLongImage(source);
  assert.equal((await sharp(jpg).metadata()).format, 'jpeg');
});

test('Native PNG parts preserve every source pixel in order without resizing', async () => {
  const original = Buffer.alloc(300 * 901 * 3);
  for (let index = 0; index < original.length; index++) original[index] = index % 251;
  const source = await sharp(original, { raw: { width: 300, height: 901, channels: 3 } }).png().toBuffer();
  const files = unzipSync(await cropLongImage(source, { output: 'parts' }));
  assert.deepEqual(Object.keys(files), ['phan-1.png', 'phan-2.png', 'phan-3.png']);
  const decoded = [];
  let height = 0;
  for (const file of Object.values(files)) {
    const image = sharp(Buffer.from(file));
    const metadata = await image.metadata();
    assert.equal(metadata.width, 300); height += metadata.height;
    decoded.push(await image.removeAlpha().raw().toBuffer());
  }
  assert.equal(height, 901); assert.deepEqual(Buffer.concat(decoded), original);
});

test('Reject non-images and images that are not long portraits', async () => {
  await assert.rejects(cropLongImage(Buffer.from('not an image')));
  const square = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(cropLongImage(square), /chiều rộng/);
  const tiny = await sharp({ create: { width: 92, height: 1280, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(cropLongImage(tiny), /92px/);
});
