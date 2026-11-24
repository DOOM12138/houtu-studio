import sharp from 'sharp';

let large;
export function largeJpegFixture() {
  return large ||= (async () => {
    const width = 2600, height = 2600;
    const bytes = Buffer.alloc(width * height * 3);
    let state = 0x31415927;
    for (let i = 0; i < bytes.length; i++) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      bytes[i] = state & 255;
    }
    return sharp(bytes, { raw: { width, height, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();
  })();
}
