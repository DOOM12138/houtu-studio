import {createModelPicker} from '/model-picker.js';
import {manualOperations as validateStrokes} from '/manual-portrait-engine.js';
import {createAiDesk} from '/ai-desk.js';
import {PRESETS} from '/catalog.js';
import {registerWorkspaceEditor,saveWorkspaceImage,resetWorkspaceImage,trackWorkspaceInput} from '/workspace-continuation.js';
import {WorkflowClient} from '/color/workflow-client.js';
import {stepPicture} from '/workflow-pictures.js';
import {IMAGE_ACCEPT,RAW_EXTENSIONS,needsImageImport,extension} from '/image-formats.js';
import {MAX_IMAGE_UPLOAD_BYTES,IMAGE_UPLOAD_MESSAGE,DESKTOP_PHOTO_PIXELS,MOBILE_PHOTO_PIXELS} from '/upload-limits.js';
import {saveDraft,loadDrafts,loadDraft} from './drafts.js';
const aiDirectory=PRESETS.map(tool=>({...tool,aliases:{'remove-equipment':'去灯架 去器材','remove-people':'去路人','clear-background':'净场'}[tool.id]||''}));
'use strict';
const $ = id => document.getElementById(id);
let desk=null,csrf='',signedIn=false,imageRuntimeReady=true,boundBase='',rootMedia=null;
const isAndroid=Boolean(window.HoutuAndroid)||/Android/i.test(navigator.userAgent);
const photos = [];
const media = new Map();
const checked = new Set();
const sections = { color:'调色', portrait:'人物', layers:'图层', ai:'AI 修图', steps:'步骤' };
const choices = { color:'light', portrait:'gray', layers:'caption', ai:'expand' };
const ui = {
  section:'color', editing:'pan', brush:'gray-dodge', radius:.055, strength:.3,
  separation:8, target:'global', compare:false, original:false, split:50,
  batch:false, previewId:null, selectionDraft:null, draftStep:null,
  active:null, fit:null, panKey:false, holdOriginal:false, exporting:false
};
const icons = {
  search:'M20.5 20.5l-5-5 M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0',
  undo:'M8 5 3 10l5 5 M4 10h10a6 6 0 0 1 6 6v2',
  redo:'m16 5 5 5-5 5 M20 10H10a6 6 0 0 0-6 6v2',
  import:'M3 10V6h6l2 2h10v12H3z M12 17v-6m-3 3 3-3 3 3',
  export:'M5 13v7h14v-7 M12 15V3m-4 4 4-4 4 4',
  sliders:'M4 6h7m5 0h4 M4 12h2m5 0h9 M4 18h10m5 0h1 M11 3v6m-5 0v6m8 0v6',
  brush:'m10 14 9-10q1.5-1.5 2.5 0L14 16 M10 14l4 2 M10 14c-6 0-2 6-7 7 9 1 11-3 11-5',
  layers:'m3 8 9-5 9 5-9 5z M3 12l9 5 9-5 M3 16l9 5 9-5',
  spark:'m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  steps:'M5 6h14 M8 12h11 M11 18h8 M4 6v6h3v6h3',
  info:'M12 10v6m0-9v.4 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  image:'M3 4h18v16H3z M4 17l5-5 3 3 3-4 5 6 M8 8h.5',
  hand:'M7 13V7a1.5 1.5 0 0 1 3 0v5-8a1.5 1.5 0 0 1 3 0v8-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v8q0 6-6 6h-1q-3 0-5-3l-3-4q-1-2 1-2z',
  minus:'M5 12h14',plus:'M5 12h14m-7-7v14',
  compare:'M3 5h18v14H3z M12 3v18',film:'M3 5h18v14H3z M9 5v14m6-14v14',
  close:'m5 5 14 14M19 5 5 19'
};
function icon(name) {
  const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','icon');svg.setAttribute('aria-hidden','true');
  const line=document.createElementNS(ns,'path');line.setAttribute('d',icons[name]||'');svg.append(line);return svg;
}
for(const placeholder of document.querySelectorAll('[data-icon]')) placeholder.replaceWith(icon(placeholder.dataset.icon));

