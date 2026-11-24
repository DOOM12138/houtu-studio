import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {replaceFile} from '../lib/files.mjs';
const UUID=/^[a-f0-9-]{36}$/,EMAIL=/^[^@\s]+@[^@\s]+$/;
export function accountSnapshot(value){
 if(!value||!UUID.test(value.id||'')||typeof value.email!=='string'||!EMAIL.test(value.email))return null;
 return {id:value.id,email:value.email.slice(0,254),plan:String(value.plan||'unknown').slice(0,64)};
}
export class AccountLedger{
 constructor(directory){this.directory=path.join(directory,'library');this.file=path.join(this.directory,'accounts.json');this.queue=Promise.resolve();this.live={status:'unknown',account:null,checkedAt:null};}
 async load(){await mkdir(this.directory,{recursive:true});try{this.state=JSON.parse(await readFile(this.file,'utf8'));if(this.state.schemaVersion!==1||!Array.isArray(this.state.accounts)||!this.state.accounts.every(a=>accountSnapshot(a))||!UUID.test(this.state.serverId))throw Error('Invalid account ledger');}catch(error){if(error.code!=='ENOENT')throw Error('服务器账号记录无法读取，请保留data/library/accounts.json并从备份恢复。');this.state={schemaVersion:1,serverId:randomUUID(),created:Date.now(),currentId:null,accounts:[]};await this.write();}}
 async write(){const temporary=this.file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(this.state,null,2));await replaceFile(temporary,this.file);}
 update(fn){const next=this.queue.catch(()=>{}).then(async()=>{const previous=structuredClone(this.state),live=structuredClone(this.live);try{return await fn();}catch(error){this.state=previous;this.live={...live,status:'unknown',checkedAt:Date.now()};throw error;}});this.queue=next;return next;}
 async observe(account,reason='observed'){
  return this.update(async()=>{
   const now=Date.now(),email=typeof account?.email==='string'?account.email.trim().slice(0,254):'',known=Boolean(account);
   if(!known){const previous=this.state.accounts.find(a=>a.id===this.state.currentId);if(previous){previous.lastSignedOut=now;previous.lastSignOutReason=reason;this.state.currentId=null;await this.write();}this.live={status:'signedOut',account:null,checkedAt:now};return null;}
   if(!EMAIL.test(email)){this.live={status:'unknown',account:null,checkedAt:now};return null;}
   let record=this.state.accounts.find(a=>a.email.toLowerCase()===email.toLowerCase()),changed=false;
   if(!record){record={id:randomUUID(),email,plan:String(account.plan||'unknown').slice(0,64),firstSeen:now,lastSeen:now,signIns:0};this.state.accounts.push(record);changed=true;}
   const plan=String(account.plan||'unknown').slice(0,64);
   if(this.state.currentId!==record.id){record.signIns++;record.lastSignedIn=now;this.state.currentId=record.id;changed=true;}
   if(record.plan!==plan||now-record.lastSeen>60000){record.plan=plan;record.lastSeen=now;changed=true;}
   this.live={status:'signedIn',account:accountSnapshot(record),checkedAt:now};if(changed)await this.write();return accountSnapshot(record);
  });
 }
 unavailable(){this.live={...this.live,status:'unknown',checkedAt:Date.now()};}
 current(){return structuredClone(this.live);}
 records(){return this.state.accounts.map(a=>{const account=accountSnapshot(a);return account?{...account,firstSeen:a.firstSeen,lastSeen:a.lastSeen,lastSignedIn:a.lastSignedIn||null,lastSignedOut:a.lastSignedOut||null,signIns:a.signIns||0}:null;}).filter(Boolean);}
}

// Observe only the app's own official client. No token, password or cookie copying.
export function trackedBridge(raw,ledger){
 const capture=control=>{
  const live=ledger.current();if(live.status!=='signedIn'||!live.account)throw Error('无法确认当前ChatGPT账号，请完成官方登录后再调用AI。');
  const expected=accountSnapshot(control.account),actual=live.account;
  if(expected&&expected.email.toLowerCase()!==actual?.email.toLowerCase())throw Error('此任务记录的ChatGPT账号与当前账号不同，请切回原账号，或用当前账号建立新任务。');
  control.account=actual;return actual;
 };
 const invoke=fn=>{try{return Promise.resolve(fn());}catch(error){return Promise.reject(error);}};
 const overrides={
  capture,
  account:async()=>{try{const account=await raw.account();await ledger.observe(account);return account&&ledger.current().account?{email:String(account.email||'').slice(0,254),plan:String(account.plan||'unknown').slice(0,64)}:null;}catch(error){ledger.unavailable();throw error;}},
  logout:async()=>{const result=await raw.logout();await ledger.observe(null,'explicitLogout');return result;},
  begin:(job,...args)=>invoke(()=>{capture(job);return raw.begin(job,...args);}),
  critique:(image,reference=null,instructions=null,extra=[],control=null)=>invoke(()=>{control||={};capture(control);return raw.critique(image,reference,instructions,extra,control);}),
  analyzeImages:(images,instructions,control=null)=>invoke(()=>{control||={};capture(control);return raw.analyzeImages(images,instructions,control);}),
 };
 return new Proxy(raw,{get(target,key){if(Object.hasOwn(overrides,key))return overrides[key];const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
}
