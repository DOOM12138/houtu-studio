export function workflowSection(workflow){
 const section=(Object.assign(Object.create(null),{'image-handoff':'source','image-import':'source','manual-portrait':'portrait',color:'color',retouch:'ai',creative:'ai','portrait-audit':'ai','studio-plan':'ai','retouch-agent':'ai','agent-batch':'ai',pipeline:'project'}))[workflow.kind]||'unknown';
 const analysis=workflow.steps.find(s=>s.id==='analysis'),usesAI=section==='ai'||workflow.kind==='color'&&Boolean(analysis?.attempts?.length);
 const state=workflow.steps.some(s=>s.status==='running')?'running':workflow.steps.some(s=>s.status==='error')?'error':workflow.steps.some(s=>s.status==='interrupted')?'interrupted':workflow.steps.at(-1)?.status==='done'?'done':workflow.steps.some(s=>s.status==='stale')?'stale':'pending';
 return {section,usesAI,state};
}
export const WORKFLOW_KINDS={'image-handoff':'跨板块图片','image-import':'RAW／位图导入','manual-portrait':'人物手动修图',retouch:'AI 人物精修',creative:'AI 创作与合成','portrait-audit':'AI 人物检查','studio-plan':'智能调度方案','retouch-agent':'修图Agent','agent-batch':'Agent批次',color:'调色',pipeline:'照片配方'};