function element(tag, text, cls) {
  const node=document.createElement(tag);
  if(text!==undefined) node.textContent=text;
  if(cls) node.className=cls;
  return node;
}
function action(text, handler, cls, id) {
  const node=element('button',text,cls);node.type='button';
  if(id)node.id=id;node.addEventListener('click',handler);return node;
}
function clear(node) { node.replaceChildren();return node; }
function hint(text) { return element('p',text,'hint'); }
let toastTimer;
function announce(text) {
  $('toast').textContent=text;$('toast').hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3200);
}
function status(text, error=false) {
  $('ioState').textContent=text;$('ioState').dataset.error=String(error);
}
const bound=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const clone=value=>structuredClone(value);
function makePhoto(id,name,source) {
  return {id,name,source,width:0,height:0,thumbnail:null,
    viewport:{zoom:1,panX:0,panY:0},
    nodes:[{parent:null,label:'原始照片',action:null}],cursor:0,redo:{},
    ai:{ratio:'1:1',amount:3},rehearsal:null};
}
function freshEdits() {
  return {base:null,rawProfile:null,lutName:'',global:{},local:{},mask:null,strokes:[],caption:{value:'',opacity:80,visible:true}};
}
function applyEdit(state, edit) {
  if(edit.type==='ai-image'){Object.assign(state,freshEdits(),{base:edit.origin});return state;}
  if(edit.type==='raw-develop'){
    state.base=edit.origin;state.rawProfile=edit.profile;state.lutName=edit.lutName||'';
    return state;
  }
  if(edit.type==='tone') Object.assign(state[edit.target],edit.values);
  if(edit.type==='replace-tone') state.global={...edit.values};
  if(edit.type==='mask'){state.mask=edit.rect;if(!edit.rect)state.local={};}
  if(edit.type==='stroke') state.strokes.push(edit.stroke);
  if(edit.type==='caption') Object.assign(state.caption,edit.values);
  return state;
}
function chain(photo, id) {
  const result=[];
  for(let at=id;at!==null;at=photo.nodes[at].parent)result.push(at);
  return result.reverse();
}
function editsAt(photo,id) {
  const state=freshEdits();
  for(const at of chain(photo,id)) if(photo.nodes[at].action) applyEdit(state,photo.nodes[at].action);
  return state;
}
function currentPhoto(){return photos.find(p=>p.id===ui.active);}
function visibleEdits(){
  const photo=currentPhoto();if(!photo)return freshEdits();
  const state=editsAt(photo,ui.previewId??photo.cursor);
  return ui.draftStep?applyEdit(state,ui.draftStep):state;
}
function append(photo,label,edit) {
  const index=photo.nodes.length, parent=photo.cursor;
  photo.nodes.push({parent,label,action:clone(edit)});photo.redo[parent]=index;photo.cursor=index;safeDraft(photo);
}
function commit(label,edit,refreshPanel=false) {
  const photo=currentPhoto();if(!photo||ui.previewId!==null)return;
  const alreadyPreviewed=ui.draftStep&&JSON.stringify(ui.draftStep)===JSON.stringify(edit);
  ui.draftStep=null;
  const before=editsAt(photo,photo.cursor);
  const next=applyEdit(clone(before),edit);
  if(JSON.stringify(before)===JSON.stringify(next))return;
  append(photo,label,edit);ui.started=true;$('introTip')?.remove();
  if(alreadyPreviewed||edit.type==='caption')paintCanvas();else requestPixels();
  updateChrome();
  if(refreshPanel)renderPanel();
}
function finishPendingEdit(){
  if(!ui.draftStep)return;
  const edit=ui.draftStep,label=edit.type==='caption'?'调整文字图层':edit.target==='local'?'调整局部色彩':'调整整体色彩';
  commit(label,edit);
}
function moveHistory(direction) {
  const photo=currentPhoto();if(!photo||ui.previewId!==null)return;finishPendingEdit();
  const next=direction<0?photo.nodes[photo.cursor].parent:photo.redo[photo.cursor];
  if(next===null||next===undefined)return;
  if(direction<0)photo.redo[next]=photo.cursor;
  photo.cursor=next;safeDraft(photo);refreshEdits();
}
function refreshEdits(){ui.draftStep=null;renderPanel();updateChrome();requestPixels();}
let switchTicket=0,importTicket=0;
async function obtainMedia(photo) {
  if(media.has(photo.id))return media.get(photo.id);
  const promise=(async()=>{
    const img=new Image();if(/^https:/.test(photo.source)){img.crossOrigin='anonymous';img.referrerPolicy='no-referrer';}img.src=photo.source;await img.decode();
    if(img.naturalWidth*img.naturalHeight>(isAndroid?MOBILE_PHOTO_PIXELS:DESKTOP_PHOTO_PIXELS))throw Error('此照片超过'+(isAndroid?'1200 万':'6400 万')+'像素的编辑上限。');
    photo.width=img.naturalWidth;photo.height=img.naturalHeight;
    const ratio=Math.min(1,960/Math.max(photo.width,photo.height));
    const proxy=document.createElement('canvas');proxy.width=Math.max(1,Math.round(photo.width*ratio));proxy.height=Math.max(1,Math.round(photo.height*ratio));
    const context=proxy.getContext('2d',{willReadFrequently:true});
    context.drawImage(img,0,0,proxy.width,proxy.height);
    return {img,proxy,raw:context.getImageData(0,0,proxy.width,proxy.height),result:proxy};
  })();
  media.set(photo.id,promise);
  try{
    const data=await promise;
    const keep=photo.width*photo.height>24_000_000?2:4;
    for(const k of media.keys()){if(media.size<=keep)break;if(k!==photo.id&&k!==ui.active&&k!==boundBase)media.delete(k);}
    return data;
  }catch(error){media.delete(photo.id);throw error;}
}
let activeMedia=null;
async function selectPhoto(id) {
  const photo=photos.find(p=>p.id===id);if(!photo)return;
  if(ui.batch){toggleChecked(id);return;}
  const ticket=++switchTicket;
  if(id===ui.active&&activeMedia)return;
  desk?.suspend();
  settleCanvasInput();finishPendingEdit();
  ui.active=id;ui.previewId=null;ui.draftStep=null;ui.selectionDraft=null;
  ui.original=false;ui.holdOriginal=false;ui.target='global';activeMedia=null;gestureReset();desk?.sourceChanged(null,photo.id);
  ++renderSerial;queuedRender=null;status('正在打开…');paintCanvas();updateChrome();renderPanel();renderFilm();
  try{
    if(photo.metadataOnly){const saved=await loadDraft(photo.id);if(ticket!==switchTicket)return;Object.assign(photo,saved,{metadataOnly:false,diskRevision:saved.revision});}
    const data=await obtainMedia(photo);if(ticket!==switchTicket)return;
    rootMedia=data;activeMedia=data;boundBase=refKey(photo.origin);saveActiveId(photo.id);desk?.sourceChanged(photo.origin,photo.id);const sourceCopy=data.raw.data.slice();
    worker.postMessage({kind:'bind',key:id,width:data.raw.width,height:data.raw.height,data:sourceCopy},[sourceCopy.buffer]);
    updateChrome();renderPanel();paintCanvas();requestPixels();
    // Inactive source files stay in the session. Limit decoded full-size images.
    if(media.size>3)for(const key of media.keys()){
      if(key!==ui.active&&media.size>3)media.delete(key);
    }
  }catch(error){if(ticket===switchTicket){status('打开失败',true);announce(error.message);}}
}
async function importPhotos(files){
  const intent=++importTicket,initialPhotoRequest=switchTicket,added=[],rejected=[];
  for(const file of files){
    let provisional=null;
    try{
      const count=photos.length,origin=await readSource(file),photo=makeFromRef(origin,file.name);if(photos.length>count)provisional=photo;
      const data=await obtainMedia(photo);
      const thumb=document.createElement('canvas');thumb.width=64;thumb.height=64;
      const side=Math.min(data.img.naturalWidth,data.img.naturalHeight);
      thumb.getContext('2d').drawImage(data.img,(data.img.naturalWidth-side)/2,(data.img.naturalHeight-side)/2,side,side,0,0,64,64);
      photo.thumbnail=thumb.toDataURL('image/png');safeDraft(photo);added.push(photo.id);
      if(added.length>1)media.delete(photo.id);
    }catch(e){if(provisional){const index=photos.indexOf(provisional);if(index>=0)photos.splice(index,1);media.delete(provisional.id);}rejected.push(file.name+'：'+e.message);}
  }
  if(added.length){
    if(intent===importTicket&&initialPhotoRequest===switchTicket){ui.batch=false;checked.clear();await selectPhoto(added[0]);}
    renderFilm();
  }
  if(rejected.length)announce(rejected.slice(0,2).join('；'));
}
function renderFilm(){
  const wrap=clear($('filmPhotos'));const current=currentPhoto();
  photos.forEach((photo,index)=>{
    const b=action('',()=>selectPhoto(photo.id),'tile'+(current===photo?' current':''));
    b.setAttribute('aria-label',photo.name);b.title=photo.name;
    if(ui.batch){b.setAttribute('role','checkbox');b.setAttribute('aria-checked',String(checked.has(photo.id)));}
    else if(photo===current)b.setAttribute('aria-current','true');
    const img=document.createElement('img');img.src=photo.thumbnail||photo.source;img.alt='';
    const desc=element('span');desc.append(element('b',photo.name),element('small',ui.batch?(checked.has(photo.id)?'已选为目标':'可选目标'):(photo.cursor?'已调整':'原始照片')));
    if(ui.batch&&photo===current){b.disabled=true;desc.lastChild.textContent='同步来源';}
    b.append(img,desc);wrap.append(b);
  });
  const add=action('',()=>$('file').click(),'add-photo');add.setAttribute('aria-label','导入更多照片');add.append(icon('plus'));wrap.append(add);
  $('filmCount').textContent='照片 '+photos.length;$('filmSummary').textContent=ui.batch?'选择接收调色的照片':(current?String(photos.indexOf(current)+1).padStart(2,'0')+' / '+String(photos.length).padStart(2,'0'):'');
  $('batch').textContent=ui.batch?'结束多选':'多选';$('sync').hidden=!ui.batch;$('sync').disabled=!checked.size;$('sync').textContent='同步调色（'+checked.size+'）';
}
function toggleChecked(id){if(id===ui.active)return;checked.has(id)?checked.delete(id):checked.add(id);renderFilm();}
$('batch').onclick=()=>{ui.batch=!ui.batch;checked.clear();renderFilm();};
$('sync').onclick=()=>{
  const photo=currentPhoto(),targets=photos.filter(p=>checked.has(p.id)&&p!==photo);if(!targets.length)return;
  const source=editsAt(photo,photo.cursor).global;
  openDialog('同步调色',body=>{
    body.append(element('p','将「'+photo.name+'」的整体调色应用到 '+targets.length+' 张照片。每张照片保留自己的局部蒙版和人物笔触。'));
    body.append(action('应用到这 '+targets.length+' 张',()=>{
      for(const target of targets)append(target,'同步调色 · '+photo.name,{type:'replace-tone',values:source});
      ui.batch=false;checked.clear();$('dialog').close();renderFilm();announce('已同步整体调色');
    },'primary wide'));
  });
};
$('open').onclick=()=>$('file').click();
$('file').onchange=event=>{const files=[...event.target.files];event.target.value='';if(files.length){resetWorkspaceImage();trackWorkspaceInput(importPhotos(files)).catch(e=>announce(e.message));}};
$('empty-import').onclick=()=>$('file').click();
document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});
document.addEventListener('drop',event=>{if(event.dataTransfer?.files.length){event.preventDefault();resetWorkspaceImage();trackWorkspaceInput(importPhotos([...event.dataTransfer.files])).catch(e=>announce(e.message));}});


