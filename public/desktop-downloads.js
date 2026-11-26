if (window.houtuDesktopExports && window.chrome?.webview) {
 const save = (url, name) => window.chrome.webview.postMessage(JSON.stringify({type:'saveExport',url,name}));
 window.houtuInterceptBlobDownloads(async (blob, name) => {
  const receipt = await window.houtuStageExport('/api/desktop/downloads', blob, name);
  save(new URL(receipt.downloadUrl,location.origin).href,receipt.name);
 });
 document.addEventListener('click',event => {
  const link = event.target.closest?.('a[href]');
  if (!link?.href.startsWith(location.origin+'/')) return;
  const url = new URL(link.href);
  const fileRoute = /^\/api\/(?:logs\/exports|studio\/downloads|desktop\/downloads)\/[a-f0-9-]{36}$/.test(url.pathname) ||
    /^\/api\/image-imports\/[a-f0-9-]{36}\/original$/.test(url.pathname) ||
    /^\/(?:api\/layers\/[a-f0-9-]{36}\/project|downloads\/package\/[a-f0-9-]{36})$/.test(url.pathname) ||
    (url.searchParams.has('download') &&
      (/^\/api\/workflows\/[a-f0-9-]{36}\/assets\/[a-f0-9]{64}$/.test(url.pathname) ||
       /^\/images\/[a-f0-9-]{36}\/(?:source|result(?:-[a-f0-9-]{36})?)\.(?:png|jpg|webp)$/.test(url.pathname)));
  if (!fileRoute) return;
  event.preventDefault();
  save(url.href,link.download);
 },true);
}
