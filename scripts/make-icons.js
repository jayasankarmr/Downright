#!/usr/bin/env node
/* Downright — procedural icon generator. Zero dependencies.
 *
 * Draws the brand mark (rounded square, indigo→violet gradient, white
 * "M↓" glyph — arrow only at toolbar sizes) into RGBA buffers with 4×
 * supersampling, and writes real PNGs using Node's built-in zlib.
 *
 * Usage: node scripts/make-icons.js
 */
'use strict';

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* ---------------- PNG encoding ---------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- geometry ---------------- */

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const s1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const s2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  const s3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

function inRoundedRect(px, py, inset, radius) {
  const x0 = inset, y0 = inset, x1 = 1 - inset, y1 = 1 - inset;
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const rx = Math.max(x0 + radius - px, px - (x1 - radius), 0);
  const ry = Math.max(y0 + radius - py, py - (y1 - radius), 0);
  return rx * rx + ry * ry <= radius * radius;
}

/* ---------------- drawing ---------------- */

const GRAD_TOP = [0x4f, 0x46, 0xe5];    // indigo-600
const GRAD_BOTTOM = [0x7c, 0x3a, 0xed]; // violet-600

function glyphSegments(large) {
  if (large) {
    const w = 0.082;
    return {
      w,
      segments: [
        [0.205, 0.655, 0.205, 0.360],
        [0.205, 0.360, 0.3375, 0.520],
        [0.3375, 0.520, 0.470, 0.360],
        [0.470, 0.360, 0.470, 0.655],
        [0.700, 0.345, 0.700, 0.520],
      ],
      triangle: [0.578, 0.505, 0.822, 0.505, 0.700, 0.672],
    };
  }
  const w = 0.11;
  return {
    w,
    segments: [[0.50, 0.235, 0.50, 0.520]],
    triangle: [0.285, 0.485, 0.715, 0.485, 0.50, 0.775],
  };
}

function renderIcon(size) {
  const SS = 4;
  const big = size * SS;
  const glyph = glyphSegments(size >= 48);
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x * SS + sx + 0.5) / big;
          const v = (y * SS + sy + 0.5) / big;
          if (!inRoundedRect(u, v, 0.015, 0.225)) continue;
          // background gradient
          let cr = GRAD_TOP[0] + (GRAD_BOTTOM[0] - GRAD_TOP[0]) * v;
          let cg = GRAD_TOP[1] + (GRAD_BOTTOM[1] - GRAD_TOP[1]) * v;
          let cb = GRAD_TOP[2] + (GRAD_BOTTOM[2] - GRAD_TOP[2]) * v;
          // glyph
          let onGlyph = false;
          for (const [x1, y1, x2, y2] of glyph.segments) {
            if (distToSegment(u, v, x1, y1, x2, y2) <= glyph.w / 2) { onGlyph = true; break; }
          }
          if (!onGlyph && glyph.triangle) {
            const t = glyph.triangle;
            if (inTriangle(u, v, t[0], t[1], t[2], t[3], t[4], t[5])) onGlyph = true;
          }
          if (onGlyph) { cr = 255; cg = 255; cb = 255; }
          r += cr; g += cg; b += cb; a += 255;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const alpha = a / n;
      if (alpha > 0) {
        // premultiplied average → straight alpha
        rgba[i] = Math.round(r / (a / 255));
        rgba[i + 1] = Math.round(g / (a / 255));
        rgba[i + 2] = Math.round(b / (a / 255));
        rgba[i + 3] = Math.round(alpha);
      }
    }
  }
  return encodePng(size, size, rgba);
}

/* ---------------- main ---------------- */

const root = path.join(__dirname, '..');
const iconDir = path.join(root, 'src', 'icons');
const assetDir = path.join(root, 'store-assets');
fs.mkdirSync(iconDir, { recursive: true });
fs.mkdirSync(assetDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const png = renderIcon(size);
  fs.writeFileSync(path.join(iconDir, `icon-${size}.png`), png);
  console.log(`icon-${size}.png  ${png.length} bytes`);
}
const logo = renderIcon(300);
fs.writeFileSync(path.join(assetDir, 'logo-300.png'), logo);
console.log(`logo-300.png  ${logo.length} bytes`);