const worker=new Worker('/workbench/worker.js',{type:'module'}),jobs=new Map();
let workerId=0,renderSerial=0,queuedRender=null,rendering=false;
function askWorker(payload,transfer=[]){
  return new Promise((resolve,reject)=>{
    const id=++workerId;jobs.set(id,{resolve,reject});
    try{worker.postMessage({...payload,id},transfer);}catch(error){jobs.delete(id);reject(error);}
  });
}
worker.onmessage=({data})=>{
  const job=jobs.get(data.id);if(!job)return;jobs.delete(data.id);
  data.error?job.reject(Error(data.error)):job.resolve(data);
};
worker.onerror=()=>{for(const job of jobs.values())job.reject(Error('画布计算中断，请重新打开工作台。'));jobs.clear();};
function hasPixelChanges(s){return s.strokes.length||Object.values(s.global).some(Boolean)||(s.mask&&Object.values(s.local).some(Boolean));}
function requestPixels(){
  const serial=++renderSerial,p=currentPhoto(),data=activeMedia;if(!p||!data)return;
  const state=visibleEdits();
  if(boundBase!==refKey(state.base||p.origin)){void loadEffective(p,state);return;}
  if(!hasPixelChanges(state)){queuedRender=null;data.result=data.proxy;paintCanvas();status(ui.previewId===null?'本机草稿':'历史预览');return;}
  queuedRender={serial,p,data,state};status('更新预览…');pumpRender();
}
async function pumpRender(){
  if(rendering||!queuedRender)return;
  const {serial,p,data,state}=queuedRender;queuedRender=null;rendering=true;
  try{
    const reply=await askWorker({kind:'preview',key:p.id,edits:state});
    if(serial!==renderSerial||ui.active!==p.id||activeMedia!==data)return;
    const canvas=data.output??(data.output=document.createElement('canvas'));
    canvas.width=data.proxy.width;canvas.height=data.proxy.height;
    canvas.getContext('2d').putImageData(new ImageData(reply.pixels,canvas.width,canvas.height),0,0);
    data.result=canvas;paintCanvas();ui.redrawLayout?.();status(ui.previewId===null?'本机草稿':'历史预览');
  }catch(error){if(serial===renderSerial){status('预览失败',true);announce(error.message);}}
  finally{rendering=false;pumpRender();}
}
const surface=$('stage'),ctx=surface.getContext('2d',{alpha:false});
const pointers=new Map();let gesture=null,brushCursor=null;
function gestureReset(){gesture=null;brushCursor=null;pointers.clear();ui.selectionDraft=null;}
function caption(context,layer,x,y,w,h){
  if(!layer.visible||!layer.value.trim())return;
  context.save();context.globalAlpha=layer.opacity/100;context.fillStyle='#fffefa';
  const size=Math.max(7,Math.round(Math.min(w,h)*.046));
  context.font='600 '+size+'px "Segoe UI","Microsoft YaHei",sans-serif';context.textBaseline='bottom';
  context.shadowColor='rgba(0,0,0,.62)';context.shadowBlur=Math.max(1,size*.1);
  context.fillText(layer.value,x+w*.055,y+h*.95,w*.9);context.restore();
}
function geometry(){
  const p=currentPhoto();if(!p?.width||!activeMedia)return null;
  const vw=surface.clientWidth,vh=surface.clientHeight,pad=vw<500?9:22;
  const fit=Math.min(Math.max(5,vw-2*pad)/p.width,Math.max(5,vh-2*pad)/p.height);
  const w=p.width*fit*p.viewport.zoom,h=p.height*fit*p.viewport.zoom;
  return {vw,vh,w,h,x:(vw-w)/2+p.viewport.panX*w,y:(vh-h)/2+p.viewport.panY*h};
}
function paintCanvas(){
  const vw=surface.clientWidth,vh=surface.clientHeight;if(!vw||!vh)return;
  const dpr=Math.min(2,devicePixelRatio||1),pw=Math.max(1,Math.round(vw*dpr)),ph=Math.max(1,Math.round(vh*dpr));
  if(surface.width!==pw||surface.height!==ph){surface.width=pw;surface.height=ph;}
  ctx.setTransform(pw/vw,0,0,ph/vh,0,0);ctx.fillStyle='#282a2c';ctx.fillRect(0,0,vw,vh);
  const g=geometry();ui.fit=g;if(!g)return;
  const {x,y,w,h}=g,s=visibleEdits(),original=ui.original||ui.holdOriginal;
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const drawOriginal=()=>{const src=rootMedia?.proxy||activeMedia.proxy,scale=Math.min(w/src.width,h/src.height);ctx.fillStyle='#282a2c';ctx.fillRect(x,y,w,h);ctx.drawImage(src,x+(w-src.width*scale)/2,y+(h-src.height*scale)/2,src.width*scale,src.height*scale);};
  if(original)drawOriginal();else ctx.drawImage(activeMedia.result,x,y,w,h);
  if(!original)caption(ctx,s.caption,x,y,w,h);
  const split=vw*ui.split/100;
  if(ui.compare&&!original){
    ctx.save();ctx.beginPath();ctx.rect(0,0,split,vh);ctx.clip();drawOriginal();ctx.restore();
    ctx.strokeStyle='white';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(split,0);ctx.lineTo(split,vh);ctx.stroke();
  }
  if((ui.target==='local'||ui.editing==='mask'||ui.showMask)&&!original){
    const m=ui.selectionDraft||s.mask;
    if(m){
      ctx.save();ctx.strokeStyle='#ffffff';ctx.lineWidth=1.4;ctx.setLineDash([5,4]);ctx.fillStyle='rgba(171,86,53,.12)';
      ctx.fillRect(x+w*m.x,y+h*m.y,w*m.w,h*m.h);ctx.strokeRect(x+w*m.x,y+h*m.y,w*m.w,h*m.h);ctx.restore();
    }
  }
  if(gesture?.type==='brush'&&gesture.points.length){
    ctx.save();ctx.strokeStyle='rgba(255,248,234,.78)';ctx.lineWidth=2;ctx.beginPath();
    gesture.points.forEach(([u,v],i)=>i?ctx.lineTo(x+w*u,y+h*v):ctx.moveTo(x+w*u,y+h*v));ctx.stroke();ctx.restore();
  }
  if(brushCursor&&ui.editing==='brush'&&!original){
    ctx.save();ctx.strokeStyle='#fffefa';ctx.lineWidth=1;ctx.shadowColor='#25231f';ctx.shadowBlur=2;ctx.beginPath();
    ctx.arc(brushCursor.x,brushCursor.y,Math.max(3,ui.radius*Math.min(w,h)),0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  let label=original?'原图':ui.previewId!==null?'历史预览 · '+currentPhoto().nodes[ui.previewId].label:ui.compare?'左侧原图 · 右侧成片':'';
  if(!label&&ui.editing==='mask')label='拖动框选局部调色范围';
  if(!label&&ui.editing==='brush')label='人物笔刷 · '+brushName(ui.brush);
  $('viewMode').hidden=!label;$('viewMode').textContent=label;$('dividerWrap').hidden=!ui.compare||original;
  surface.classList.toggle('brush',ui.editing!=='pan'&&!ui.panKey);
}
new ResizeObserver(paintCanvas).observe($('mat'));
function viewportPoint(e){const r=surface.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function imagePoint(point,clamped=false){
  const g=geometry();if(!g)return null;let u=(point.x-g.x)/g.w,v=(point.y-g.y)/g.h;
  if(!clamped&&(u<0||v<0||u>1||v>1))return null;
  return[bound(u,0,1),bound(v,0,1)];
}
function limitPan(p,g){
  const maxX=Math.max(0,(g.w+g.vw)/2-Math.min(g.w,g.vw)*.25)/g.w;
  const maxY=Math.max(0,(g.h+g.vh)/2-Math.min(g.h,g.vh)*.25)/g.h;
  p.viewport.panX=bound(p.viewport.panX,-maxX,maxX);p.viewport.panY=bound(p.viewport.panY,-maxY,maxY);
}
function zoomAround(point,factor,start=geometry()){
  const p=currentPhoto();if(!start||!p)return;
  const u=(point.x-start.x)/start.w,v=(point.y-start.y)/start.h;
  p.viewport.zoom=bound(p.viewport.zoom*factor,.3,8);const g=geometry();
  p.viewport.panX=(point.x-u*g.w-(g.vw-g.w)/2)/g.w;p.viewport.panY=(point.y-v*g.h-(g.vh-g.h)/2)/g.h;
  limitPan(p,g);updateViewport();
}
let viewportTimer;
function rememberViewport(){const p=currentPhoto();if(!p||p.metadataOnly)return;clearTimeout(viewportTimer);viewportTimer=setTimeout(()=>safeDraft(p),300);}
function updateViewport(){rememberViewport();const p=currentPhoto();$('zoomLabel').value=(p?.viewport.zoom||1).toFixed(1)+'×';paintCanvas();}
function centerZoom(factor){const g=geometry();if(g)zoomAround({x:g.vw/2,y:g.vh/2},factor);}
function setTool(tool){if(ui.previewId!==null)return;ui.editing=tool;ui.original=false;ui.holdOriginal=false;$('pan').setAttribute('aria-pressed',String(tool==='pan'));paintCanvas();}
surface.addEventListener('wheel',e=>{if(geometry()){e.preventDefault();zoomAround(viewportPoint(e),Math.exp(-bound(e.deltaY,-90,90)*.003));}},{passive:false});
surface.addEventListener('pointerdown',e=>{
  if(!activeMedia||e.button!==0)return;e.preventDefault();surface.focus({preventScroll:true});surface.setPointerCapture(e.pointerId);
  const pos=viewportPoint(e);pointers.set(e.pointerId,pos);
  if(pointers.size===2){
    const [a,b]=[...pointers.values()];gesture={type:'pinch',distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
    ui.selectionDraft=null;paintCanvas();return;
  }
  const normalized=imagePoint(pos);
  if(ui.panKey||ui.editing==='pan'||ui.original||ui.holdOriginal||ui.previewId!==null){gesture={type:'pan',last:pos};return;}
  if(!normalized)return;
  if(ui.editing==='mask')gesture={type:'mask',first:normalized,last:normalized};
  else if(ui.editing==='brush')gesture={type:'brush',points:[normalized]};
  paintCanvas();
});
surface.addEventListener('pointermove',e=>{
  const pos=viewportPoint(e);brushCursor=pos;
  if(!pointers.has(e.pointerId)){if(ui.editing==='brush')paintCanvas();return;}
  pointers.set(e.pointerId,pos);const g=geometry(),p=currentPhoto();if(!g||!gesture)return;
  if(gesture.type==='pinch'&&pointers.size>=2){
    const [a,b]=[...pointers.values()],distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    zoomAround(gesture.center,distance/gesture.distance);
    const next=geometry();p.viewport.panX+=(center.x-gesture.center.x)/next.w;p.viewport.panY+=(center.y-gesture.center.y)/next.h;limitPan(p,next);
    gesture.distance=distance;gesture.center=center;
  }else if(gesture.type==='pan'){
    p.viewport.panX+=(pos.x-gesture.last.x)/g.w;p.viewport.panY+=(pos.y-gesture.last.y)/g.h;limitPan(p,g);gesture.last=pos;
  }else if(gesture.type==='mask'){
    const end=imagePoint(pos,true),[x,y]=gesture.first;gesture.last=end;
    ui.selectionDraft={x:Math.min(x,end[0]),y:Math.min(y,end[1]),w:Math.abs(x-end[0]),h:Math.abs(y-end[1])};
  }else if(gesture.type==='brush'){
    const next=imagePoint(pos,true),last=gesture.points.at(-1);
    if(gesture.points.length<512&&Math.hypot(next[0]-last[0],next[1]-last[1])>ui.radius/7)gesture.points.push(next);
  }
  paintCanvas();
});
function endGesture(e,cancelled){
  if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);
  if(gesture?.type==='pinch'&&pointers.size===1){gesture={type:'pan',last:[...pointers.values()][0]};return;}
  const completed=gesture;gesture=null;if(['pan','pinch'].includes(completed?.type))rememberViewport();
  if(!cancelled&&completed?.type==='brush'){
    const p=currentPhoto(),stroke={tool:ui.brush,r:ui.radius,strength:ui.strength,points:completed.points};
    if(['low-smooth','high-soften'].includes(ui.brush))stroke.separation=bound(ui.separation/Math.min(p.width,p.height),.000001,.2);
    try{validateStrokes([...visibleEdits().strokes,stroke]);commit(brushName(ui.brush),{type:'stroke',stroke});}catch(error){announce(error.message);}
  }else if(!cancelled&&completed?.type==='mask'&&ui.selectionDraft){
    const rect=ui.selectionDraft;if(rect.w>.006&&rect.h>.006){ui.target='local';ui.showMask=true;setTool('pan');commit('设定局部调色范围',{type:'mask',rect},true);}
  }
  ui.selectionDraft=null;paintCanvas();
}
surface.addEventListener('pointerup',e=>endGesture(e,false));surface.addEventListener('pointercancel',e=>endGesture(e,true));
function settleCanvasInput(){
  for(const pointerId of [...pointers.keys()]){
    endGesture({pointerId},false);
    if(surface.hasPointerCapture(pointerId))surface.releasePointerCapture(pointerId);
  }
}
surface.addEventListener('pointerleave',()=>{brushCursor=null;if(ui.editing==='brush')paintCanvas();});
$('pan').onclick=()=>{setTool('pan');renderPanel();};$('smaller').onclick=()=>centerZoom(1/1.3);$('larger').onclick=()=>centerZoom(1.3);
$('fit').onclick=()=>{if(currentPhoto()){currentPhoto().viewport={zoom:1,panX:0,panY:0};updateViewport();}};
$('compare').onclick=()=>{ui.compare=!ui.compare;ui.original=false;updateChrome();paintCanvas();};
$('original').onclick=()=>{ui.original=!ui.original;updateChrome();paintCanvas();};
$('splitPosition').oninput=e=>{ui.split=Number(e.target.value);paintCanvas();};
$('toggleFilm').onclick=()=>{
  const small=matchMedia('(max-width:700px)').matches,cls=small?'mobile-film':'film-closed';
  $('desk').classList.toggle(cls);updateChrome();
};
function openDialog(title,fill) {
  const dialog=$('dialog');if(dialog.open)dialog.close();
  $('dialogTitle').textContent=title;const content=clear($('dialogBody'));fill(content);dialog.showModal();
}
$('closeDialog').onclick=()=>$('dialog').close();
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
function exportDialog(){
  const p=currentPhoto(),data=activeMedia;if(!p||!data||ui.exporting)return;
  settleCanvasInput();finishPendingEdit();
  const version=ui.previewId??p.cursor,snapshot=editsAt(p,version),label=p.nodes[version].label;
  openDialog(ui.previewId===null?'导出当前成片':'导出历史快照',body=>{
    body.append(element('p',p.name),hint('原尺寸导出 · '+label));
    const format=element('select');format.id='exportFormat';format.add(new Option('PNG · 保留透明度','image/png'));format.add(new Option('JPEG · 白色底','image/jpeg'));
    const field=element('label','格式','panel-field');field.append(format);body.append(field);
    const button=action('导出图片',async()=>{
      if(ui.exporting)return;ui.exporting=true;button.disabled=true;
      const mime=format.value;button.textContent='正在生成成片…';updateChrome();
      try{
        const canvas=document.createElement('canvas');canvas.width=p.width;canvas.height=p.height;
        const actual=await mediaFor(p,snapshot);canvas.width=actual.img.naturalWidth;canvas.height=actual.img.naturalHeight;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(actual.img,0,0);
        if(hasPixelChanges(snapshot)){
          const raw=c.getImageData(0,0,canvas.width,canvas.height);
          const result=await askWorker({kind:'export',key:p.id,width:canvas.width,height:canvas.height,data:raw.data,edits:snapshot},[raw.data.buffer]);
          c.putImageData(new ImageData(result.pixels,canvas.width,canvas.height),0,0);
        }
        caption(c,snapshot.caption,0,0,canvas.width,canvas.height);
        if(mime==='image/jpeg'){c.globalCompositeOperation='destination-over';c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);}
        const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('图片编码失败。')),mime,.94));
        const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=p.name.replace(/\.[^.]+$/,'')+'-成片.'+(mime==='image/jpeg'?'jpg':'png');
        document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
        if(button.isConnected)$('dialog').close();announce(window.houtuDesktopExports?'正在保存成片…':'成片已交给浏览器下载');
      }catch(error){announce(error.message);}finally{ui.exporting=false;button.disabled=false;button.textContent='导出图片';updateChrome();}
    },'primary wide','doExport');
    body.append(button);
  });
}
$('export').onclick=exportDialog;


