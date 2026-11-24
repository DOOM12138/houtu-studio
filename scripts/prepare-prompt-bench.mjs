// Builds reproducible cases, never makes a model call. Outputs stay private on the project drive.
import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {PRESETS} from '../public/catalog.js';
import {featureDefault,PROMPT_VERSION} from '../public/prompt-contract.js';
import {paintingPrompt} from '../lib/painting.mjs';
import {prepareEditImage} from '../lib/images.mjs';
import {expandedCanvas} from '../backend/feature-images.mjs';
import {PROMPT_SPECS,promptHash} from '../lib/prompt-registry.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
export async function prepareBench(manifestFile,output){
 const relative=path.relative(ROOT,path.resolve(output));if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||!/^data[\\/]/.test(relative))throw Error('试图任务必须保存在项目data目录下。');
 const manifest=JSON.parse(await readFile(manifestFile,'utf8'));await mkdir(output,{recursive:true});const jobs=[];
 for(const tool of PRESETS){
  const face=['face','eyes','makeup','skin','blemish','dark-circles','eye-bags','face-lines','teeth','nose-refine','lip-refine','face-shape','iris-color','skin-oil'].includes(tool.id),anime=tool.id==='anime-paint',sourceKey=anime?'anime':face&&tool.id!=='teeth'?'cos':['full-body','portrait-polish','cos-paint','hair','hair-flow','hair-lift','hair-glow','hair-draw','wig-gap'].includes(tool.id)?'cos':'body',source=manifest.sources[sourceKey];if(!source)throw Error('缺少样例来源 '+sourceKey);
  const bytes=await readFile(source.file),selection=face?(sourceKey==='cos'?{x:.28,y:.28,width:.30,height:.22}:{x:.30,y:.015,width:.4,height:.20}):null,options={operation:tool.id,style:tool.style||(anime?'anime':tool.id==='full-body'?'cos':'natural'),paintLevel:2,strength:'light',selection,prompt:featureDefault(tool),task:{level:2,longEdge:4096,padding:20,direction:'all',target:''}},p=await prepareEditImage(bytes,selection);let input=p.editImage||p.source,expansion=null;
  if(tool.id==='custom')options.prompt='只整理原有发梢少量杂乱发丝，保留人物身份、发型、发色、衣服、道具和原背景。';
  if(tool.id==='object-extract')options.task.target='原图中的木手杖，只展示可见结构，不虚构背面。';
  if(tool.id==='outfit-extract')options.task.target='青绿色刺绣长外套的可见部分，保留领口、刺绣和衣摆，不补画背面。';
  if(tool.id==='render3d-half')options.task.target='只将木手杖的材质表现转为三维渲染质感，其余保持。';
  if(tool.id==='body-shape'||tool.id==='garment-fit')options.task.target='只轻微整理腰侧外套松量，保留自然比例、腰带与全部刺绣。';
  if(tool.id==='iris-color')options.task.target='保留原紫色瞳色，只协调眼神光与虹膜边缘。';
  if(tool.id==='element-transfer')options.task.target='参考图中的棕色毛绒玩偶，作为靴子旁地面的小摆件，不遮挡人物或手杖。';
  if(tool.id==='outfit-transfer')options.task.target='仅借用参考上衣的灰蓝配色与领结元素，原目标的裤装、鞋、姿势和手杖保留。';
  if(tool.id==='pose-transfer')options.task.target='参考上肢自然收拢的动势，目标人物仍握着原木杖，不搬入参考玩偶，不补画画外身体。';
  if(tool.output==='outpaint'){const expanded=await expandedCanvas(p.source,options.task);input=expanded.bytes;expansion=expanded.layout;await writeFile(path.join(output,tool.id+'-mask.png'),expanded.mask);}
  const file=path.join(output,tool.id+'-input.png');await writeFile(file,input);const m=await sharp(input).metadata(),width=1024,height=Math.max(640,Math.ceil(1024*m.height/m.width/16)*16),size=height>3072?'1024x3072':height<768?'1536x1024':'1024x'+height;
  const references=tool.referenceRole?[{...manifest.sources.cos,role:tool.referenceRole}]:[],legend=references.map((r,i)=>'图'+(2+(selection?1:0)+i)+'：功能参考 '+r.role+'；只借用本次明确需要的特征，不替换目标人物身份。').join('\n'),prompt=paintingPrompt({...options,region:p.region,expansion})+(legend?'\n'+legend:'');
  const job={id:tool.id,name:tool.name,version:PROMPT_SPECS.find(s=>s.id===tool.id).version,caseId:['body-definition','stockings-repair'].includes(tool.id)?'invariant-negative':'visible-task',sourceKey,source,options,selection,region:p.region,expansion,input:file,references,prompt,promptHash:promptHash(prompt),size,quality:'high',criteria:PROMPT_SPECS.find(s=>s.id===tool.id).criteria,status:'pending'};
  await writeFile(path.join(output,tool.id+'.json'),JSON.stringify(job,null,2));jobs.push({id:job.id,name:job.name,status:job.status});
 }
 await writeFile(path.join(output,'queue.json'),JSON.stringify({version:PROMPT_VERSION,created:Date.now(),jobs},null,2));return {jobs:jobs.length,output};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const [manifest,output]=process.argv.slice(2);if(!manifest||!output)throw Error('用法：prepare-prompt-bench.mjs 私有来源清单.json 项目data/任务目录');console.log(JSON.stringify(await prepareBench(manifest,output)));}
