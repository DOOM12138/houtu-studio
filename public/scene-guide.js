// Stored only on workflows opting into contextual scene direction.
export const SCENE_GUIDE_VERSION = 'scene-direction-2026-11-26-r1';
export const SCENE_LABELS = {convention:'场照',studio:'棚拍',location:'外景',unknown:'场景未定'};
export const SCENE_RETOUCH_TASKS = Object.freeze(['portrait','color']);
const titlePattern = /^[\p{L}\p{M}\p{N} ·・'’《》:：()/（）\-]{1,64}$/u;
export function fictionalTitle(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.normalize('NFKC').trim().replace(/\s+/g,' ');
  if (/^(?:未知|不明|原创|无|待确认|不确定|unknown|none|null|n\/a)$/i.test(trimmed)) return '';
  return titlePattern.test(trimmed) && !/https?:|www\.|[0-9]{7,}/i.test(trimmed) ? trimmed : '';
}
export function sceneGuideOptions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('场景精修设置无效。');
  if (input.version !== undefined && input.version !== SCENE_GUIDE_VERSION) throw Error('场景方法版本不匹配，请新建一轮。');
  const scene=input.scene??'auto';
  if (!['auto','convention','studio','location'].includes(scene)) throw Error('请选择自动、场照、棚拍或外景。');
  const character=fictionalTitle(input.character),work=fictionalTitle(input.work);
  if ((input.character&&!character)||(input.work&&!work)) throw Error('角色或作品请填写简短名称，不含网址、账号或长号码。');
  return {version:SCENE_GUIDE_VERSION,scene,character,work};
}