const toolIndex=[
  ['color','light','光线','曝光 提亮 压暗 阴影 对比度', 'exposure'],
  ['color','color','颜色','色温 冷暖 饱和度 自然饱和度','temperature'],
  ['color','looks','风格预设','暖调 胶片 电影 清透'],
  ['color','raw','RAW 显影','V-Log Vlog 灰片 灰档 灰阶 LUT cube RAW'],
  ['color','mask','局部调色','蒙版 选区 框选 范围'],
  ['portrait','gray','中性灰','局部 加深 减淡 修肤 提亮 擦除'],
  ['portrait','frequency','高低频','高频 低频 毛孔 纹理 皮肤 匀色'],
  ['layers','caption','文字图层','签名 题字 不透明度 显示 隐藏'],
  ['layers','stack','图层顺序','原图 底图 图层结构'],
  ['ai','expand','扩图','补全画布 扩展 横屏 竖屏'],
  ['ai','paint','厚涂','二次元 COS 自然 强度 风格'],
  ['steps','changes','编辑记录','历史 撤销 重做 旧版本'],
  ['steps','flow','工作流','失败 重试 AI 中间步骤']
];
const brushNames={'gray-dodge':'中性灰减淡','gray-burn':'中性灰加深','gray-erase':'擦除灰层','low-smooth':'低频匀色','high-soften':'高频柔化'};
function brushName(key){return brushNames[key]||'画笔';}
const starts={color:'light',portrait:'gray',layers:'caption',ai:'expand',steps:'changes'};
const scrollPositions=new Map();
function showSection(section,group,focusId){
  if(!sections[section])return;
  settleCanvasInput();finishPendingEdit();
  scrollPositions.set(ui.section,$('parameterScroll').scrollTop);
  if(ui.section==='ai'&&section!=='ai')desk?.suspend();
  ui.section=section;
  const panelURL=new URL(location.href);panelURL.searchParams.set('panel',section);if(section!=='ai')panelURL.searchParams.delete('deskRun');if(panelURL.href!==location.href)history.replaceState(null,'',panelURL);
  if(group!==undefined)choices[section]=group;
  if(!(section in choices))choices[section]=starts[section];
  if(section==='portrait'&&ui.previewId===null){
    const isFrequency=choices.portrait==='frequency';
    if(isFrequency!==['low-smooth','high-soften'].includes(ui.brush))ui.brush=isFrequency?'low-smooth':'gray-dodge';
    ui.editing='brush';
  }else ui.editing='pan';
  $('app').classList.remove('focus-view');renderPanel();updateChrome();paintCanvas();
  $('parameterScroll').scrollTop=group?0:(scrollPositions.get(section)||0);
  if(group){
    const groupNode=$('group-'+group);if(groupNode)groupNode.scrollIntoView({block:'nearest'});
    const focusTarget=focusId?document.getElementById(focusId):groupNode?.querySelector('summary');
    focusTarget?.focus({preventScroll:true});
  }
}
for(const b of document.querySelectorAll('[data-section]'))b.onclick=()=>showSection(b.dataset.section);
$('mobilePanel').onclick=()=>{$('app').classList.add('focus-view');announce('点底栏工具可展开参数');};
$('undo').onclick=()=>moveHistory(-1);$('redo').onclick=()=>moveHistory(1);
function updateChrome(){
  const p=currentPhoto(),ready=Boolean(p&&activeMedia);
  $('unified-empty').hidden=!!p;desk?.sync();
  $('docName').textContent=p?.name||'打开照片';$('docSize').textContent=p?.width?p.width+' × '+p.height:'';
  $('undo').disabled=!p||ui.previewId!==null||p.nodes[p.cursor].parent===null;
  $('redo').disabled=!p||ui.previewId!==null||p.redo[p.cursor]===undefined;
  $('export').disabled=!ready||ui.exporting;$('compare').disabled=$('original').disabled=!ready;
  $('original').setAttribute('aria-pressed',String(ui.original||ui.holdOriginal));
  $('compare').setAttribute('aria-pressed',String(ui.compare));
  $('pan').setAttribute('aria-pressed',String(ui.editing==='pan'));
  $('toggleFilm').setAttribute('aria-expanded',String(matchMedia('(max-width:700px)').matches?$('desk').classList.contains('mobile-film'):!$('desk').classList.contains('film-closed')));
  $('zoomLabel').value=(p?.viewport.zoom||1).toFixed(1)+'×';
  document.querySelector('[data-section=steps]').title=p?'编辑历史与工作流 · '+(chain(p,p.cursor).length-1)+' 项调整':'编辑历史与工作流';
  const tile=document.querySelector('.tile.current small');if(tile&&p&&!ui.batch)tile.textContent=p.cursor?'已调整':'原始照片';
  for(const btn of document.querySelectorAll('[data-section]'))btn.setAttribute('aria-pressed',String(btn.dataset.section===ui.section));
}
function range(parent,{id,label,min,max,step=1,value,format=String,input,change}){
  const wrap=element('div',undefined,'range-row'),line=element('div',undefined,'range-line'),name=element('label',label),out=element('output',format(value));
  name.htmlFor=id;out.htmlFor=id;
  const control=document.createElement('input');Object.assign(control,{type:'range',id,min,max,step,value});
  control.oninput=()=>{const n=Number(control.value);out.value=format(n);input?.(n);};
  control.onchange=()=>change?.(Number(control.value));
  line.append(name,out);wrap.append(line,control);parent.append(wrap);return control;
}
function field(parent,label,control){
  const wrap=element('label',label,'panel-field');wrap.append(control);parent.append(wrap);return control;
}
function select(options,value,handler,id){
  const control=document.createElement('select');if(id)control.id=id;
  for(const [v,label] of options)control.add(new Option(label,v));
  control.value=value;control.onchange=()=>handler(control.value);return control;
}
function buttons(parent,items){
  const row=element('div',undefined,'panel-actions');
  for(const [id,label,fn,pressed]of items){
    const b=action(label,fn,undefined,id);
    if(pressed!==undefined)b.setAttribute('aria-pressed',String(pressed));row.append(b);
  }parent.append(row);return row;
}
function accordion(key,title,fill){
  const group=element('details',undefined,'panel-group');group.id='group-'+key;
  const summary=element('summary',title),content=element('div',undefined,'group-content');
  group.open=key===choices[ui.section];group.append(summary,content);
  summary.onclick=e=>{
    e.preventDefault();choices[ui.section]=group.open?'':key;
    if(ui.section==='portrait'&&!group.open){ui.editing='brush';ui.brush=key==='frequency'?'low-smooth':'gray-dodge';}
    renderPanel();updateChrome();paintCanvas();$('group-'+key)?.querySelector('summary')?.focus({preventScroll:true});
  };
  if(group.open)fill(content);
  $('parameterScroll').append(group);
}
function toneRange(parent,key,label,min,max,step){
  const target=ui.target==='local'&&visibleEdits().mask?'local':'global',value=visibleEdits()[target][key]||0;
  const format=n=>key==='exposure'?(n>0?'+':'')+n.toFixed(2)+' EV':(n>0?'+':'')+n;
  range(parent,{id:key,label,min,max,step,value,format,
    input:n=>{ui.draftStep={type:'tone',target,values:{[key]:n}};requestPixels();},
    change:n=>commit((target==='local'?'局部':'')+label+' '+format(n),{type:'tone',target,values:{[key]:n}})});
}
function rawProfileSection(photo){
  if(photo?.origin.stepId!=='develop'||!RAW_EXTENSIONS.includes(extension(photo.name)))return;
  accordion('raw','RAW 显影',box=>{
    const state=visibleEdits();
    if(state.base&&state.base.workflowId!==photo.origin.workflowId){
      box.append(hint('在「步骤」中返回 RAW 显影版本，即可切换灰片或 LUT。'));
      return;
    }
    const profile=state.rawProfile||'standard',busy=Boolean(photo.rawDeveloping);
    const labels={standard:'标准 sRGB',vlog:'V-Log 灰片','vlog-lut':'V-Log LUT'};
    const info=element('p',labels[profile]+(state.lutName?' · '+state.lutName:''),'hint');
    info.id='rawWorkingProfile';info.style.overflowWrap='anywhere';info.setAttribute('role','status');box.append(info);
    const lut=document.createElement('input');
    lut.type='file';lut.id='rawLutFile';lut.accept='.cube';lut.hidden=true;
    lut.onchange=()=>{const file=lut.files[0];lut.value='';if(file)void applyRawProfile(photo,'vlog-lut',file);};
    const actions=element('div',undefined,'panel-actions');
    for(const mode of ['standard','vlog']){
      const control=action(labels[mode],()=>applyRawProfile(photo,mode),undefined,'raw-'+mode);
      control.setAttribute('aria-pressed',String(profile===mode));control.disabled=busy||profile===mode;actions.append(control);
    }
    const load=action('导入 .cube LUT',()=>lut.click(),undefined,'raw-import-lut');
    load.disabled=busy;actions.append(load);
    if(!isAndroid){
      const full=action('按原尺寸显影',()=>applyRawProfile(photo,profile,null,true),undefined,'raw-full-size');
      full.disabled=busy;actions.append(full);
    }
    box.append(actions,lut);
    box.append(hint(photo.rawError||(busy?'正在从 RAW 重新显影…':'选择 V-Log/V-Gamut → Rec.709 的 LUT。')));
    const original=element('a','下载原始 RAW','small');
    original.href='/api/image-imports/'+photo.origin.workflowId+'/original';
    const links=element('div',undefined,'panel-actions'),history=element('a','显影记录与母版','small');
    history.href='/workflows/?id='+photo.origin.workflowId+'&step=develop';
    links.append(original,history);box.append(links);
  });
}
async function applyRawProfile(photo,profile,file,fullSize=false){
  if(currentPhoto()!==photo||photo.rawDeveloping||ui.previewId!==null)return;
  settleCanvasInput();finishPendingEdit();
  const index=photo.cursor,source=editsAt(photo,index).base||photo.origin;
  if(source.workflowId!==photo.origin.workflowId||source.stepId!=='develop')return;
  photo.rawDeveloping=true;photo.rawError='';renderPanel();
  try{
    const route='/api/image-imports/'+source.workflowId;
    let result;
    if(file){
      if(!/\.cube$/i.test(file.name)||file.size===0||file.size>16*1024*1024)throw Error('请选择 16 MB 以内的 .cube 3D LUT。');
      if(!csrf)csrf=(await api('/api/health')).csrf;
      const query=new URLSearchParams({name:file.name,fromAttempt:source.attemptId||''});
      const response=await fetch(route+'/vlog-lut?'+query,{method:'POST',headers:{'X-Paint-CSRF':csrf,'Content-Type':'application/octet-stream'},body:file});
      result=await response.json();
      if(!response.ok)throw Error(result.error||'LUT 应用失败。');
    }else if(fullSize){
      result=await api(route+'/develop',{profile:'same',fullSize:true,fromAttempt:source.attemptId});
    }else if(profile==='standard'){
      // Reuse the most recent standard rendition in this branch, including restored full-resolution versions.
      const standard=chain(photo,index).map(i=>photo.nodes[i].action).findLast(a=>a?.type==='raw-develop'&&a.profile==='standard');
      if(standard){
        result={source:standard.origin};
      }else{
        result=await api(route+'/develop',{profile:'standard',fromAttempt:source.attemptId});
      }
    }else result=await api(route+'/develop',{profile,fromAttempt:source.attemptId});
    const origin=stable(result.source);
    if(!origin||origin.workflowId!==photo.origin.workflowId||origin.stepId!=='develop')throw Error('本次显影未返回可用的照片版本。');
    if(photo.cursor!==index){
      throw Error('当前编辑步骤已变化。显影结果已保存在工作流中，可回到原步骤后再应用。');
    }
    const label=profile==='standard'?'RAW · 标准 sRGB':profile==='vlog'?'RAW · V-Log 灰片':'RAW LUT · '+result.options.lutName;
    append(photo,fullSize?label+' · 原尺寸':label,
      {type:'raw-develop',origin,profile,...(profile==='vlog-lut'?{lutName:result.options.lutName}:{})});
    if(currentPhoto()===photo){
      refreshEdits();
      announce(fullSize?'已按 '+result.width+' × '+result.height+' 显影，调色参数保留。':profile==='standard'?'已恢复标准显影，调色参数保留。':'已应用 RAW 显影，调色参数保留。');
    }
  }catch(e){
    photo.rawError=e.message;
    if(currentPhoto()===photo)announce(e.message);
  }finally{
    photo.rawDeveloping=false;
    if(currentPhoto()===photo&&ui.section==='color')renderPanel();
  }
}
function renderColor(){
  rawProfileSection(currentPhoto());
  accordion('light','基础光线',box=>{
    toneRange(box,'exposure','曝光',-2,2,.05);toneRange(box,'contrast','对比度',-60,60,1);toneRange(box,'shadows','阴影',-80,80,1);
  });
  accordion('color','颜色',box=>{
    toneRange(box,'temperature','色温',-70,70,1);toneRange(box,'saturation','饱和度',-75,75,1);
  });
  accordion('looks','风格预设',box=>{
    const looks=[['清透日光',{exposure:.15,shadows:12,temperature:4,contrast:3,saturation:2}],['暖调胶片',{exposure:.05,temperature:15,shadows:12,contrast:-10,saturation:-12}],['冷调电影',{exposure:-.2,temperature:-10,contrast:16,shadows:-6,saturation:-14}]];
    for(const [label,values]of looks)box.append(action(label,()=>{const target=ui.target==='local'&&visibleEdits().mask?'local':'global';commit(label,{type:'tone',target,values});},'step-row'));
  });
  accordion('mask','局部调色',box=>{
    const mask=visibleEdits().mask;
    box.append(hint(mask?'矩形蒙版已保留。局部参数只作用于框内。':'在照片上框出要单独调整的范围。'));
    buttons(box,[['drawMask',mask?'重新框选':'框选范围',()=>{setTool('mask');announce('在照片上拖出一个矩形');},ui.editing==='mask']]);
    if(mask){
      if(ui.target==='local')toneRange(box,'exposure','框内曝光',-2,2,.05);
      box.append(action('移除蒙版',()=>{ui.target='global';ui.showMask=false;commit('移除局部蒙版',{type:'mask',rect:null},true);}));
    }
  });
}
function brushControls(box,ids){
  buttons(box,ids.map(([id,label])=>['brush-'+id,label,()=>{ui.brush=id;setTool('brush');renderPanel();},ui.editing==='brush'&&ui.brush===id]));
  range(box,{id:'brushSize',label:'画笔大小',min:1,max:20,value:ui.radius*100,step:.5,format:n=>n+'%',input:n=>{ui.radius=n/100;paintCanvas();}});
  range(box,{id:'brushStrength',label:'力度',min:1,max:100,value:Math.round(ui.strength*100),format:n=>n+'%',input:n=>{ui.strength=n/100;}});
}
function renderPortrait(){
  accordion('gray','中性灰 · 光影',box=>{
    box.append(hint('选减淡或加深，然后在照片上轻涂。每一笔都可撤销。'));
    brushControls(box,[['gray-dodge','减淡'],['gray-burn','加深'],['gray-erase','擦除灰层']]);
  });
  accordion('frequency','高低频 · 纹理',box=>{
    box.append(hint('低频匀色整理色块，高频柔化减弱刷过的纹理。'));
    brushControls(box,[['low-smooth','低频匀色'],['high-soften','高频柔化']]);
    const p=currentPhoto(),maximum=Math.max(1,Math.min(80,Math.floor(Math.min(p.width,p.height)*.2)));
    range(box,{id:'separation',label:'分离半径',min:1,max:maximum,value:Math.min(maximum,ui.separation),format:n=>n+' px',input:n=>{ui.separation=n;}});
  });
}
function renderLayers(){
  accordion('caption','文字图层',box=>{
    const layer=visibleEdits().caption;
    const input=document.createElement('input');input.id='captionText';input.maxLength=80;input.placeholder='输入照片题字';input.value=layer.value;
    input.oninput=()=>{ui.draftStep={type:'caption',values:{value:input.value}};toggle.disabled=!input.value.trim();paintCanvas();};
    input.onchange=()=>commit(input.value.trim()?'修改文字图层':'清空题字',{type:'caption',values:{value:input.value}});
    field(box,'题字',input);
    range(box,{id:'captionOpacity',label:'不透明度',min:0,max:100,value:layer.opacity,format:n=>n+'%',
      input:n=>{ui.draftStep={type:'caption',values:{opacity:n}};paintCanvas();},change:n=>commit('文字不透明度 '+n+'%',{type:'caption',values:{opacity:n}})});
    const toggle=action(layer.visible?'隐藏文字':'显示文字',()=>commit(layer.visible?'隐藏文字':'显示文字',{type:'caption',values:{visible:!layer.visible}},true),'outline','toggleCaption');
    toggle.disabled=!layer.value.trim();box.append(toggle);
  });
  accordion('stack','图层顺序',box=>{
    const state=visibleEdits();
    const lines=[[state.caption.value?'题字 · '+state.caption.value:'文字图层',state.caption.value&&state.caption.visible?'显示':'空或隐藏'],['整体与局部调色',state.mask?'含局部蒙版':'全图'],['人物笔触',state.strokes.length+' 笔'],['原始照片','底图']];
    for(const [name,detail]of lines){const row=element('div',undefined,'step-row');row.append(element('span',name),element('small',detail,'push muted'));box.append(row);}
  });
}
function inspectHistory(index){finishPendingEdit();ui.previewId=index;ui.original=false;ui.holdOriginal=false;ui.editing='pan';refreshEdits();}
function exitHistory(){ui.previewId=null;refreshEdits();}
function branchFromPreview(){
  const p=currentPhoto();if(ui.previewId===null)return;
  p.cursor=ui.previewId;ui.previewId=null;safeDraft(p);refreshEdits();announce('已回到所选步骤，其他版本仍在记录中');
}
function renderSteps(){
  const p=currentPhoto();
  accordion('changes','编辑历史',box=>{
    box.append(hint('点一步查看当时的画面。选择「从此处继续」可建立新分支。'));
    const ancestors=new Set(chain(p,p.cursor));
    for(let i=p.nodes.length-1;i>=0;i--){
      const entry=p.nodes[i],row=action('',()=>inspectHistory(i),'step-row'+(i===p.cursor?' current':'')+(ui.previewId===i?' previewed':''));
      row.dataset.entry=i;const label=element('span',String(i).padStart(2,'0')+' · '+entry.label);
      row.append(element('span','','step-dot'),label);if(i===p.cursor||!ancestors.has(i))row.append(element('time',i===p.cursor?'当前':'分支'));box.append(row);
    }
  });
  accordion('flow','AI 工作流',box=>{box.append(action('查看本张 AI 步骤',()=>showSection('ai'),'outline'));});
}
function renderPanel(){
  ui.redrawLayout=null;
  const holder=$('parameterScroll'),savedScroll=holder.scrollTop;clear(holder);$('panelTitle').textContent=sections[ui.section];
  const aiPanel=ui.section==='ai';$('unified-ai').hidden=!aiPanel;holder.hidden=aiPanel;$('inspector').classList.toggle('ai-section',aiPanel);
  $('sectionKind').textContent=ui.section==='ai'?'工作流':ui.section==='steps'?'当前照片':'本机编辑';
  $('scopeControl')?.remove();$('sectionKind').hidden=false;
  if(aiPanel){desk?.open();return;}
  if(!activeMedia){holder.append(hint(currentPhoto()?'正在读取照片…':'导入后即可使用本机工具。'));return;}
  if(ui.section==='color'&&visibleEdits().mask&&ui.previewId===null){
    const scope=select([['global','调整全图'],['local','调整框内']],ui.target,value=>{
      ui.target=value;ui.showMask=value==='local';setTool('pan');renderPanel();
    },'scopeControl');
    scope.setAttribute('aria-label','当前调色范围');$('sectionKind').hidden=true;$('mobilePanel').before(scope);
  }
  if(ui.section==='color'&&!ui.started&&Boolean(currentPhoto())&&ui.previewId===null){
    const intro=element('p','试着拖动曝光，或点「导入」打开自己的照片。');intro.id='introTip';holder.append(intro);
  }
  if(ui.previewId!==null){
    const note=element('div',undefined,'step-summary');note.append(element('h3','正在查看历史快照'),hint(currentPhoto().nodes[ui.previewId].label));
    buttons(note,[['returnCurrent','返回当前成片',exitHistory],['branchHere','从此处继续',branchFromPreview]]);holder.append(note);
    if(ui.section!=='steps')return;
  }
  ({color:renderColor,portrait:renderPortrait,layers:renderLayers,steps:renderSteps}[ui.section])();
  holder.scrollTop=savedScroll;
}
function toolSearch(){
  openDialog('查找工具',body=>{
    const query=document.createElement('input');query.type='search';query.id='toolSearch';query.placeholder='例如：高低频、蒙版、扩图';query.setAttribute('aria-label','搜索工具名称');const list=element('div');body.append(query,list);
    function show(){
      clear(list);const q=query.value.trim().toLowerCase();
      const directory=aiDirectory.filter(t=>!['outpaint','cos-paint'].includes(t.id)).map(t=>['ai','catalog',t.name,t.group+' '+t.aliases,undefined,t]);
      const matches=q?[...toolIndex,...directory].filter(([section,group,title,aliases])=>(sections[section]+title+aliases).toLowerCase().includes(q)):
        toolIndex.filter(([,g])=>['light','gray','mask','frequency','expand','changes'].includes(g));
      if(!matches.length){list.append(hint('没有匹配的工具，试试“曝光”或“扩图”。'));return;}
      for(const [section,group,title,,focus,task]of matches){
        const b=action('',()=>{$('dialog').close();showSection(section,group,focus);if(section==='ai')desk?.search(task?.name||title);},'match');
        b.append(element('strong',title),element('small',sections[section]+' › '+(task?task.group+' › ':'')+title));list.append(b);
      }
    }
    query.oninput=show;query.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();list.querySelector('button')?.click();}};show();setTimeout(()=>query.focus(),0);
  });
}
$('find').onclick=toolSearch;
function about(){
  openDialog('工作台说明',body=>{body.append(element('p','用同一张画布调色、修人物或添加文字。AI 修图右栏顶部切换全自动与半自动。'),hint('导入的原图与 AI 工作流保存在本机服务器。手动笔触、调色、文字和历史草稿保存在当前服务的项目目录；导出成片或提交 AI 时，按原尺寸重算。'),hint('Ctrl/⌘ + K 查找工具，Ctrl/⌘ + Z 撤销，按住空格拖动画布。'));});
}
$('project-menu').onclick=()=>openDialog('工作台菜单',body=>{const links=[['照片项目与批量同步','/studio/'],['完整调色与曲线','/color/'],['完整人物修整','/portrait/'],['多图创作与合成','/creative/'],['本机图层工程','/layers/'],['单项 AI 精修','/ai/?tool=portrait-polish'],['本机超分 4K','/upscale/'],['工作流记录','/workflows/'],['账号与版本更新','/server/']];for(const [name,url]of links){const a=element('a',name,'match');a.href=url;body.append(a);}});
$('about').onclick=about;
$('sessionInfo').onclick=about;
document.addEventListener('keydown',e=>{
  const typing=e.target.matches('textarea,input:not([type=range]):not([type=button])')||e.target.isContentEditable;
  if(e.isComposing||$('dialog').open)return;
  const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
  if(mod&&key==='k'){e.preventDefault();toolSearch();return;}
  if(typing)return;
  if(mod&&key==='o'){e.preventDefault();$('file').click();return;}
  if(mod&&key==='z'){e.preventDefault();moveHistory(e.shiftKey?1:-1);return;}
  if(mod&&key==='y'){e.preventDefault();moveHistory(1);return;}
  if(e.target.matches('select,input,button,summary')&&e.key!=='Escape')return;
  if(e.code==='Space'){e.preventDefault();ui.panKey=true;paintCanvas();}
  if(e.code==='Backslash'){e.preventDefault();ui.holdOriginal=true;updateChrome();paintCanvas();}
  if(['ArrowLeft','ArrowRight'].includes(e.key)&&!ui.batch){
    const i=photos.indexOf(currentPhoto()),j=bound(i+(e.key==='ArrowRight'?1:-1),0,photos.length-1);if(photos[j]){e.preventDefault();selectPhoto(photos[j].id);}
  }
  if(e.key==='Escape'){if(ui.previewId!==null)exitHistory();else{ui.editing='pan';ui.original=ui.compare=false;updateChrome();paintCanvas();}}
});
document.addEventListener('keyup',e=>{
  if(e.code==='Space'&&ui.panKey)ui.panKey=false;
  else if(e.code==='Backslash'&&ui.holdOriginal)ui.holdOriginal=false;
  else return;
  updateChrome();paintCanvas();
});
window.addEventListener('blur',()=>{ui.panKey=ui.holdOriginal=false;paintCanvas();});



