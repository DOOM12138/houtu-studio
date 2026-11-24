export const UPDATE_REPO='DOOM12138/houtu-studio';
export const UPDATE_REPO_URL='https://github.com/'+UPDATE_REPO;
export const UPDATE_PROTOCOL=1;
// Private directories are deliberately absent. Keep recovery helpers outside this set.
export const PROGRAM_ENTRIES=['server.mjs','launcher.mjs','lib','public','frontend','backend','models','scripts','vendor-licenses','runtime','node_modules','defaults','package.json','package-lock.json','README.md','DEPLOY.md','SOURCES.md','AGENTS.md','agent.md','ARCHITECTURE.md','GIT_WORKFLOW.md','FEATURES.md','FEATURE_PARITY.md','PROMPT_LAB.md','CHANGELOG.md','LICENSE','.npmrc','THIRD-PARTY-NOTICES.txt','portable-manifest.json','开发终端.cmd','启动网站.cmd','停止网站.cmd','一键部署.cmd','启动服务器.cmd','服务器管理.cmd','停止服务器.cmd','检查更新.cmd','回退版本.cmd'];
export function parseVersion(value){const m=/^v?(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.exec(String(value));if(!m)throw Error('版本号格式不受支持。');return m.slice(1).map(Number);}
export function compareVersions(a,b){const x=parseVersion(a),y=parseVersion(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;}
export function releaseInfo(raw){
 if(raw?.draft||raw?.prerelease)throw Error('更新源不是公开稳定版本。');const version=parseVersion(raw.tag_name).join('.'),tag='v'+version,name='houtu-studio-'+version+'-Windows-x64.zip',asset=(raw.assets||[]).find(a=>a.name===name&&a.state==='uploaded');
 const release={version,tag,url:UPDATE_REPO_URL+'/releases/tag/'+tag,title:String(raw.name||tag).slice(0,200),notes:String(raw.body||'').slice(0,20000),publishedAt:String(raw.published_at||''),asset:null};if(!asset)return release;
 const url=UPDATE_REPO_URL+'/releases/download/'+tag+'/'+name;if(asset.browser_download_url!==url||!Number.isSafeInteger(asset.id)||asset.id<1||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>2*1024**3)throw Error('发布安装包信息不完整。');
 const checksumName='houtu-studio-'+version+'-SHA256.txt',checksum=(raw.assets||[]).find(a=>a.name===checksumName&&a.state==='uploaded'),digest=/^sha256:([a-f0-9]{64})$/.exec(asset.digest||'')?.[1]||null;release.asset={id:asset.id,name,url,size:asset.size,sha256:digest,checksumUrl:checksum?.browser_download_url===UPDATE_REPO_URL+'/releases/download/'+tag+'/'+checksumName?checksum.browser_download_url:null};return release;
}
export function safePackagePath(value){
 if(typeof value!=='string'||!value||value.length>1200||value.includes('\\')||value.startsWith('/'))throw Error('更新包含无效路径。');const parts=value.split('/');if(parts.some(p=>!p||p==='.'||p==='..'||/[<>:"|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error('更新包含不安全路径。');if(!PROGRAM_ENTRIES.includes(parts[0])||parts.some(p=>/^(auth\.json|\.env(?:\..*)?|config\.toml)$/i.test(p))||/\.log$/i.test(parts.at(-1)))throw Error('更新包出现非程序文件。');return value;
}
