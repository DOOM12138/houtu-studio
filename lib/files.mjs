import {constants} from 'node:fs';
import {rename,link,copyFile} from 'node:fs/promises';

// Android's app sandbox forbids hard links. Copy without replacing an existing
// destination; callers must validate EEXIST before reusing immutable content.
export async function linkOrCopyFile(source,target,{platform=process.platform,linkFile=link}={}){
 if(platform!=='android'){
  try{await linkFile(source,target);return;}
  catch(error){if(!['EACCES','EPERM','EXDEV','EOPNOTSUPP','ENOTSUP'].includes(error.code))throw error;}
 }
 await copyFile(source,target,constants.COPYFILE_EXCL);
}

// Windows scanners and concurrent readers can briefly deny replacement. Keep the
// existing checkpoint intact and retry the atomic rename; never unlink it first.
export async function replaceFile(source,target){
 const delays=[20,40,80,120,200,320,500];
 for(let attempt=0;;attempt++){
  try{await rename(source,target);return;}
  catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=delays.length)throw error;await new Promise(resolve=>setTimeout(resolve,delays[attempt]));}
 }
}
