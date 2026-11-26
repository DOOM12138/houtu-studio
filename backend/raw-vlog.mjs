// Panasonic V-Log/V-Gamut Reference Manual, Rev. 1.0, sections 3 and 4.
export const MAX_CUBE_BYTES = 16 * 1024 * 1024;
const linear709ToVGamut = [
 [0.624492, 0.304033, 0.071475],
 [0.090049, 0.772302, 0.137649],
 [0.020813, 0.080388, 0.898799]
];
const unit = value => Math.min(1, Math.max(0, value));

export function encodeVLog(value) {
 return unit(value < .01 ? 5.6 * value + .125 : .241514 * Math.log10(value + .00873) + .598206);
}

export function parseCube(text) {
 const error = () => Error('请选择完整的 2–65 格 3D .cube LUT（V-Log/V-Gamut 输入、Rec.709 输出）。');
 let size = 0, values, count = 0;
 const directives = new Map();
 for (const line of text.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || /^TITLE\s+"[^"]*"\s*(?:#.*)?$/i.test(trimmed)) continue;
  const [head, ...rest] = trimmed.split('#', 1)[0].trim().split(/\s+/);
  if (['LUT_3D_SIZE', 'DOMAIN_MIN', 'DOMAIN_MAX', 'LUT_3D_INPUT_RANGE'].includes(head)) {
   const length = head === 'LUT_3D_SIZE' ? 1 : head === 'LUT_3D_INPUT_RANGE' ? 2 : 3;
   const numbers = rest.map(Number);
   if (count || directives.has(head) || rest.length !== length || numbers.some(n => !Number.isFinite(n))) throw error();
   directives.set(head, numbers);
   if (head === 'LUT_3D_SIZE') {
    [size] = numbers;
    if (!Number.isInteger(size) || size < 2 || size > 65) throw error();
    values = new Float32Array(size ** 3 * 3);
   }
  } else {
   const sample = [head, ...rest].map(Number);
   if (!values || count >= values.length || sample.length !== 3 || sample.some(n => !Number.isFinite(n) || Math.abs(n) > 65504)) throw error();
   values.set(sample, count);
   count += 3;
  }
 }
 if (!values || count !== values.length) throw error();
 const range = directives.get('LUT_3D_INPUT_RANGE');
 if (range && (directives.has('DOMAIN_MIN') || directives.has('DOMAIN_MAX'))) throw error();
 const min = directives.get('DOMAIN_MIN') || Array(3).fill(range?.[0] ?? 0);
 const max = directives.get('DOMAIN_MAX') || Array(3).fill(range?.[1] ?? 1);
 const span = max.map((n, i) => n - min[i]);
 if (span.some(n => !(n > 0) || !Number.isFinite(n) || !Number.isFinite((size - 1) / n))) throw error();
 return { size, min, scale: span.map(n => (size - 1) / n), values };
}

// Red is the fastest-moving dimension. Use tetrahedral interpolation.
export function sampleCube(lut, r, g, b, out) {
 const {size, min, scale, values} = lut, edge = size - 1;
 const x = Math.min(edge, Math.max(0, (r - min[0]) * scale[0]));
 const y = Math.min(edge, Math.max(0, (g - min[1]) * scale[1]));
 const z = Math.min(edge, Math.max(0, (b - min[2]) * scale[2]));
 const i = Math.min(edge - 1, Math.floor(x)), j = Math.min(edge - 1, Math.floor(y)), k = Math.min(edge - 1, Math.floor(z));
 const dx = x - i, dy = y - j, dz = z - k, sx = 3, sy = size * 3, sz = size * size * 3;
 const vertex = (i + size * (j + size * k)) * 3;
 let a, c, high, mid, low;
 if (dx >= dy && dy >= dz) { a = sx; c = sx + sy; high = dx; mid = dy; low = dz; }
 else if (dx >= dz && dz >= dy) { a = sx; c = sx + sz; high = dx; mid = dz; low = dy; }
 else if (dz >= dx && dx >= dy) { a = sz; c = sz + sx; high = dz; mid = dx; low = dy; }
 else if (dy >= dx && dx >= dz) { a = sy; c = sy + sx; high = dy; mid = dx; low = dz; }
 else if (dy >= dz && dz >= dx) { a = sy; c = sy + sz; high = dy; mid = dz; low = dx; }
 else { a = sz; c = sz + sy; high = dz; mid = dy; low = dx; }
 for (let channel = 0; channel < 3; channel++) {
  const p = vertex + channel;
  out[channel] = values[p] * (1 - high) + values[p + a] * (high - mid)
   + values[p + c] * (mid - low) + values[p + sx + sy + sz] * low;
 }
}

export function renderVLog(image, cameraTo709, exposure, lut) {
 const {data, colors} = image;
 if (colors !== 1 && (!Array.isArray(cameraTo709) || cameraTo709.length !== 3 ||
     cameraTo709.some(row => !row || row.length < colors || Array.from(row).slice(0, colors).some(n => !Number.isFinite(n))))) {
  throw Error('此相机缺少可用的 RAW 颜色矩阵，无法生成 V-Log。');
 }
 const gain = 2 ** exposure / 65535;
 const transform = linear709ToVGamut.map(row => Array.from({length: colors}, (_, i) =>
  (colors === 1 ? 1 : row.reduce((sum, value, k) => sum + value * cameraTo709[k][i], 0)) * gain));
 const pixels = data.length / colors;
 // Color conversion uses the unclipped floating-point channel values from the camera matrix.
 const master = colors === 3 ? data : new Uint16Array(pixels * 3);
 const preview = new Uint8Array(pixels * 3), color = new Float64Array(3);
 for (let i = 0, p = 0; i < data.length; i += colors, p += 3) {
  for (let c = 0; c < 3; c++) {
   const row = transform[c];
   let linear = 0;
   for (let j = 0; j < colors; j++) linear += row[j] * data[i + j];
   color[c] = encodeVLog(linear);
  }
  if (lut) sampleCube(lut, color[0], color[1], color[2], color);
  for (let c = 0; c < 3; c++) {
   const value = unit(color[c]);
   master[p + c] = Math.round(value * 65535);
   preview[p + c] = Math.round(value * 255);
  }
 }
 return {master, preview};
}
