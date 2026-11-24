// Independently served frontend; reverse proxy keeps local CSRF and model assets same-origin.
import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
const port=Number(process.env.FRONTEND_PORT||4319),backend=new URL(process.env.BACKEND_URL||'http://127.0.0.1:4317');
if(!['127.0.0.1','localhost'].includes(backend.hostname)||backend.protocol!=='http:'||backend.username||backend.password)throw Error('BACKEND_URL must be a local HTTP backend.');
http.createServer(async(req,res)=>{const host=req.headers.host||'';if(!/^(localhost|127\.0\.0\.1):\d+$/.test(host)){res.writeHead(403).end();return;}
  const url=new URL(req.url,`http://${host}`);if(req.method==='GET'&&(url.pathname==='/creative'||url.pathname==='/creative/'||url.pathname==='/workflows'||url.pathname==='/workflows/'||url.pathname==='/server'||url.pathname==='/server/'||url.pathname==='/color'||url.pathname==='/color/'||/^\/color\/(app\.js|engine\.js|masks\.js|worker\.js|workflow-client\.js|workflows\.js|effects\.js|creative\.js|creative-multi\.js|server\.js|style\.css)$/.test(url.pathname))){try{const name=path.basename(url.pathname)||'index.html',file=/\.(js|css)$/.test(name)?name:url.pathname.startsWith('/server')?'server.html':url.pathname.startsWith('/workflows')?'workflows.html':url.pathname.startsWith('/creative')?'creative.html':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');res.end(await readFile(new URL('../frontend/'+file,import.meta.url)));}catch{res.writeHead(404).end();}return;}
  // Never rewrite untrusted origins into a trusted backend origin.
  if(req.method==='POST'&&req.headers.origin!==`http://${host}`){res.writeHead(403).end();return;}
  if(!/^(\/$|\/(app\.js|catalog\.js|model-picker\.js|model-options\.js|scene-options\.js|belly-options\.js|scene-ui\.js|subject-mask\.js|portrait-options\.js|portrait-ui\.js|style\.css|favicon\.svg)$|\/api\/|\/vision\/|\/models\/|\/images\/|\/downloads\/)/.test(url.pathname)){res.writeHead(404).end('Open the retouch page on the backend port.');return;}
  const headers={...req.headers,host:backend.host};if(req.method==='POST')headers.origin=backend.origin;
  const upstream=http.request(new URL(url.pathname+url.search,backend),{method:req.method,headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'});res.end('后端未连接，请先启动网站。');});req.pipe(upstream);
}).listen(port,'127.0.0.1',()=>console.log(`调色前端：http://127.0.0.1:${port}/color/ → ${backend.origin}`));
