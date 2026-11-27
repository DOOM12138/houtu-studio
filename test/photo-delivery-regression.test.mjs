import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import { WorkflowStore } from '../backend/workflows.mjs';
import { WorkspaceHandoffs } from '../backend/workspace-handoffs.mjs';
import { exportProjectPhotos } from '../backend/studio-archive.mjs';

async function temp(t) {
 const root=await mkdtemp(path.join(tmpdir(),'photo-delivery-regression-'));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 return root;
}

test('handoffs display EXIF-oriented dimensions for new and historical records without changing source bytes',async t=>{
 const directory=await temp(t),workflows=new WorkflowStore(directory);
 await workflows.load();
 const service=await new WorkspaceHandoffs(directory,{workflows}).load();
 const bytes=await sharp({create:{width:96,height:144,channels:3,background:'#8b6044'}}).jpeg().withMetadata({orientation:7}).toBuffer();
 const props=await service.ingest(bytes,'portrait.jpg');
 const first=await service.create(props);
 assert.deepEqual([first.width,first.height],[144,96]);
 assert.equal(first.dimensionSpace,'display');
 const file=path.join(service.root,first.id+'.json');
 const legacy={...first,width:96,height:144};
 delete legacy.dimensionSpace;
 await writeFile(file,JSON.stringify(legacy));
 const previous=await service.get(first.id);
 assert.deepEqual([previous.width,previous.height],[144,96]);
 const reused=await service.create({...props,previousId:first.id});
 assert.equal(reused.id,first.id);
 assert.deepEqual(await readFile((await workflows.asset(first.workflowId,first.assetId)).file),bytes);
});

test('batch deliveries use actual format, recover Windows device names and include each selected photo once',async t=>{
 const directory=await temp(t);
 await mkdir(path.join(directory,'exports'));
 const photos=[],known=new Map(),files=[];
 const definitions=[
  ['CON.version.png','jpeg','#44aa66','_CON.version.jpg'],
  ['Café.JPG','png','#a68664','Café.png'],
  ['CAFE\u0301.png','png','#2774a6','CAFÉ-002.png'],
  ['A'.repeat(99)+'🪶.webp','webp','#ba4850','A'.repeat(99)+'.webp'],
  ['长'.repeat(99)+'.png','png','#203040','长'.repeat(76)+'.png'],
 ];
 for(const [fileName,format,color,expected] of definitions){
  const id=randomUUID(),wf=randomUUID(),file=path.join(directory,id);
  const image=await sharp({create:{width:37,height:24,channels:3,background:color}}).toFormat(format).toBuffer();
  await writeFile(file,image);
  const photo={id,selected:true,flag:'none',name:fileName};
  photos.push(photo);
  known.set(id,{photo,workflow:{id:wf,steps:[{id:'deliver',status:'done',output:{imageAsset:id,fileName}}]}});
  files.push({id,file,expected,image,type:'image/'+format});
 }
 const studio={directory,adapter:{isBusy:()=>false},queues:new Map(),workflows:{asset:async (_,id)=>files.find(item=>item.id===id)},
  get:async()=>({name:'测试交付',photos}),photo:async (_,id)=>known.get(id)};
 const receipt=await exportProjectPhotos(studio,randomUUID(),[...photos.map(photo=>photo.id),photos[1].id]);
 assert.equal(receipt.count,5);
 assert.equal(receipt.skipped,0);
 const zip=unzipSync(await readFile(path.join(directory,'exports',receipt.id+'.zip')));
 assert.equal(Object.keys(zip).length,5);
 for(const item of files)assert.deepEqual(Buffer.from(zip[item.expected]),item.image);
});
