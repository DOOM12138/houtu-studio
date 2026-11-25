// Enforce transport limits without buffering the remaining body or aborting the
// socket before the caller can receive an HTTP 413 response.
export function readRequestBytes(req,maxBytes,message='上传内容过大。'){
 const tooLarge=()=>Object.assign(Error(message),{status:413});
 if(Number(req.headers['content-length'])>maxBytes){req.once('error',()=>{});req.resume();return Promise.reject(tooLarge());}
 return new Promise((resolve,reject)=>{
  const chunks=[];let size=0;
  const cleanup=()=>{req.off('data',data);req.off('end',end);req.off('error',error);req.off('aborted',aborted);};
  const error=reason=>{cleanup();chunks.length=0;req.once('error',()=>{});reject(reason);};
  const aborted=()=>error(Object.assign(Error('上传已中断，请重新选择文件。'),{status:400}));
  const data=chunk=>{size+=chunk.length;if(size>maxBytes){error(tooLarge());req.resume();return;}chunks.push(chunk);};
  const end=()=>{cleanup();resolve(Buffer.concat(chunks,size));};
  req.on('data',data);req.once('end',end);req.once('error',error);req.once('aborted',aborted);
 });
}
