import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,compile,matchReference,referenceColorAnalysis,render} from '../frontend/engine.js';

const width=48,height=48;
const points=Uint8ClampedArray.from({length:width*height*4},(_,i)=>{
  const p=i>>2,x=p%width,y=Math.floor(p/width);
  return i%4===3?255:34 + (x*11+y*3+(Math.floor(y/8)%2)*71)%175+(i%4)*7;
});
const makeMatch = (a,b,amount) => matchReference(referenceColorAnalysis(a,width,height),referenceColorAnalysis(b,width,height),amount);

test('same-photo reference and zero strength preserve original pixels',()=>{
  assert.deepEqual(render(points,width,height,makeMatch(points,points,.7)),points);
  const tinted=render(points,width,height,{temperature:-40});
  assert.deepEqual(render(points,width,height,makeMatch(points,tinted,0)),points);
  assert.equal(compile(matchReference(analyze(points),analyze(points),1)).identity,true);
});

test('registered same-photo match uses bounded monotonic channel curves and preserves alpha',()=>{
  const brighter=render(points,width,height,{curves:{r:[0,.35,.58,.82,1],g:[0,.25,.5,.76,1],b:[0,.21,.47,.71,1]}});
  const matched=makeMatch(points,brighter,1);
  assert.notDeepEqual(matched.curves.r,[0,.25,.5,.75,1]);
  assert.equal(matched.exposure,0);
  for(const values of Object.values(matched.curves)){
    assert.ok(values.every((v,i)=>i===0||v>values[i-1]));
    assert.equal(values[0],0);
    assert.equal(values.at(-1),1);
  }
  const candidate=render(points,width,height,matched);
  const error=pixels=>pixels.reduce((sum,v,i)=>sum+Math.abs(v-brighter[i]),0);
  assert.ok(error(candidate)<error(points)*.55);
  for(let i=3;i<candidate.length;i+=4)assert.equal(candidate[i],points[i]);
});

test('different layout or missing layout uses the conservative global reference controls',()=>{
  const unrelated=points.map((value,i)=>i%4===3?value:82+(i%4)*33);
  const match=makeMatch(points,unrelated,.7);
  assert.deepEqual(match.curves.r,[0,.25,.5,.75,1]);
  assert.notEqual(match.temperature,0);
  assert.deepEqual(match,matchReference(analyze(points),analyze(unrelated),.7));
});
