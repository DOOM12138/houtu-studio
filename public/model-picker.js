import {normalizeModel} from './model-options.js';

// One picker per page. Restoring a task never silently substitutes another model.
export function createModelPicker({mount,onChange=()=>{}}){
  const key='houtu-selected-model';let selected=null,models=[],loading=false,disabled=false,signedIn=false,generation=0;
  try{selected=normalizeModel(localStorage.getItem(key));}catch{}
  const label=document.createElement('label'),row=document.createElement('div'),select=document.createElement('select'),refresh=document.createElement('button'),status=document.createElement('p'),note=document.createElement('p');
  mount.classList.add('model-picker');select.id=mount.id+'-select';label.htmlFor=select.id;label.textContent='AI 主模型';
  row.className='model-picker-row';refresh.type='button';refresh.textContent='刷新列表';status.className='field-hint hint';status.setAttribute('role','status');note.className='field-hint hint';note.textContent='用于读图分析与发起修图；内置绘图引擎由 ChatGPT 服务提供。';
  row.append(select,refresh);mount.append(label,row,status,note);
  function render(){
    select.replaceChildren(new Option('跟随客户端默认',''));
    for(const model of models)select.append(new Option(model.name+(model.isDefault?' · 推荐默认':''),model.id));
    if(selected&&!models.some(model=>model.id===selected)){const missing=new Option(selected+'（当前不可用／待确认）',selected);missing.disabled=true;select.append(missing);}
    select.value=selected||'';select.disabled=disabled||loading||!signedIn;refresh.disabled=disabled||loading;
  }
  async function reload(force=false){
    const token=++generation;loading=true;status.textContent='正在读取账号模型…';render();
    try{const response=await fetch('/api/models'+(force?'?refresh=1':''));const data=await response.json();if(!response.ok)throw Error(data.error||'读取失败，请重试。');if(token!==generation)return;
      models=Array.isArray(data.models)?data.models.filter(model=>typeof model.id==='string'&&typeof model.name==='string'):[];signedIn=Boolean(data.signedIn);
      status.textContent=data.message||(selected&&models.some(model=>model.id===selected)?'已选：'+models.find(model=>model.id===selected).name:!models.length?'账号未返回可选模型，可使用客户端默认。':selected&&!models.some(model=>model.id===selected)?'此前所选模型不可用，请重新选择。':'模型列表已更新，未额外调用AI。');
    }catch(error){if(token!==generation)return;status.textContent=error.message||'模型列表读取失败，请刷新重试。';}
    finally{if(token===generation){loading=false;render();onChange();}}
  }
  select.addEventListener('change',()=>{selected=normalizeModel(select.value);try{selected?localStorage.setItem(key,selected):localStorage.removeItem(key);}catch{}status.textContent=selected?'已选：'+(models.find(model=>model.id===selected)?.name||selected):'新任务跟随客户端默认；实际模型会写入任务记录。';render();onChange();});
  refresh.addEventListener('click',()=>reload(true));render();queueMicrotask(()=>reload());
  return {get value(){return selected;},valid:()=>!selected||models.some(model=>model.id===selected),set(value){selected=normalizeModel(value);status.textContent=selected?(models.find(model=>model.id===selected)?'已选：'+models.find(model=>model.id===selected).name:'此前所选模型待确认，请刷新列表。'):'跟随客户端默认；实际模型会写入任务记录。';render();},setDisabled(value){disabled=Boolean(value);render();},reload};
}