async function api(url,body){
  if(body!==undefined&&!csrf)csrf=(await(await fetch('/api/health')).json()).csrf;
  const response=await fetch(url,body===undefined?{}:{method:'POST',headers:{Origin:location.origin,'Content-Type':'application/json','X-Paint-CSRF':csrf},body:JSON.stringify(body)});
  const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error||'处理失败，请重试。'),{status:response.status});return value;
}
function stable(ref){
 if(!ref||!/^[a-f0-9-]{36}$/.test(ref.workflowId)||!/^[a-f0-9]{64}$/.test(ref.assetId))return null;
 return {kind:'workflow',workflowId:ref.workflowId,assetId:ref.assetId,stepId:ref.stepId||null,attemptId:ref.attemptId||null};
}
function refKey(ref){const s=stable(ref);return s?JSON.stringify(s):'';}
function assetPath(ref){if(!stable(ref))throw Error('图片引用无效。');return '/api/workflows/'+ref.workflowId+'/assets/'+ref.assetId;}
function safeDraft(p){
 saveDraft(p).catch(error=>{p.saveError=error.message;status('草稿未保存',true);announce(error.message);});
}
function cacheOrigin(photo,version,ref){photo.pins||={};photo.pins[version]=stable(ref);safeDraft(photo);}
function indexFor(photo,ref){
 const key=refKey(ref);
 if(!key)return -1;
 if(refKey(photo.origin)===key)return 0;
 const pin=Object.entries(photo.pins||{}).find(([,r])=>refKey(r)===key);
 if(pin)return Number(pin[0]);
 return photo.nodes.findIndex(n=>['ai-image','raw-develop'].includes(n.action?.type)&&refKey(n.action.origin)===key);
}
function mediaFor(photo,state){
 if(!state.base||state.base.assetId===photo.origin.assetId&&state.base.workflowId===photo.origin.workflowId)return obtainMedia(photo);
 const key=refKey(state.base);
 return obtainMedia({id:key,name:photo.name,source:assetPath(state.base)});
}
function saveActiveId(id){try{sessionStorage.setItem('houtu-canvas-active',id);}catch{}const u=new URL(location.href);u.searchParams.set('canvasPhoto',id);if(u.href!==location.href)history.replaceState(null,'',u);}
let desiredBase=0;
async function loadEffective(photo,edits){
 const token=++desiredBase,baseKey=refKey(edits.base||photo.origin);
 try{
  const data=await mediaFor(photo,edits);
  if(token!==desiredBase||currentPhoto()!==photo||baseKey!==refKey(visibleEdits().base||photo.origin))return;
  activeMedia=data;boundBase=baseKey;photo.width=data.img.naturalWidth;photo.height=data.img.naturalHeight;
  const copy=data.raw.data.slice();worker.postMessage({kind:'bind',key:photo.id,width:data.raw.width,height:data.raw.height,data:copy},[copy.buffer]);
  updateChrome();paintCanvas();requestPixels();
 }catch(error){if(token===desiredBase)announce(error.message);}
}
async function settleSource(photo,version){
 const state=editsAt(photo,version),input=state.base||photo.origin;
 if(!hasPixelChanges(state)&&(!state.caption.visible||!state.caption.value)){cacheOrigin(photo,version,input);return stable(input);}
 const existing=photo.pins?.[version];if(existing)return stable(existing);
 const data=await mediaFor(photo,state),width=data.img.naturalWidth,height=data.img.naturalHeight;
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(data.img,0,0);
 if(hasPixelChanges(state)){
  const raw=c.getImageData(0,0,width,height);
  const result=await askWorker({kind:'export',key:photo.id,width,height,data:raw.data,edits:state},[raw.data.buffer]);
  c.putImageData(new ImageData(result.pixels,width,height),0,0);
 }
 caption(c,state.caption,0,0,width,height);
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('本机成片编码失败。')),'image/png'));
 const flow=new WorkflowClient(api);
 await flow.create(photo.name,input.workflowId,'single-canvas',stable(input));
 const first=await flow.copySource(stable(input));await flow.checkpoint('source',{imageAsset:first.id,origin:stable(input)},[{id:first.id,type:'image',label:'本版实际底图'}],'保留编辑底图');
 const image=await flow.upload(blob);await flow.checkpoint('edit',{imageAsset:image.id,from:stable(input),settings:state,localOnly:true,width,height},[{id:image.id,type:'image',label:'原尺寸成片'}],'保存本机参数与原尺寸成片');
 const ref=stepPicture(flow.current,'edit');cacheOrigin(photo,version,ref);return ref;
}
const pinsInFlight=new Map();
async function pinVisible(){
 settleCanvasInput();finishPendingEdit();
 const p=currentPhoto();if(!p)throw Error('请先打开照片。');const index=ui.previewId??p.cursor,key=p.id+':'+index;
 let task=pinsInFlight.get(key);if(!task){task=settleSource(p,index);pinsInFlight.set(key,task);}
 try{const ref=await task;if(currentPhoto()!==p||(ui.previewId??p.cursor)!==index)throw Error('照片或历史位置已经变化，请再次开始。');return ref;}
 finally{if(pinsInFlight.get(key)===task)pinsInFlight.delete(key);}
}
function receivePicture(origin,run,explicit){
 const p=currentPhoto(),ref=stable(origin);if(!p||!ref||!run)return;
 let anchor=indexFor(p,run.origin);if(anchor<0)return;
 if(origin.stepId==='source'){
  if(explicit){ui.previewId=anchor;refreshEdits();}
  return;
 }
 let i=p.nodes.findIndex(n=>n.action?.type==='ai-image'&&refKey(n.action.origin)===refKey(ref));
 if(i>=0&&!explicit)return;
 let changed=false;
 if(i<0){
  const previous=p.nodes.findLastIndex(n=>n.action?.run===run.id);
  const parent=previous>=0?previous:anchor;
  i=p.nodes.length;
  const step=run.steps.find(s=>s.id===ref.stepId)||run.agent?.steps.find(s=>s.id===ref.stepId);
  p.nodes.push({parent,label:step?.name||'AI 成片',action:{type:'ai-image',origin:ref,run:run.id}});
  const follows=p.cursor===parent;
  if(follows||p.redo[parent]===undefined)p.redo[parent]=i;
  if(!explicit&&follows){p.cursor=i;changed=ui.previewId===null;}
  safeDraft(p);
 }
 if(explicit){
  ui.previewId=explicit==='follow'&&i===p.cursor?null:i;
  changed=true;
 }
 if(changed){updateChrome();requestPixels();}
}
function makeFromRef(origin,name){
 const ref=stable(origin);if(!ref)throw Error('输入照片没有可恢复的素材记录。');
 const found=photos.find(p=>refKey(p.origin)===refKey(ref)||indexFor(p,ref)>=0);
 if(found)return found;
 const photo=makePhoto(crypto.randomUUID(),name,assetPath(ref));photo.origin=ref;photo.pins={0:ref};photo.created=Date.now();photos.push(photo);return photo;
}
async function readSource(file){
 if(file.size>MAX_IMAGE_UPLOAD_BYTES)throw Error(IMAGE_UPLOAD_MESSAGE);
 if(!needsImageImport(file)){
  const saved=await saveWorkspaceImage(file,file.name),w=await api('/api/workflows/'+saved.workflowId);
  return stepPicture(w,'source');
 }
 if(!csrf)csrf=(await api('/api/health')).csrf;
 const response=await fetch('/api/image-imports?name='+encodeURIComponent(file.name),{method:'POST',headers:{'X-Paint-CSRF':csrf,'Content-Type':'application/octet-stream'},body:file});
 const value=await response.json();if(!response.ok)throw Error(value.error||'此格式无法导入。');
 return value.source;
}
async function loginState(){
 try{const v=await api('/api/state');signedIn=!!v.account;imageRuntimeReady=v.imageRuntime?.ready!==false;}catch{signedIn=false;}
 desk?.sync();
}
async function boot(){
 try{
  for(const saved of (await loadDrafts()).sort((a,b)=>a.created-b.created)){
    if(!stable(saved.origin))continue;
    const photo=makePhoto(saved.id,saved.name,assetPath(saved.origin));Object.assign(photo,saved,{diskRevision:saved.revision});photos.push(photo);
  }
 }catch{announce('本机草稿记录暂不可用，仍可导入和导出照片。');}
 const params=new URLSearchParams(location.search),id=params.get('deskRun');
 let run;
 if(id)try{run=await api('/api/studio/ai-runs/'+encodeURIComponent(id));}catch{announce('这份 AI 工作流已无法打开。');}
  const stored=photos.find(p=>p.id===params.get('canvasPhoto'))||photos.find(p=>p.id===sessionStorage.getItem('houtu-canvas-active'));
  let selected=stored||photos[0];
  if(run){
    selected=photos.find(p=>Object.values(p.runs||{}).includes(run.id))||stored;
    if(selected?.metadataOnly){const saved=await loadDraft(selected.id);Object.assign(selected,saved,{metadataOnly:false,diskRevision:saved.revision});}
    if(!selected||indexFor(selected,run.origin)<0)selected=makeFromRef(run.origin,run.name);
  }
 if(selected)await selectPhoto(selected.id);else{updateChrome();renderPanel();renderFilm();paintCanvas();}
 if(run){showSection('ai');desk.restoreRun(run,currentPhoto()?.id);}
 await registerWorkspaceEditor({tool:'workbench',prepare:()=>currentPhoto()?pinVisible():false,open:async(v,{isCurrent=()=>true}={})=>{
   if(!isCurrent()||run)return;
   if(photos.length&&!params.has('handoff')&&!params.has('imageAsset'))return;
   ui.batch=false;const p=makeFromRef(v.origin,v.name),i=indexFor(p,v.origin);if(i>=0)p.cursor=i;
   await selectPhoto(p.id);if(isCurrent()&&p===currentPhoto()&&p.origin){const pinned=indexFor(p,v.origin);if(pinned>=0&&p.cursor!==pinned){p.cursor=pinned;ui.previewId=null;refreshEdits();}safeDraft(p);}
 }});
 await loginState();document.addEventListener('visibilitychange',()=>{if(!document.hidden)void loginState();});
}

