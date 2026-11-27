// Shared, deterministic sRGB engine. Preview, full-size export and LUT use this file.
export const HUES = ['红','橙','黄','绿','青','蓝','紫','洋红'];
export const LIMITS = { exposure:[-4,4,.01], temperature:[-100,100,1], tint:[-100,100,1], contrast:[-100,100,1], highlights:[-100,100,1], shadows:[-100,100,1], whites:[-100,100,1], blacks:[-100,100,1], saturation:[-100,100,1], vibrance:[-100,100,1] };
export const clamp = (x,a=0,b=1) => Math.min(b,Math.max(a,x));
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
export function settings(input={}) {
  const out={}; for(const [key,[min,max]] of Object.entries(LIMITS)) out[key]=clamp(finite(input[key]),min,max);
  out.hsl=Array.from({length:8},(_,i)=>Array.from({length:3},(_,j)=>clamp(finite(input.hsl?.[i]?.[j]),-100,100)));
  out.curves=Object.fromEntries(['rgb','r','g','b'].map(k=>[k,Array.from({length:5},(_,i)=>clamp(finite(input.curves?.[k]?.[i],i/4),0,1))]));
  out.grade=Array.from({length:3},(_,i)=>[clamp(finite(input.grade?.[i]?.[0]),0,360),clamp(finite(input.grade?.[i]?.[1]),0,100)]);
  return out;
}
export function rgbToHsl(r,g,b) {
  const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,d=max-min;
  if(d<1e-8)return [0,0,l];
  let h=max===r?((g-b)/d+(g<b?6:0)):max===g?(b-r)/d+2:(r-g)/d+4;
  return [h/6,d/(1-Math.abs(2*l-1)),l];
}
export function hslToRgb(h,s,l) {
  h=((h%1)+1)%1; const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h*6)%2-1)),m=l-c/2;
  return (h<1/6?[c,x,0]:h<2/6?[x,c,0]:h<3/6?[0,c,x]:h<4/6?[0,x,c]:h<5/6?[x,0,c]:[c,0,x]).map(v=>v+m);
}
const linear=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
const srgb=x=>x<=.0031308?x*12.92:1.055*Math.max(0,x)**(1/2.4)-.055;
export function whiteBalance(rgb){const [r,g,b]=rgb.map(v=>Math.log(Math.max(1e-6,linear(v))));const temperature=(b-r)/.004,tint=(g-(r+b)/2)/.0015;return {temperature:clamp(temperature,-100,100),tint:clamp(tint,-100,100),limited:Math.abs(temperature)>100||Math.abs(tint)>100};}
const curve=(x,points)=>{x=clamp(x)*4; const i=Math.min(3,Math.floor(x)); return points[i]+(points[i+1]-points[i])*(x-i);};
export function compile(input) {
  const s=settings(input), exp=2**s.exposure;
  const identity=Object.keys(LIMITS).every(k=>s[k]===0)&&s.hsl.flat().every(v=>v===0)&&Object.values(s.curves).every(p=>p.every((v,i)=>v===i/4))&&s.grade.every(p=>p[1]===0);
  const tones=s.grade.map(([h,amount])=>hslToRgb(h/360,1,.5).map(v=>(v-.5)*amount/100*.22));
  return Object.assign((rgb)=>{
    if(identity)return rgb;
    let [r,g,b]=rgb.map(linear); r*=exp*Math.exp(s.temperature*.002+s.tint*.0005); g*=exp*Math.exp(-s.tint*.001); b*=exp*Math.exp(-s.temperature*.002+s.tint*.0005);
    const lum=.2126*r+.7152*g+.0722*b, y=clamp(srgb(lum));
    const shift=(s.shadows/100*(1-y)**2+s.highlights/100*y**2)*.28 + s.blacks/100*(1-y)**4*.15+s.whites/100*y**4*.25;
    [r,g,b]=[r,g,b].map(v=>clamp((srgb(v)-.5)*(1+s.contrast/125)+.5+shift));
    let [h,sat,l]=rgbToHsl(r,g,b); const centers=[0,30,60,120,180,240,280,320]; let dh=0,ds=0,dl=0,weight=0;
    centers.forEach((c,i)=>{const d=Math.min(Math.abs(h*360-c),360-Math.abs(h*360-c));const w=Math.max(0,1-d/45);dh+=s.hsl[i][0]*w;ds+=s.hsl[i][1]*w;dl+=s.hsl[i][2]*w;weight+=w;});
    if(weight){h+=dh/weight/600*sat; sat=clamp(sat*(1+ds/weight/100));l=clamp(l+dl/weight/100*.28*sat);}
    sat=clamp(sat*(1+s.saturation/100)*(1+s.vibrance/100*(1-sat)));
    [r,g,b]=hslToRgb(h,sat,l); const w=[(1-y)**2,2*y*(1-y),y*y];
    return [r,g,b].map((v,c)=>clamp(curve(curve(clamp(v+tones.reduce((n,t,i)=>n+t[c]*w[i],0)),s.curves[['r','g','b'][c]]),s.curves.rgb)));
  },{identity});
}
export function render(data,width,height,global,layers=[]) {
  const result=new Uint8ClampedArray(data.length), base=compile(global);
  const local=layers.filter(l=>l.enabled!==false&&l.alpha).map(l=>({...l,fn:compile(l.settings)}));
  for(let p=0,i=0;p<width*height;p++,i+=4){
    let rgb=base([data[i]/255,data[i+1]/255,data[i+2]/255]);
    for(const l of local){const a=clamp(l.alpha[p]/255*(l.opacity??1));if(a&&!l.fn.identity){const next=l.fn(rgb);rgb=rgb.map((v,c)=>v+(next[c]-v)*a);}}
    result[i]=rgb[0]*255; result[i+1]=rgb[1]*255; result[i+2]=rgb[2]*255; result[i+3]=data[i+3];
  }return result;
}
export function analyze(data) {
  const histogram=Array.from({length:3},()=>Array(256).fill(0)), hues=Array(8).fill(0),sum=[0,0,0];let n=0,saturation=0,luma=0,clippedDark=0,clippedLight=0;
  const stride=Math.max(1,Math.floor(data.length/4/80000));
  for(let i=0;i<data.length;i+=4*stride){if(data[i+3]<16)continue;const rgb=[data[i],data[i+1],data[i+2]];rgb.forEach((v,c)=>{histogram[c][v]++;sum[c]+=v;});const [h,s,l]=rgbToHsl(...rgb.map(v=>v/255)); hues[Math.round(h*8)%8]+=s;saturation+=s;luma+=l;clippedDark+=Math.max(...rgb)<5?1:0;clippedLight+=Math.min(...rgb)>250?1:0;n++;}
  n=Math.max(n,1);const mean=sum.map(v=>v/n/255);return {histogram,hues,mean,saturation:saturation/n,lightness:luma/n,warmth:mean[0]-mean[2],clippedDark:clippedDark/n,clippedLight:clippedLight/n};
}
export function referenceColorAnalysis(data, width, height) {
  const stats = analyze(data);
  const grid = [];
  // Average a few locations per cell so the comparison tolerates resampling.
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const sums = [0, 0, 0];
      let n = 0;
      for (const yy of [.18, .5, .82]) for (const xx of [.18, .5, .82]) {
        const xxPixel = Math.floor((x + xx) * width / 12);
        const yyPixel = Math.floor((y + yy) * height / 12);
        const at = (yyPixel * width + xxPixel) * 4;
        if (data[at + 3] < 240) continue;
        for (let c = 0; c < 3; c++) sums[c] += data[at + c];
        n++;
      }
      grid.push(n >= 7 ? sums.map(sum => Math.round(sum / n)) : null);
    }
  }
  return { ...stats, layout: { ratio: width / height, grid } };
}

