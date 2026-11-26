// Desktop and Android WebViews save in-memory results through their local server.
window.houtuInterceptBlobDownloads = function (save) {
 const nativeClick = HTMLAnchorElement.prototype.click;
 const isBlobDownload = anchor => anchor?.hasAttribute('download') && /^(blob:|data:)/.test(anchor.href);
 const start = anchor => {
  const name = anchor.download || '成片.png', url = anchor.href;
  void (async () => {
   try {
    const response = await fetch(url);
    if (!response.ok) throw Error('导出文件已失效，请重新导出。');
    await save(await response.blob(), name);
   } catch (error) {
    alert(error.message || '本机保存失败，请重新导出。');
   }
  })();
 };
 document.addEventListener('click', event => {
  const anchor = event.target.closest?.('a[download]');
  if (!isBlobDownload(anchor)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  start(anchor);
 }, true);
 HTMLAnchorElement.prototype.click = function () {
  if (!this.isConnected && isBlobDownload(this)) start(this);
  else nativeClick.call(this);
 };
};
window.houtuStageExport = async function (prefix, blob, name) {
 const health = await (await fetch('/api/health')).json();
 const query = new URLSearchParams({ name, mime:blob.type || 'application/octet-stream' });
 const response = await fetch(prefix + '?' + query, {
  method:'POST', headers:{'X-Paint-CSRF':health.csrf}, body:blob
 });
 const receipt = await response.json();
 if (!response.ok) throw Error(receipt.error || '本机保存失败，请重新导出。');
 return receipt;
};