const modelGroup=document.createElement('details'),modelSummary=element('summary','模型设置'),modelField=document.createElement('div');
modelField.id='unified-model';modelGroup.append(modelSummary,modelField);
const picker=createModelPicker({mount:modelField,onChange:()=>desk?.sync(),labelText:'本轮主模型',noteText:'全自动调度和出图使用所选主模型，实际回执保存在步骤里。'});
function selectedModel(){return picker.value;}
async function signIn(){
 const nativeOpen=Boolean(window.houtuDocuments||window.chrome?.webview);const popup=nativeOpen?null:window.open('about:blank','_blank');
 try{
  const receipt=await api('/api/login',{}),url=new URL(receipt.authUrl);
  if(url.origin!=='https://auth.openai.com')throw Error('官方登录地址校验失败。');
  if(nativeOpen)window.open(url.href,'_blank');else if(popup){popup.opener=null;popup.location.href=url.href;}else throw Error('请允许打开官方登录窗口。');
  let attempts=0;const timer=setInterval(async()=>{await loginState();if(signedIn||++attempts>90){clearInterval(timer);if(signedIn)await picker.reload();}},3000);
 }catch(e){popup?.close();announce(e.message);}
}

const deskMount=$('unified-ai');
desk=createAiDesk({mount:deskMount,api,state:()=>({name:currentPhoto()?.name,hasPhoto:!!activeMedia,signedIn,busy:ui.exporting||!imageRuntimeReady,model:selectedModel(),validModel:picker.valid()}),
  pin:pinVisible,pinDisplayed:pinVisible,showPicture:receivePicture,recordPicture:receivePicture,owns:ref=>currentPhoto()&&indexFor(currentPhoto(),ref)>=0,setClassic(){},login:signIn,modelElement:()=>modelGroup,
  savedRuns:()=>currentPhoto()?.runs,remember:(mode,id)=>{const p=currentPhoto();if(!p||p.metadataOnly||p.runs?.[mode]===id)return;p.runs||={};if(id)p.runs[mode]=id;else delete p.runs[mode];safeDraft(p);}});
$('file').accept=IMAGE_ACCEPT;
$('file').setAttribute('aria-label','导入照片');
const initialPanel=new URLSearchParams(location.search).get('panel');if(Object.hasOwn(sections,initialPanel))ui.section=initialPanel;
await boot();
