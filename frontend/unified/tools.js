const toolNames = new Map([
  ['/color/', '完整调色'],
  ['/portrait/', '人物手动修图'],
  ['/layers/', '图层工程'],
  ['/ai/', '单项 AI 精修'],
  ['/ai/color/', 'AI 调色'],
  ['/creative/', '特效与合成'],
  ['/upscale/', '超分 4K'],
  ['/studio/', '照片项目'],
  ['/workflows/', '工作流记录'],
  ['/lab/', '提示词实验室']
]);

function toolURL(input) {
  try {
    const url = new URL(input, location.origin);
    if (url.origin !== location.origin || url.username || url.password) return null;
    if (url.pathname === '/' && (url.searchParams.has('refineWorkflow') || url.searchParams.has('job'))) url.pathname = '/ai/';
    url.pathname = url.pathname.replace(/\/?$/, '/');
    return toolNames.has(url.pathname) ? url : null;
  } catch { return null; }
}
export const isWorkbenchToolURL = input => Boolean(toolURL(input));

const identityKey = value => value ? JSON.stringify(value) : '';
const samePicture = (a,b) => a?.assetId === b?.assetId;
const handoffFields = ['imageWorkflow','imageAsset','imageStep','imageAttempt','handoff','workflow','fromWorkflow','job','refineWorkflow','portraitAudit','project','import','deskRun'];