const sampleLuma = rgb => (rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722) / 255;
function sameLayout(source, reference) {
  const a = source.layout, b = reference.layout;
  if (!a || !b || a.grid?.length !== 144 || b.grid?.length !== 144
    || !Number.isFinite(a.ratio) || !Number.isFinite(b.ratio) || Math.abs(a.ratio / b.ratio - 1) > .015) return null;

  const pairs = a.grid.flatMap((value, i) => value && b.grid[i] ? [[value, b.grid[i]]] : []);
  if (pairs.length < 105) return null;
  const mean = [0, 0];
  for (const pair of pairs) for (let c = 0; c < 2; c++) mean[c] += sampleLuma(pair[c]) / pairs.length;
  let xx = 0, yy = 0, xy = 0;
  for (const [p, q] of pairs) {
    const x = sampleLuma(p) - mean[0], y = sampleLuma(q) - mean[1];
    xx += x * x; yy += y * y; xy += x * y;
  }
  return Math.min(xx, yy) / pairs.length >= .0064 && xy / Math.sqrt(xx * yy) >= .96 ? pairs : null;
}

function distributions(stats) {
  return stats.histogram.map(row => {
    const cumulative = [];
    let total = 0;
    for (const count of row) cumulative.push(total += count);
    return {
      percentile: x => total ? (cumulative[x] - row[x] / 2) / total : .5,
      sample: p => {
        let lo = 0, hi = 255;
        while (lo < hi) {
          const i = Math.floor((lo + hi) / 2);
          if (cumulative[i] >= total * p) hi = i;
          else lo = i + 1;
        }
        return lo;
      },
    };
  });
}
function matchedCurves(source, reference, pairs, strength) {
  const input = distributions(source);
  const goal = distributions(reference);
  const result = settings();
  for (let c = 0; c < 3; c++) {
    const values = result.curves['rgb'[c]];
    for (let k = 1; k < 4; k++) {
      const center = Math.round(k * 255 / 4);
      const transfer = pairs.flatMap(([a, b]) => {
        const distance = Math.abs(a[c] - center);
        return distance < 42 ? [b[c] - a[c]] : [];
      }).sort((a, b) => a - b);
      const p = input[c].percentile(center);
      const supported = p >= .07 && p <= .93;
      const distributionShift = goal[c].sample(p) - center;
      const localShift = transfer[Math.floor(transfer.length / 2)] ?? 0;
      const shift = supported ? (transfer.length >= 8 ? .58 * distributionShift + .42 * localShift : distributionShift) : localShift;
      values[k] = Math.max(values[k-1] + .032, k / 4 + strength * clamp(shift / 255, -.15, .15));
    }
  }
  return result;
}

