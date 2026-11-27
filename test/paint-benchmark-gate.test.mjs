import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluatePaintCases} from '../scripts/paint-benchmark-gate.mjs';

const categories=['dark-face','split-light','even-bright','full-body'];
const digest=n=>n.toString(16).padStart(64,'0');
const row=(category,n)=>({category,revision:'test-revision',partition:'held-out',videoURL:'https://www.bilibili.com/video/BV1Qc411h78F/',referenceTool:'yao-ai',toolEvidenceSeconds:20,toolEvidenceNote:'synthetic panel observation',beforeSeconds:10,afterSeconds:35,sourceSha256:digest(n*3),targetSha256:digest(n*3+1),resultSha256:digest(n*3+2),reviewer:'fixture',note:'synthetic',colourStable:true,structureStable:true,scores:{palette:98,lighting:98,contour:98,makeup:98,texture:98,seams:98}});
const evaluate=rows=>evaluatePaintCases(rows,{revision:'test-revision'});
test('98-point gate requires 50 distinct reviewed results in each class and rejects duplicates and drift',()=>{
 const rows=categories.flatMap((category,j)=>Array.from({length:50},(_,i)=>row(category,j*50+i+1)));
 assert.equal(evaluate(rows).pass,true);
 assert.equal(evaluate([{...rows[0],referenceTool:'photoshop'},...rows.slice(1)]).pass,false);
 assert.equal(evaluate(rows.slice(1)).summary['dark-face'].missing,1);
 assert.equal(evaluate(rows.filter(r=>r.category!=='even-bright')).summary['even-bright'].missing,50);
 assert.equal(evaluate([{...rows[0],videoURL:'https://www.youtube.com/watch?v=placeholder'},...rows.slice(1)]).pass,false);
 assert.equal(evaluate([{...rows[0],videoURL:'https://www.douyin.com/video/7705728905684599891'},...rows.slice(1)]).pass,true);
 assert.equal(evaluate([...rows,{...rows[0],category:'full-body'}]).pass,false);
 assert.equal(evaluate([{...rows[0],colourStable:false},...rows.slice(1)]).summary['dark-face'].failed,1);
 assert.equal(evaluate([{...rows[0],partition:'training'},...rows.slice(1)]).pass,false);
});
