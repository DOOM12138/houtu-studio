// Local frequency separation in the existing 8-bit sRGB editing space.
// Low frequencies are alpha-weighted Gaussian approximations; signed residuals
// stay in floating point until recombination. Tiles bound export memory use.
import {strokeDistance} from './manual-neutral.js';

export const FREQUENCY_TOOLS = new Set(['low-smooth', 'low-clone', 'high-clone', 'high-soften']);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const TILE = 256;

function radii(sigma) {
  const ideal = Math.sqrt(4 * sigma * sigma + 1);
  let lower = Math.floor(ideal);
  if (!(lower % 2)) lower--;
  lower = Math.max(1, lower);
  const count = clamp(Math.round((12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4)), 0, 3);
  return Array.from({length: 3}, (_, i) => ((i < count ? lower : lower + 2) - 1) / 2);
}

function boxPass(input, output, width, height, radius, horizontal) {
  if (!radius) { output.set(input); return; }
  const length = horizontal ? width : height, lines = horizontal ? height : width;
  const stride = horizontal ? 4 : width * 4, norm = 1 / (radius * 2 + 1);
  for (let line = 0; line < lines; line++) {
    const start = horizontal ? line * width * 4 : line * 4;
    const sums = [0, 0, 0, 0];
    for (let p = -radius; p <= radius; p++) {
      const at = start + clamp(p, 0, length - 1) * stride;
      for (let c = 0; c < 4; c++) sums[c] += input[at + c];
    }
    for (let p = 0; p < length; p++) {
      const at = start + p * stride;
      for (let c = 0; c < 4; c++) output[at + c] = sums[c] * norm;
      const remove = start + clamp(p - radius, 0, length - 1) * stride;
      const add = start + clamp(p + radius + 1, 0, length - 1) * stride;
      for (let c = 0; c < 4; c++) sums[c] += input[add + c] - input[remove + c];
    }
  }
}

function blurRegion(source, width, height, rect, sigma, soften = false) {
  const boxes = radii(sigma), halo = boxes.reduce((a, b) => a + b, 0) * (soften ? 2 : 1) + 2;
  const left = Math.max(0, rect.left - halo), top = Math.max(0, rect.top - halo);
  const right = Math.min(width - 1, rect.right + halo), bottom = Math.min(height - 1, rect.bottom + halo);
  const w = right - left + 1, h = bottom - top + 1;
  let data = new Float32Array(w * h * 4), scratch = new Float32Array(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y + top) * width + x + left) * 4, o = (y * w + x) * 4, alpha = source[i + 3];
    for (let c = 0; c < 3; c++) data[o + c] = source[i + c] * alpha / 255;
    data[o + 3] = alpha;
  }
  const pass = () => { for (const radius of boxes) {
    boxPass(data, scratch, w, h, radius, true); [data, scratch] = [scratch, data];
    boxPass(data, scratch, w, h, radius, false); [data, scratch] = [scratch, data];
  }};
  const rw = rect.right - rect.left + 1, rh = rect.bottom - rect.top + 1;
  const extract = () => {
    const result = new Float32Array(rw * rh * 3);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const i = ((y + rect.top - top) * w + x + rect.left - left) * 4;
      const raw = ((y + rect.top) * width + x + rect.left) * 4, o = (y * rw + x) * 3;
      for (let c = 0; c < 3; c++) result[o + c] = data[i + 3] > .0001 ? data[i + c] * 255 / data[i + 3] : source[raw + c];
    }
    return result;
  };
  pass(); const low = extract();
  let soft = null; if (soften) { pass(); soft = extract(); }
  return {low, soft, rect, width: rw};
}

