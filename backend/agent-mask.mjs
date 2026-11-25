import {Worker} from 'node:worker_threads';
export async function agentSubjectMask(bytes,{cancelled=()=>false,timeout=60000}={}){
 if(cancelled())throw Error('主体分析已停止。');const worker=new Worker(new URL('./agent-mask-worker.mjs',import.meta.url));
 try{return await new Promise((resolve,reject)=>{let finished=false;const end=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);clearInterval(stop);error?reject(error):resolve(value);};const timer=setTimeout(()=>end(Error('本机主体模型超时，请稍后重试或手工确认蒙版。')),timeout),stop=setInterval(()=>{if(cancelled())end(Error('主体分析已停止。'));},100);worker.once('error',e=>end(e));worker.once('exit',code=>{if(!finished)end(Error('主体分析进程提前退出（'+code+'）。'));});worker.on('message',m=>m.error?end(Error(m.error)):end(null,{...m,mask:Buffer.from(m.mask)}));worker.postMessage({bytes});});}finally{await worker.terminate();}
}
