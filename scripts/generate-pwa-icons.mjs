import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'templates', 'web-app', 'public');

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) {
    current = (current & 1) ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  }
  return current >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function insideCircle(x, y, centerX, centerY, radius) {
  const dx = x - centerX;
  const dy = y - centerY;
  return (dx * dx) + (dy * dy) <= radius * radius;
}

function createIcon(size) {
  const stride = 1 + (size * 4);
  const pixels = Buffer.alloc(stride * size);
  const center = size / 2;
  const bulbY = size * 0.42;
  const bulbRadius = size * 0.22;

  for (let y = 0; y < size; y += 1) {
    const row = y * stride;
    pixels[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const index = row + 1 + (x * 4);
      let color = [23, 37, 84, 255];
      const inBulb = insideCircle(x, y, center, bulbY, bulbRadius);
      const inNeck = x >= size * 0.41 && x <= size * 0.59 && y >= size * 0.5 && y <= size * 0.67;
      const inBand = x >= size * 0.39 && x <= size * 0.61 && y >= size * 0.66 && y <= size * 0.72;
      const inBase = x >= size * 0.43 && x <= size * 0.57 && y >= size * 0.73 && y <= size * 0.79;
      if (inBulb || inNeck || inBase) color = [248, 250, 252, 255];
      if (inBand) color = [56, 189, 248, 255];
      [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]] = color;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND'),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(join(output, `app-icon-${size}.png`), createIcon(size));
}