export function matchReference(source,reference,amount=.7) {
  amount=clamp(amount);
  const sameStats = source.lightness === reference.lightness && source.saturation === reference.saturation
    && source.histogram && reference.histogram
    && source.histogram.every((row,c)=>row.every((n,i)=>n===reference.histogram[c]?.[i]));
  if (!amount || sameStats) return settings();
  const pairs = sameLayout(source, reference);
  if (pairs) return matchedCurves(source, reference, pairs, amount);

  const s=settings();s.exposure=clamp(Math.log2((reference.lightness+.05)/(source.lightness+.05))*amount,-1.5,1.5);
  s.temperature=clamp((reference.warmth-source.warmth)*160*amount,-45,45);
  s.tint=clamp(((reference.mean[0]+reference.mean[2])/2-reference.mean[1]-(source.mean[0]+source.mean[2])/2+source.mean[1])*150*amount,-35,35);
  s.saturation=clamp((reference.saturation-source.saturation)*110*amount,-35,35);
  const lightness=clamp(Math.abs(reference.lightness-source.lightness)*5);
  s.highlights=-15*amount*lightness;s.shadows=8*amount*lightness;return settings(s);
}
export const BUILTINS=[
  {id:'clear',name:'清透日光',description:'温和提亮，保留肤色与干净白色',settings:settings({exposure:.12,temperature:4,highlights:-20,shadows:14,vibrance:8}),target:[.66,.28,.03]},
  {id:'film',name:'暖调胶片',description:'柔和高光、微暖中间调与轻抬黑位',settings:settings({temperature:12,contrast:-8,highlights:-24,blacks:12,saturation:-8,grade:[[215,12],[35,8],[45,10]]}),target:[.48,.28,.09]},
  {id:'cinema',name:'冷暖叙事',description:'冷影暖光，控制肤色饱和度',settings:settings({contrast:12,highlights:-18,shadows:7,saturation:-7,grade:[[205,24],[30,5],[40,17]]}),target:[.4,.3,-.02]},
  {id:'pastel',name:'柔雾二次元',description:'降低硬反差，抬起暗部，保留明快配色',settings:settings({contrast:-14,shadows:18,blacks:10,highlights:-10,vibrance:12,grade:[[270,8],[335,4],[45,5]]}),target:[.65,.38,.01]},
  {id:'night',name:'蓝调夜景',description:'压住高光，以蓝紫暗部集中视觉',settings:settings({exposure:-.18,temperature:-12,highlights:-26,contrast:8,grade:[[235,22],[265,8],[35,5]]}),target:[.27,.35,-.1]},
  {id:'neutral',name:'自然还原',description:'低介入，保留原图色彩关系',settings:settings({highlights:-8,shadows:6}),target:[.5,.24,0]},
];
export function recommend(a){return [...BUILTINS].sort((x,y)=>score(x)-score(y));function score(p){return Math.abs(a.lightness-p.target[0])+Math.abs(a.saturation-p.target[1])*.6+Math.abs(a.warmth-p.target[2])*2;}}
export function cube(input,size=17){const f=compile(input),lines=['TITLE "Houtu Studio sRGB global grade"',`LUT_3D_SIZE ${size}`,'DOMAIN_MIN 0 0 0','DOMAIN_MAX 1 1 1'];for(let b=0;b<size;b++)for(let g=0;g<size;g++)for(let r=0;r<size;r++)lines.push(f([r/(size-1),g/(size-1),b/(size-1)]).map(v=>v.toFixed(7)).join(' '));return lines.join('\n');}