function sampleRGB(source, width, height, x, y) {
  x = clamp(x, 0, width - 1); y = clamp(y, 0, height - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  let alpha = 0; const rgb = [0, 0, 0];
  for (const [px, py, weight] of [[x0,y0,(1-fx)*(1-fy)],[Math.min(x0+1,width-1),y0,fx*(1-fy)],[x0,Math.min(y0+1,height-1),(1-fx)*fy],[Math.min(x0+1,width-1),Math.min(y0+1,height-1),fx*fy]]) {
    if (!weight) continue;
    const at = (py * width + px) * 4, a = source[at + 3] / 255;
    alpha += weight * a; for (let c = 0; c < 3; c++) rgb[c] += source[at + c] * weight * a;
  }
  return {rgb: alpha ? rgb.map(v => v / alpha) : rgb, alpha};
}

function sampleLow(patch, source, width, height, x, y) {
  x = clamp(x, 0, width - 1); y = clamp(y, 0, height - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x-x0, fy = y-y0;
  let alpha = 0; const rgb = [0,0,0];
  for (const [px,py,weight] of [[x0,y0,(1-fx)*(1-fy)],[Math.min(x0+1,width-1),y0,fx*(1-fy)],[x0,Math.min(y0+1,height-1),(1-fx)*fy],[Math.min(x0+1,width-1),Math.min(y0+1,height-1),fx*fy]]) {
    if (!weight) continue;
    const at = ((py-patch.rect.top)*patch.width+px-patch.rect.left)*3, a = source[(py*width+px)*4+3]/255;
    alpha += weight*a; for (let c=0;c<3;c++) rgb[c] += patch.low[at+c]*weight*a;
  }
  return alpha ? rgb.map(v=>v/alpha) : rgb;
}

export function frequencySigma(separation, width, height) {
  const sigma = separation * Math.min(width, height);
  if (!Number.isFinite(sigma) || sigma < 0 || sigma > 128) throw Error('分离半径最多128个原图像素。');
  return sigma;
}

export function applyFrequencyStroke(source, pixels, width, height, op, protection) {
  const radius = Math.max(2, op.r * Math.min(width, height)), sigma = frequencySigma(op.separation, width, height);
  const xs=op.points.map(p=>p[0]*width),ys=op.points.map(p=>p[1]*height);
  const bounds={left:Math.max(0,Math.floor(Math.min(...xs)-radius)),right:Math.min(width-1,Math.ceil(Math.max(...xs)+radius)),top:Math.max(0,Math.floor(Math.min(...ys)-radius)),bottom:Math.min(height-1,Math.ceil(Math.max(...ys)+radius))};
  const cloning = op.tool.endsWith('-clone'), dx=cloning?(op.sample[0]-op.points[0][0])*width:0,dy=cloning?(op.sample[1]-op.points[0][1])*height:0;
  for(let top=bounds.top;top<=bounds.bottom;top+=TILE)for(let left=bounds.left;left<=bounds.right;left+=TILE){
    const rect={left,top,right:Math.min(bounds.right,left+TILE-1),bottom:Math.min(bounds.bottom,top+TILE-1)},tw=rect.right-left+1,th=rect.bottom-top+1;
    const path=op.continuous?strokeDistance(op.points,width,height,{left:rect.left-radius,top:rect.top-radius,right:rect.right+radius,bottom:rect.bottom+radius}):null;
    if(op.continuous&&!path)continue;
    if(!op.continuous&&!op.points.some(p=>{const x=p[0]*width,y=p[1]*height;return x>=rect.left-radius&&x<=rect.right+radius&&y>=rect.top-radius&&y<=rect.bottom+radius;}))continue;
    const amounts=new Float32Array(tw*th);let any=false;
    for(let y=top;y<=rect.bottom;y++)for(let x=left;x<=rect.right;x++){
      const at=y*width+x;if(protection[at]===255||!source[at*4+3])continue;let weight=0;
      if(path){const d=path(x,y);if(d<radius*radius)weight=(1-d/(radius*radius))**3;}
      else for(const p of op.points){const d=(x-p[0]*width)**2+(y-p[1]*height)**2;if(d<radius*radius)weight=Math.max(weight,(1-d/(radius*radius))**3);}
      const amount=weight*op.strength*(1-protection[at]/255);amounts[(y-top)*tw+x-left]=amount;any ||= amount>0;
    }
    if(!any)continue;
    const patch=blurRegion(source,width,height,rect,sigma,op.tool==='low-smooth');
    const shifted=cloning?blurRegion(source,width,height,{left:Math.floor(clamp(left+dx,0,width-1)),top:Math.floor(clamp(top+dy,0,height-1)),right:Math.min(width-1,Math.ceil(clamp(rect.right+dx,0,width-1))),bottom:Math.min(height-1,Math.ceil(clamp(rect.bottom+dy,0,height-1)))},sigma):null;
    for(let y=top;y<=rect.bottom;y++)for(let x=left;x<=rect.right;x++){
      const p=(y-top)*tw+x-left,amount=amounts[p];if(!amount)continue;const at=(y*width+x)*4,low=p*3;
      let reference=null,sampled=null;if(cloning){sampled=sampleRGB(source,width,height,x+dx,y+dy);if(sampled.alpha<.001)continue;reference=sampleLow(shifted,source,width,height,x+dx,y+dy);}
      for(let c=0;c<3;c++){
        const base=source[at+c],l=patch.low[low+c];let target;
        if(op.tool==='low-smooth')target=base-l+patch.soft[low+c];
        else if(op.tool==='low-clone')target=base-l+reference[c];
        else if(op.tool==='high-clone')target=l+sampled.rgb[c]-reference[c];
        else target=l;
        pixels[at+c]=Math.round(clamp(base+(target-base)*amount,0,255));
      }
    }
  }
}

export function frequencyView(source, width, height, separation, high = false) {
  const sigma=frequencySigma(separation,width,height),out=source.slice();
  for(let top=0;top<height;top+=TILE)for(let left=0;left<width;left+=TILE){
    const rect={left,top,right:Math.min(width-1,left+TILE-1),bottom:Math.min(height-1,top+TILE-1)},patch=blurRegion(source,width,height,rect,sigma);
    for(let y=top;y<=rect.bottom;y++)for(let x=left;x<=rect.right;x++){
      const at=(y*width+x)*4,p=((y-top)*patch.width+x-left)*3;
      for(let c=0;c<3;c++)out[at+c]=Math.round(clamp(high?127.5+(source[at+c]-patch.low[p+c])*.5:patch.low[p+c],0,255));
    }
  }
  return out;
}
