export class EditHistory{
 constructor(limit=100){this.limit=limit;this.entries=[];this.cursor=-1;}
 reset(state,label='初始状态'){this.entries=state===undefined?[]:[{state:structuredClone(state),label,at:Date.now()}];this.cursor=this.entries.length-1;}
 push(state,label='修改参数'){if(this.cursor>=0&&JSON.stringify(this.entries[this.cursor].state)===JSON.stringify(state))return false;this.entries=this.entries.slice(0,this.cursor+1);this.entries.push({state:structuredClone(state),label,at:Date.now()});if(this.entries.length>this.limit+1)this.entries.shift();this.cursor=this.entries.length-1;return true;}
 get canUndo(){return this.cursor>0;}get canRedo(){return this.cursor>=0&&this.cursor<this.entries.length-1;}
 move(index){if(!Number.isInteger(index)||index<0||index>=this.entries.length)return null;this.cursor=index;return structuredClone(this.entries[index].state);}
 undo(){return this.canUndo?this.move(this.cursor-1):null;}redo(){return this.canRedo?this.move(this.cursor+1):null;}
}
export function nativeTextUndo(target){return Boolean(target?.isContentEditable||target?.closest?.('textarea,[contenteditable="true"],[role="textbox"]')||target?.tagName==='INPUT'&&!['button','submit','reset','checkbox','radio','range','file','color'].includes(target.type));}
export function bindHistoryShortcuts({undo,redo,canUndo=()=>true,canRedo=()=>true,blocked=()=>false,scope=()=>true,target=document}){
 const listener=event=>{if(event.defaultPrevented||event.isComposing||event.altKey||!(event.ctrlKey||event.metaKey)||nativeTextUndo(event.target)||!scope(event)||blocked())return;const key=event.key.toLowerCase(),back=key==='z'&&!event.shiftKey,forward=key==='y'||key==='z'&&event.shiftKey;if(!back&&!forward)return;if(back?!canUndo():!canRedo())return;event.preventDefault();event.stopPropagation();Promise.resolve().then(()=>back?undo():redo()).catch(()=>{});};target.addEventListener('keydown',listener);return()=>target.removeEventListener('keydown',listener);
}
export function historyList(mount,entries,cursor,{onSelect,disabled=false,empty='还没有编辑记录。'}={}){
 mount.replaceChildren();if(!entries.length){const p=document.createElement('p');p.className='hint';p.textContent=empty;mount.append(p);return;}
 for(const [index,entry]of entries.entries()){const button=document.createElement('button');button.type='button';button.className='edit-history-entry';button.dataset.historyIndex=index;button.textContent=entry.label||'编辑状态 '+index;button.disabled=disabled||index===cursor;button.setAttribute('aria-current',index===cursor?'step':'false');button.classList.toggle('is-future',index>cursor);button.onclick=()=>onSelect?.(index);mount.append(button);}
}
