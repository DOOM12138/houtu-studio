import {OUTPAINT_RATIOS,outpaintLayout,outpaintCanvas} from './outpaint-layout.js';

export function createOutpaintControls({mount,prefix='task',getImage=()=>null,onChange=()=>{},value={}}){
 let lastValid={padding:20,direction:'all'};
 const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const fields=node('div');fields.className='outpaint-fields';
 function field(key,label,{options,min,max,initial}={}){
  const wrap=node('label',label),input=node(options?'select':'input');input.id=prefix+'-'+key;
  if(options)for(const [v,text]of options)input.add(new Option(text,v));else{input.type='number';input.min=min;input.max=max;input.step='1';input.value=initial;}
  wrap.append(input);fields.append(wrap);return {input,wrap};
 }
 const mode=field('canvas-mode','扩图方式',{options:[['padding','按边扩展'],['ratio','指定画幅']]}),direction=field('direction','扩图方向',{options:[['all','四周'],['left','左侧'],['right','右侧'],['top','上方'],['bottom','下方'],['custom','四边分别设置']]}),padding=field('padding','每条选中边 · 原图长边 %',{min:5,max:50,initial:20}),ratio=field('canvas-ratio','目标画幅 · 原图居中',{options:OUTPAINT_RATIOS.map(v=>[v,v])});
 const sides={};for(const [side,label]of [['left','左侧'],['right','右侧'],['top','上方'],['bottom','下方']])sides[side]=field('canvas-'+side,label+' · 原图长边 %',{min:0,max:100,initial:20});
 const info=node('output');info.id=prefix+'-canvas-info';info.className='outpaint-info';info.setAttribute('aria-live','polite');
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.id=prefix+'-canvas-preview';svg.classList.add('outpaint-preview');svg.setAttribute('role','img');svg.setAttribute('aria-label','扩图画布预览，标框内为保留的原图');
 const background=document.createElementNS(ns,'rect'),image=document.createElementNS(ns,'image'),outline=document.createElementNS(ns,'rect');background.setAttribute('class','outpaint-new-area');outline.setAttribute('class','outpaint-original-boundary');outline.setAttribute('fill','none');svg.append(background,image,outline);
 const note=node('p','这里只预览画布范围；原图区域保留，新增区域在点击开始后由AI补全。修改比例或画幅不会自动生成。');note.className='hint field-hint';mount.replaceChildren(fields,info,svg,note);
 function read(){
  const task={padding:Number(padding.input.value),direction:direction.input.value==='custom'?'all':direction.input.value};
  if(mode.input.value==='ratio')task.canvas={mode:'ratio',ratio:ratio.input.value};
  else if(direction.input.value==='custom')task.canvas={mode:'sides',...Object.fromEntries(Object.entries(sides).map(([key,{input}])=>[key,Number(input.value)]))};
  if(task.canvas)task.padding=20;
  return task;
 }
 // Text entry can briefly be empty. Other editors/history receive only a
 // validated snapshot; the preview and explicit-start gate still use raw input.
 function safeRead(){
  const task=read();
  try{
   if(task.canvas)outpaintCanvas(task.canvas);else outpaintLayout(1,1,task);
   const image=getImage(),isImage=image?.tagName==='IMG',width=isImage?image.naturalWidth:image?.width,height=isImage?image.naturalHeight:image?.height;
   if(width&&height)outpaintLayout(width,height,task);
   lastValid=structuredClone(task);return task;
  }catch{return structuredClone(lastValid);}
 }
 function refresh(){
  const byRatio=mode.input.value==='ratio',custom=!byRatio&&direction.input.value==='custom';direction.wrap.hidden=byRatio;padding.wrap.hidden=byRatio||custom;ratio.wrap.hidden=!byRatio;for(const side of Object.values(sides))side.wrap.hidden=!custom;
  const source=getImage(),isImage=source?.tagName==='IMG',width=isImage?source.naturalWidth:source?.width,height=isImage?source.naturalHeight:source?.height;
  svg.hidden=true;delete info.dataset.width;delete info.dataset.height;
  if(!width||!height){info.textContent='打开图片后显示预计画布。';info.classList.remove('error');return;}
  try{
   const layout=outpaintLayout(width,height,read());info.dataset.width=layout.width;info.dataset.height=layout.height;info.textContent=width+' × '+height+' → '+layout.width+' × '+layout.height+' · '+(layout.width*layout.height/1000000).toFixed(2)+' 百万像素';info.classList.remove('error');
   svg.setAttribute('viewBox','0 0 '+layout.width+' '+layout.height);background.setAttribute('width',layout.width);background.setAttribute('height',layout.height);
   for(const target of [image,outline])for(const [key,n]of Object.entries({x:layout.left,y:layout.top,width,height}))target.setAttribute(key,n);
   const src=source.currentSrc||source.src;if(src)image.setAttribute('href',src);else image.removeAttribute('href');outline.setAttribute('stroke-width',Math.max(layout.width,layout.height)/220);svg.hidden=false;
  }catch(error){info.textContent=error.message;info.classList.add('error');}
 }
 function hydrate(task={}){
  padding.input.value=task.padding??20;direction.input.value=task.direction??'all';mode.input.value=task.canvas?.mode==='ratio'?'ratio':'padding';ratio.input.value=task.canvas?.ratio||'4:5';
  if(task.canvas?.mode==='sides'){direction.input.value='custom';for(const [side,{input}]of Object.entries(sides))input.value=task.canvas[side]??0;}
  refresh();
 }
 for(const {input}of [mode,direction,padding,ratio,...Object.values(sides)])input.addEventListener('input',()=>{refresh();onChange(read());});
 const imageLoaded=event=>{if(event.target===getImage())refresh();};document.addEventListener('load',imageLoaded,true);
 hydrate(value);return {read,safeRead,refresh,hydrate,valid:()=>Boolean(info.dataset.width),dispose:()=>document.removeEventListener('load',imageLoaded,true)};
}
