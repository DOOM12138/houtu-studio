import {rename} from 'node:fs/promises';

// Windows scanners and concurrent readers can briefly deny replacement. Keep the
// existing checkpoint intact and retry the atomic rename; never unlink it first.
export async function replaceFile(source,target){
 const delays=[20,40,80,120,200,320,500];
 for(let attempt=0;;attempt++){
  try{await rename(source,target);return;}
  catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=delays.length)throw error;await new Promise(resolve=>setTimeout(resolve,delays[attempt]));}
 }
}
