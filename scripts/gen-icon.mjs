/**
 * 生成 1024x1024 应用图标 app-icon.png(纯 Node,无依赖),
 * 供 `pnpm tauri icon` 生成全套平台图标。
 * 图案:深色圆角方块 + 蓝色 "M" 字形。
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZE = 1024;
const px = Buffer.alloc(SIZE * SIZE * 4);

const BG = [30, 32, 46]; // 深色背景
const ACCENT = [91, 143, 245]; // 蓝色 M

function set(x, y, [r, g, b], a = 255) {
  const i = (y * SIZE + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}

// 背景:圆角矩形
const P = 96; // 边距
const R = 220; // 圆角半径
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const cx = x < P + R ? P + R : x > SIZE - P - R ? SIZE - P - R : x;
    const cy = y < P + R ? P + R : y > SIZE - P - R ? SIZE - P - R : y;
    const inside = x >= P && x < SIZE - P && y >= P && y < SIZE - P && (x - cx) ** 2 + (y - cy) ** 2 <= R * R;
    set(x, y, inside ? BG : [0, 0, 0], inside ? 255 : 0);
  }
}

// "M" 字形:左右竖条 + 中央 V 形对角线
const GX0 = 0.3, GX1 = 0.7, GY0 = 0.32, GY1 = 0.68;
const STROKE = 0.055;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const t = y / SIZE;
    const l = x / SIZE;
    if (l <= GX0 || l >= GX1 || t <= GY0 || t >= GY1) continue;
    const tt = (t - GY0) / (GY1 - GY0); // 0..1
    const ld = GX0 + STROKE + tt * (0.5 - GX0 - STROKE); // 左斜线
    const rd = GX1 - STROKE - tt * (GX1 - STROKE - 0.5); // 右斜线
    const inLeft = l < GX0 + STROKE;
    const inRight = l > GX1 - STROKE;
    const inDiag = l >= ld - 0.03 && l <= rd + 0.03;
    if (inLeft || inRight || inDiag) set(x, y, ACCENT);
  }
}

// PNG 编码
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

// 每行前置 filter byte 0
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(new URL("../app-icon.png", import.meta.url), png);
console.log("app-icon.png generated");
