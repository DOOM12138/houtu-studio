import {captureWorkspacePicture,navigateWorkspace} from '/workspace-continuation.js';

if (window.parent !== window && new URLSearchParams(location.search).get('embedded') === 'workbench') {
  const token = crypto.randomUUID();
  const send = (type, value = {}) => window.parent.postMessage({scope:'houtu-workbench-tool', token, type, ...value},location.origin);
  const nativeDocs = Boolean(window.parent.houtuDocuments);
  const desktop = Boolean(window.parent.houtuDesktopExports);
  function jump(input) {
    const url = new URL(input,location.origin);
    if (url.origin !== location.origin) return;
    if (/^\/(?:settings|server|logs)\/?$/.test(url.pathname)) send('settings',{url:url.pathname+url.search+url.hash});
    else send('tool',{url:url.href});
  }
  window.houtuEmbeddedNavigate = jump;
  window.houtuEmbeddedPicture = captureWorkspacePicture;
  if (nativeDocs) {
    window.houtuDocuments = {
      postMessage(payload) {
        const request = JSON.parse(payload);
        if(request.type==='saveUrl')save(request.url,request.name,request.mime);
        else if(request.type==='open')window.parent.open(request.url,'_blank');
      }
    };
  }
  function save(url, name, mime) { send('save',{url:new URL(url,location.origin).href,name,mime}); }
  if (nativeDocs || desktop) {
    window.houtuInterceptBlobDownloads(async (blob, name) => {
      const receipt = await window.houtuStageExport(nativeDocs?'/api/mobile/downloads':'/api/desktop/downloads',blob,name);
      save(receipt.downloadUrl,receipt.name,receipt.mime);
    });
  }
  document.addEventListener('click', async event => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.button !== 0 || event.defaultPrevented) return;
    const url = new URL(link.href,location.origin);
    if (url.origin !== location.origin) return;
    const isDownload = link.hasAttribute('download') || url.searchParams.has('download') ||
        /^\/(?:api\/(?:logs\/exports|studio\/downloads|desktop\/downloads)|downloads\/package)\//.test(url.pathname) ||
        /^\/api\/(?:image-imports\/[^/]+\/original|layers\/[^/]+\/project)$/.test(url.pathname);
    if (isDownload) {
      if(nativeDocs || desktop){event.preventDefault();event.stopImmediatePropagation();save(url.href,link.download);}
      return;
    }
    if (link.getAttribute('href')?.startsWith('#')) return;
    if (!/^\/(?:ai(?:\/color)?|color|portrait|layers|creative|upscale|studio|workflows|lab|settings|server|logs)?\/?$/.test(url.pathname)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (url.pathname==='/' && !url.searchParams.has('job')) url.pathname='/ai/';
    if (url.searchParams.has('imageWorkflow') || url.searchParams.has('handoff')) {
      jump(url.href);
      return;
    }
    const currentResult = link.matches('#manual-ai-handoff,#manual-color-handoff,#color-refine,#color-superres,#creative-refine,#creative-superres,#sr-refine,#sr-color');
    if(currentResult){url.search='';url.hash='';}
    if (!await navigateWorkspace(url.href)) jump(url.href);
  },true);
  document.documentElement.dataset.workbenchPane='true';
  const bar=document.querySelector('main > .titlebar');
  const heading=bar?.querySelector('h1')?.parentElement;
  if(heading&&heading!==bar&&bar.querySelector('.toolbar')&&!heading.querySelector('button,input,select,a')){
    heading.hidden=true;
    bar.dataset.compact='true';
  }
  const checkpoints=document.querySelector('main > .workflow-strip');
  if(checkpoints){
    const details=document.createElement('details'),summary=document.createElement('summary');
    details.className='embedded-checkpoints';
    summary.textContent='检查点与历史';
    checkpoints.before(details);
    details.append(summary,checkpoints);
  }
  // The shell already supplies navigation and a section title.
  const header = document.querySelector('body > header');
  if(header){header.hidden=true;header.style.setProperty('display','none','important');}
  for(const link of document.querySelectorAll('.titlebar a[href="/server/"]'))link.hidden=true;
  send('ready',{url:location.href});
}
