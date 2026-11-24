// Native ORT lives in a plain child process, as it does in production.
import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import * as ort from 'onnxruntime-node';import {SR_MODELS} from '../../public/superres-options.js';
delete process.env.NODE_TEST_CONTEXT;
const fixtures=JSON.parse(await fs.readFile(new URL('../fixtures/superres-parity.json',import.meta.url),'utf8')),records=[];
for(const c of fixtures.cases){const model=SR_MODELS.find(m=>m.id===c.model),session=await ort.InferenceSession.create(fileURLToPath(new URL('../../models/superres/'+model.file,import.meta.url)),{executionProviders:['cpu'],intraOpNumThreads:2});try{const input=new ort.Tensor('float32',Float32Array.from(c.input),c.inputShape),value=(await session.run({input})).output;assert.deepEqual(value.dims,c.outputShape);let maximum=0;for(let i=0;i<c.output.length;i++)maximum=Math.max(maximum,Math.abs(value.data[i]-c.output[i]));assert.ok(maximum<.0002,c.model+' maximum error '+maximum);records.push({model:c.model,maximum});value.dispose();input.dispose();}finally{await session.release();}}
console.log(JSON.stringify({verified:records.length,records}));
