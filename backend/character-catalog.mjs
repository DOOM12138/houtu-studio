import {fictionalTitle} from '../public/scene-guide.js';
import {wikiBytes} from './scene-wikimedia.mjs';

// Resolve a proposed fictional name against its work. A catalogue match is not
// proof that a photograph depicts that character. Unknown subclasses are omitted.
const characterTypes=new Set(['Q95074','Q15632617','Q1569167','Q125130106']);
const itemId=id=>typeof id==='string'&&/^Q[1-9]\d{0,11}$/.test(id);
const key=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu,'');
function names(entity){
 return [...Object.values(entity?.labels||{}),...Object.values(entity?.aliases||{}).flat()].map(v=>v?.value).filter(v=>typeof v==='string');
}
function label(entity){
 for(const lang of ['zh-hans','zh','en','ja'])if(entity?.labels?.[lang]?.value)return entity.labels[lang].value;
 return '';
}
function claims(entity,property){
 return [...new Set((entity?.claims?.[property]||[]).filter(s=>s.rank!=='deprecated').map(s=>s.mainsnak?.datavalue?.value?.id).filter(itemId))];
}
const endpoint='https://www.wikidata.org/w/api.php';
async function readApi(params,signal){
 const url=new URL(endpoint);url.search=new URLSearchParams({format:'json',...params}).toString();
 const response=await wikiBytes(url,{signal});
 const result=JSON.parse(response.bytes.toString('utf8'));if(result.error)throw Error('资料查询失败');return result;
}
export async function lookupFictionalCharacter(candidate,{read=readApi,signal=AbortSignal.timeout(8000)}={}){
 const name=fictionalTitle(candidate?.name),work=fictionalTitle(candidate?.work);
 if(!candidate?.canSearchName||!name)return {status:'not-requested'};
 try{
  const search=await read({action:'wbsearchentities',type:'item',language:/[\u3040-\u30ff]/u.test(name)?'ja':/[\u3400-\u9fff]/u.test(name)?'zh':'en',limit:'4',search:name},signal);
  const ids=(search.search||[]).map(r=>r.id).filter(itemId).slice(0,4);
  if(!ids.length)return {status:'no-match'};
  const entities=(await read({action:'wbgetentities',ids:ids.join('|'),props:'labels|aliases|claims',languages:'zh-hans|zh|ja|en'},signal)).entities||{};
  const titles=ids.map(id=>entities[id]).filter(e=>e&&names(e).some(n=>key(n)===key(name)));
  const possible=titles.filter(e=>!claims(e,'P31').includes('Q5')&&claims(e,'P31').some(t=>characterTypes.has(t)));
  if(!possible.length)return {status:titles.length&&titles.every(e=>claims(e,'P31').includes('Q5'))?'not-fictional':'no-match'};
  const works=[...new Set(possible.flatMap(e=>[...claims(e,'P1441'),...claims(e,'P1080')]))].slice(0,16);
  if(!works.length||!work)return {status:'unconfirmed-work'};
  const details=(await read({action:'wbgetentities',ids:works.join('|'),props:'labels|aliases',languages:'zh-hans|zh|ja|en'},signal)).entities||{};
  const matching=possible.map(e=>({e,workIds:[...claims(e,'P1441'),...claims(e,'P1080')].filter(id=>names(details[id]).some(n=>key(n)===key(work)))})).filter(v=>v.workIds.length);
  if(matching.length!==1)return {status:matching.length?'ambiguous':'unconfirmed-work'};
  const {e,workIds}=matching[0],workId=workIds[0];
  if(!itemId(e.id))return {status:'no-match'};
  return {status:'matched-record',id:e.id,name:label(e)||name,work:label(details[workId])||work,enName:fictionalTitle(e.labels?.en?.value),enWork:fictionalTitle(details[workId]?.labels?.en?.value),workId,url:'https://www.wikidata.org/wiki/'+e.id,workUrl:'https://www.wikidata.org/wiki/'+workId};
 }catch{return {status:'unavailable'};}
}