export function createWorkbenchTools({ mount, api, pin, identify, accept, announce, onSettings }) {
  const slot = mount.querySelector('#advancedFrame');
  const title = mount.querySelector('#advancedTitle');
  const closeButton = mount.querySelector('#closeAdvanced');
  const applyButton = mount.querySelector('#applyAdvanced');
  const status = mount.querySelector('#advancedStatus');
  let session, ticket = 0, applying = false, focusReturn = null, readyTimer;

  function feedback(message, error = false) {
    status.textContent = message;
    status.hidden = !message;
    status.dataset.error = String(error);
  }
  function discard() {
    clearTimeout(readyTimer);
    session = null;
    slot.replaceChildren();
  }
  function close({ discardView = false } = {}) {
    if (applying) return;
    ticket++;
    clearTimeout(readyTimer);
    if (discardView || !session?.ready) discard();
    mount.hidden = true;
    if (focusReturn?.isConnected) focusReturn.focus({ preventScroll:true });
  }
  function load(url) {
    url.searchParams.set('embedded', 'workbench');
    const frame = document.createElement('iframe');
    frame.title = toolNames.get(url.pathname);
    frame.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox');
    session.frame = frame;
    session.ready = false;
    session.section = url.pathname;
    session.childToken = null;
    title.textContent = frame.title;
    applyButton.hidden = true;
    feedback('正在打开工具…');
    clearTimeout(readyTimer);
    const current = session;
    readyTimer = setTimeout(() => {
      if (session === current && session.frame === frame && !session.ready && !mount.hidden)
        feedback('工具未能打开，请返回画布后重试。', true);
    }, 20_000);
    frame.src = url.href;
    slot.replaceChildren(frame);
  }
  async function open(input) {
    if (applying) return;
    const url = toolURL(input);
    if (!url) return;
    const request = ++ticket;
    const identity = identify();
    const requested = url.pathname + url.search + url.hash;
    if (mount.hidden) focusReturn = document.activeElement;
    mount.hidden = false;
    if (session?.ready && session.requested === requested && identityKey(session.identity) === identityKey(identity)) {
      closeButton.focus({ preventScroll:true });
      return;
    }
    discard();
    title.textContent = toolNames.get(url.pathname);
    applyButton.hidden = true;
    feedback('正在准备当前照片…');
    closeButton.focus({ preventScroll:true });
    try {
      let source = null;
      if (identity && !['/workflows/','/lab/'].includes(url.pathname) && !handoffFields.some(key => url.searchParams.has(key))) {
        source = await pin();
        if (request !== ticket) return;
        if (identityKey(identity) !== identityKey(identify())) throw Error('当前照片已更换，请重新打开工具。');
        if (source) {
          const receipt = await api('/api/workspace/handoffs', source);
          url.searchParams.set('handoff', receipt.id);
          url.searchParams.set('imageWorkflow', receipt.origin.workflowId);
          url.searchParams.set('imageAsset', receipt.origin.assetId);
          if (receipt.origin.stepId) url.searchParams.set('imageStep', receipt.origin.stepId);
          if (receipt.origin.attemptId) url.searchParams.set('imageAttempt', receipt.origin.attemptId);
        }
      }
      if (request !== ticket) return;
      if (identityKey(identity) !== identityKey(identify())) throw Error('当前照片已更换，请重新打开工具。');
      session = { requested, identity, source };
      load(url);
    } catch(e) {
      if (request === ticket) feedback(e.message || '当前照片无法接续。', true);
    }
  }
  async function apply() {
    const current = session;
    if (!current?.ready || applying) return;
    applying = true;
    closeButton.disabled = applyButton.disabled = true;
    try {
      if (identityKey(current.identity) !== identityKey(identify())) throw Error('画布已切换。请重新打开工具应用到当前照片。');
      feedback('正在保存这次修图…');
      const ref = await current.frame.contentWindow.houtuEmbeddedPicture?.();
      if (!ref) throw Error('先打开照片并完成这一步操作。');
      // The local server verifies the exact workflow output and attempt before it is applied.
      const receipt = await api('/api/workspace/handoffs', ref);
      if (session !== current || identityKey(current.identity) !== identityKey(identify())) throw Error('画布已切换，请重新打开工具。');
      if (!samePicture(receipt.origin,current.source)) {
        await accept(receipt.origin, toolNames.get(current.section), current.identity, current.source);
        announce?.('工具结果已应用到照片');
      } else announce?.('当前照片无需应用新的结果');
      applying = false;
      close({ discardView:true });
    } catch(e) {
      feedback(e.message || '应用失败。工具中的修改已保留。', true);
    } finally {
      applying = false;
      closeButton.disabled = applyButton.disabled = false;
    }
  }
  closeButton.onclick = () => close();
  applyButton.onclick = apply;
  mount.addEventListener('keydown', event => { if(event.key==='Escape'){event.stopPropagation();close();} });
  window.addEventListener('message', event => {
    const data=event.data;
    if (mount.hidden || !session || event.origin !== location.origin || event.source !== session.frame?.contentWindow || data?.scope !== 'houtu-workbench-tool') return;
    if (data.type === 'ready') {
      const url=toolURL(data.url);
      if (!url || url.searchParams.get('embedded') !== 'workbench') return;
      clearTimeout(readyTimer);
      session.ready = true;
      session.section = url.pathname;
      session.childToken = data.token;
      title.textContent = toolNames.get(url.pathname);
      applyButton.hidden = ['/workflows/','/lab/'].includes(url.pathname);
      applyButton.textContent = session.identity ? '应用到当前照片' : '带回画布';
      feedback('');
    } else if (!applying && data.token === session.childToken) {
      if (data.type === 'tool') {
        const url=toolURL(data.url);
        if(url)load(url);
      } else if (data.type === 'settings') { close(); onSettings?.(data.url); }
      else if (data.type === 'save') {
        try {
          const url = new URL(data.url);
          if (url.origin !== location.origin || !/^\/(?:api\/|images\/|downloads\/)/.test(url.pathname)) return;
          if (window.houtuDocuments) window.houtuDocuments.postMessage(JSON.stringify({type:'saveUrl',url:url.href,name:data.name,mime:data.mime}));
          else {
            const anchor = document.createElement('a');
            anchor.href = url.href;
            anchor.download = typeof data.name==='string' ? data.name.slice(0,150) : '';
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
          }
        } catch {}
      } else if (data.type === 'error' && typeof data.message==='string') feedback(data.message.slice(0,250),true);
    }
  });
  return { open, close, isOpen:() => !mount.hidden };
}
