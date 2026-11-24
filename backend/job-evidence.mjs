import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Capture immutable assets and the exact generation checkpoint, never recompile a
// historical request from today's defaults. Recomposition changes the ticket.
export async function jobEvidence(job,workflows){
 if(!job||job.status!=='done'||!job.workflowId)throw Error('请先完成一张真实出图。');
 const w=await workflows.get(job.workflowId),state=id=>w.steps.find(n=>n.id===id)?.output;
 const source=state('source'),prepared=state('prepare'),generated=state('generate'),composed=state('compose');
 if(!source?.imageAsset||!prepared?.inputAsset||!generated?.rawAsset||!generated.compiledPrompt||!composed?.imageAsset)throw Error('这份旧任务缺少完整请求或产物记录，不能自动验收。');
 const legacyReferences=[...(source.referenceAssets||[]).map(assetId=>({assetId,role:'identity',title:'身份参考'})),...(source.featureReferences||[])];const references=generated.sentInputs?generated.sentInputs.filter(r=>r.role!=='edit-target'):legacyReferences;
 const payload={operation:job.operation,version:generated.promptVersion,options:{...source.options,task:composed.task||job.task||source.options.task},region:prepared.region||null,expansion:prepared.expansion||null,exactPrompt:generated.compiledPrompt,requestedModel:generated.resolvedModel||generated.model||'',modelKnown:Boolean(generated.resolvedModel||generated.model),generationRunId:generated.generationRunId||null,inputBindingsComplete:Boolean(generated.sentInputs),sourceKind:'website-job',origin:'本站已保存出图',jobId:job.id,runId:generated.generationRunId||null,compositionRunId:job.runId,composition:composed.composition||null};
 const assets={source:source.imageAsset,inputFrame:prepared.inputAsset,raw:generated.rawAsset,result:composed.imageAsset,references};
 const ticket=hash([w.id,w.revision,payload,assets]);
 const url=id=>'/api/workflows/'+w.id+'/assets/'+id;
 return {payload,assets,ticket,workflowId:w.id,revision:w.revision,preview:{source:url(assets.source),input:url(assets.inputFrame),raw:url(assets.raw),result:url(assets.result),references:references.map(r=>({...r,url:url(r.assetId)}))}};
}
export async function saveJobEvidence(job,workflows,lab,input){
 const snapshot=await jobEvidence(job,workflows);if(input.ticket!==snapshot.ticket)throw Error('出图或合成记录已更新，请重新载入后再审阅。');
 const bytes=async id=>readFile((await workflows.asset(snapshot.workflowId,id)).file),a=snapshot.assets;
 const buffers={source:await bytes(a.source),inputFrame:await bytes(a.inputFrame),raw:await bytes(a.raw),result:await bytes(a.result),references:await Promise.all(a.references.map(async r=>({...r,bytes:await bytes(r.assetId)})))};
 // Only review fields come from the browser; provenance comes from checkpoints.
 return lab.saveBuffers({...snapshot.payload,reviewConfirmed:input.reviewConfirmed,verdict:input.verdict,notes:input.notes,caseId:input.caseId},buffers,{trustedJob:true});
}
