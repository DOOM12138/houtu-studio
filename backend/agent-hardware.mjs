import os from 'node:os';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';
import {localAgentEnvironment,localAgentLocations} from '../lib/local-agent-environment.mjs';
import {ownedAgentDirectory,ownedAgentTree} from './local-agent-paths.mjs';
export const GiB=1024**3,HARDWARE_POLICY_VERSION='agent-hardware-v1';
export const LOCAL_AGENT_MODELS=[
 {id:'qwen3-vl:4b',name:'Qwen3-VL 4B Q4_K_M',digest:'a1b29c246319cdcb1f3842f36d29f198f737c0cf516ba1bcba34b1b974e87980',vram:7.5*GiB,freeVram:7*GiB,ram:16*GiB,freeRam:6*GiB,downloadBytes:3336619180},
 {id:'qwen3-vl:8b',name:'Qwen3-VL 8B Q4_K_M',digest:'9cf69da2b16d097f7def535917c4b55a95d6c7ee5700eb69ab86b01b3cfca487',vram:11.5*GiB,freeVram:10.5*GiB,ram:24*GiB,freeRam:10*GiB,downloadBytes:6190971699},
];
const root=fileURLToPath(new URL('../',import.meta.url)),execute=promisify(execFile);
export function chooseAgentCompute(snapshot,{policy='auto',model='auto'}={}){
 const base={version:HARDWARE_POLICY_VERSION,requested:policy,hardware:snapshot,localModel:null,effective:'cloud',provider:'chatgpt'};
 if(policy==='cloud')return {...base,reason:'你选择纯云端AI，不加载本地模型。'};
 if(snapshot.platform!=='win32'||snapshot.arch!=='x64')return {...base,reason:'此平台尚未验证本地视觉Agent的GPU运行时，使用纯云端AI。'};
 if(!['ramBytes','freeRamBytes','cpuThreads'].every(k=>Number.isFinite(snapshot[k])&&snapshot[k]>0))return {...base,reason:'CPU或可用内存信息不完整，保守采用纯云端AI。'};
 const gpus=(snapshot.gpus||[]).filter(g=>g.verified===true&&g.software===false&&Number.isFinite(g.dedicatedBytes)&&g.dedicatedBytes>=7.5*GiB&&(g.freeBytes==null||Number.isFinite(g.freeBytes))).sort((a,b)=>b.dedicatedBytes-a.dedicatedBytes);
 const hardwareAdapters=new Set((snapshot.gpus||[]).filter(g=>g.verified===true&&g.software===false).map(g=>g.uuid||g.id||g.name+':'+g.index));
 if(!gpus.length)return {...base,reason:'未检测到经确认且至少8 GiB专用显存的显卡；共享内存不计作显存，使用纯云端AI。'};
 for(const profile of [...LOCAL_AGENT_MODELS].reverse())for(const gpu of gpus){if(model!=='auto'&&profile.id!==model)continue;if(!gpu.uuid&&(hardwareAdapters.size!==1||!gpu.id))continue;const resident=snapshot.residentLocalModel?.id===profile.id&&snapshot.residentLocalModel.gpuVerified,freeRam=resident?(profile.id.endsWith('8b')?3:2)*GiB:profile.freeRam;if(gpu.dedicatedBytes<profile.vram||gpu.freeBytes!=null&&gpu.freeBytes+(gpu.agentResidentBytes||0)<profile.freeVram||snapshot.ramBytes<profile.ram||snapshot.freeRamBytes<freeRam||snapshot.cpuThreads<4)continue;return {...base,effective:'hybrid',provider:'hybrid',gpu:{...gpu,binding:gpu.uuid?'cuda-uuid':'sole-hardware-adapter',routeGpuId:gpu.uuid||'dxgi:'+gpu.id},localModel:profile,reason:'显卡和内存满足'+profile.name+'的保守门槛；本地视觉Agent负责分析、规划和检查，云端负责出图；实际GPU驻留验证后才读取照片。'};}
 if(gpus.some(g=>!g.uuid)&&hardwareAdapters.size>1)return {...base,reason:'多显卡的Vulkan设备暂不能可靠绑定，保守采用纯云端AI。'};
 return {...base,reason:'显存、可用显存或可用内存不足以运行所选本地视觉Agent，使用纯云端AI。'};
}
export class AgentHardware{
 constructor({probe=execute,platform=process.platform,arch=process.arch,system=os}={}){Object.assign(this,{probe,platform,arch,system});this.pending=null;this.cached=null;}
 async snapshot({refresh=false}={}){if(!refresh&&this.cached&&Date.now()-this.cached.detectedAt<30000)return structuredClone(this.cached);if(this.pending)return structuredClone(await this.pending);this.pending=this.detect().then(s=>{this.cached=s;return structuredClone(s);}).finally(()=>this.pending=null);return this.pending;}
 async detect(){const result={platform:this.platform,arch:this.arch,detectedAt:Date.now(),ramBytes:this.system.totalmem(),freeRamBytes:this.system.freemem(),cpuThreads:this.system.availableParallelism?.()||this.system.cpus().length,gpus:[],warnings:[]};const temporary=localAgentLocations(root,path.join(root,'data/local-agent')).temporary;try{await ownedAgentDirectory(root,temporary);await ownedAgentTree(root,temporary);}catch{result.warnings.push('专用临时目录无法安全确认，采用云端路线。');return result;}const options={cwd:root,env:localAgentEnvironment(root,path.join(root,'data/local-agent')),windowsHide:true,timeout:8000,maxBuffer:1024*1024,encoding:'utf8'};
  if(this.platform==='win32')try{const r=await this.probe(path.join(process.env.SystemRoot||process.env.WINDIR||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/probe-agent-gpu.ps1')],options),j=JSON.parse(r.stdout.replace(/^\uFEFF/,''));result.gpus=(j.gpus||[]).map(g=>({...g,verified:true,freeBytes:null}));}catch{result.warnings.push('DXGI显卡信息不可确认，不根据共享内存猜测显存。');}
  if(this.platform==='win32'||this.platform==='linux')try{const r=await this.probe(this.platform==='win32'?path.join(process.env.SystemRoot||process.env.WINDIR||'C:/Windows','System32/nvidia-smi.exe'):'/usr/bin/nvidia-smi',['--query-gpu=uuid,name,memory.total,memory.free','--format=csv,noheader,nounits'],options);const parsed=[];for(const line of r.stdout.trim().split(/\r?\n/)){const [uuid,name,total,free]=line.split(',').map(s=>s.trim()),dedicatedBytes=Number(total)*1024**2,freeBytes=Number(free)*1024**2;if(!uuid?.startsWith('GPU-')||!Number.isFinite(dedicatedBytes)||!Number.isFinite(freeBytes))continue;parsed.push({uuid,name,dedicatedBytes,freeBytes,vendorId:4318,verified:true,software:false,source:'nvidia-smi'});}if(parsed.length)result.gpus=[...result.gpus.filter(g=>g.vendorId!==4318),...parsed];}catch{}
  return result;
 }
 async route(config){return chooseAgentCompute(await this.snapshot(),{policy:config.hardwarePolicy||'auto',model:config.localAgentModel||'auto'});}
}
