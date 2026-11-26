import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {ownedAgentPath} from '../backend/local-agent-paths.mjs';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,HASH=/^[a-f0-9]{64}$/;
export async function workflowImage(workflows,ref,{read=false}={}){
 if(!ref||!UUID.test(ref.workflowId||'')||!HASH.test(ref.assetId||''))throw Error('图片来源编号无效。');const w=await workflows.get(ref.workflowId),candidates=[];
 for(const n of w.steps){const matches=o=>o?.imageAsset===ref.assetId||w.kind==='creative'&&n.id==='source'&&o?.source===ref.assetId;for(const a of n.attempts||[])if(a.status==='done'&&matches(a.output))candidates.push({step:n.id,attempt:a.id});if(n.status==='done'&&matches(n.output)&&!candidates.some(x=>x.step===n.id&&x.attempt===n.attempts?.at(-1)?.id))candidates.push({step:n.id,attempt:null});}
 const selected=[...candidates].reverse().find(c=>(!ref.stepId||ref.stepId===c.step)&&(!ref.attemptId||ref.attemptId===c.attempt));if(!selected)throw Error('只能使用所选已完成步骤的图片，原版本不会自动替换。');const asset=await workflows.asset(w.id,ref.assetId);if(!['image/png','image/jpeg','image/webp'].includes(asset.type))throw Error('来源不是可编辑图片。');await ownedAgentPath(workflows.root,asset.file);const info=await fs.stat(asset.file);if(!info.isFile()||info.size>110*1024*1024)throw Error('来源图片文件异常。');let bytes;
 if(read){bytes=await fs.readFile(asset.file);if(!['image/png','image/jpeg','image/webp'].some(type=>createHash('sha256').update(type).update(bytes).digest('hex')===ref.assetId))throw Error('来源图片校验失败。');}
 return {w,asset,bytes,origin:{kind:'workflow',workflowId:w.id,assetId:ref.assetId,stepId:selected.step,attemptId:selected.attempt,role:w.kind==='image-import'&&selected.step==='develop'?'developed':selected.step==='source'?'input':'result'}};
}
