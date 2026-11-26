// Images are immutable assets; panel changes do not write image files.
let token='';
async function request(url,input){
 if(input&&!token)token=(await(await fetch('/api/health')).json()).csrf;
 const r=await fetch(url,input?{method:'POST',headers:{'Content-Type':'application/json','X-Paint-CSRF':token},body:JSON.stringify(input)}:{});
 const v=await r.json();if(!r.ok)throw Error(v.error||'草稿暂未写入本机。');return v;
}
export async function loadDrafts(){return (await request('/api/studio/canvas-drafts')).photos;}
export const loadDraft=id=>request('/api/studio/canvas-drafts/'+id);
const queues=new Map();
export function saveDraft(photo){
 const snapshot=structuredClone({id:photo.id,name:photo.name,origin:photo.origin,nodes:photo.nodes,cursor:photo.cursor,
  redo:photo.redo,viewport:photo.viewport,thumbnail:photo.thumbnail,pins:photo.pins||{},runs:photo.runs||{}});
 let queue=queues.get(photo.id);
 if(queue){queue.next=snapshot;return queue.task;}
 queue={next:snapshot};
 queue.task=(async()=>{
  while(queue.next){
   const value=queue.next;queue.next=null;
   const saved=await request('/api/studio/canvas-drafts/'+photo.id,{...value,revision:photo.diskRevision||0});
   photo.diskRevision=saved.revision;
  }
 })().finally(()=>queues.delete(photo.id));queues.set(photo.id,queue);return queue.task;
}
