export const EFFECTS={sparkles:'微光粒子',bokeh:'柔焦光斑',snow:'飘雪',rain:'雨丝',petals:'花瓣',mist:'薄雾',rim:'暖色光晕',none:'不加特效'};
export function effectSvg(width,height,config={}){
 const type=Object.hasOwn(EFFECTS,config.effect)?config.effect:'sparkles',amount=Math.max(0,Math.min(1,Number(config.amount??.45))),seed=(Number(config.seed)||42)>>>0;let state=seed;const random=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};const s=Math.min(width,height),parts=[];const count=Math.round(15+amount*90);
 if(type==='none'||amount===0)return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;
 for(let i=0;i<count;i++){const x=random()*width,y=random()*height,r=s*(.001+random()*.009),a=.12+random()*.5*amount;
  if(type==='rain')parts.push(`<path d="M${x} ${y}l${-s*.016} ${s*(.025+random()*.04)}" stroke="#cfe8ff" stroke-width="${Math.max(1,s*.001)}" opacity="${a}"/>`);
  else if(type==='petals')parts.push(`<ellipse cx="${x}" cy="${y}" rx="${r*1.9}" ry="${r*.75}" transform="rotate(${random()*180} ${x} ${y})" fill="#f5b5c7" opacity="${a}"/>`);
  else if(type==='sparkles'){parts.push(`<circle cx="${x}" cy="${y}" r="${r*.4}" fill="#fff3d5" opacity="${a}"/>`);if(i%6===0)parts.push(`<path d="M${x-r*3} ${y}h${r*6}M${x} ${y-r*3}v${r*6}" stroke="#fff4dc" stroke-width="${Math.max(1,r*.35)}" opacity="${a}"/>`);}
  else if(type==='snow')parts.push(`<circle cx="${x}" cy="${y}" r="${r*.65}" fill="#f5f9ff" opacity="${a}"/>`);
  else if(type==='bokeh')parts.push(`<circle cx="${x}" cy="${y}" r="${r*4}" fill="url(#light)" opacity="${a}"/>`);
 }
 if(type==='mist')parts.push(`<rect width="100%" height="100%" fill="url(#fog)" opacity="${amount*.6}"/>`);
 if(type==='rim')parts.push(`<ellipse cx="${width*.85}" cy="${height*.15}" rx="${width*.8}" ry="${height*.65}" fill="url(#light)" opacity="${amount*.8}"/>`);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><radialGradient id="light"><stop stop-color="#fff1cc" stop-opacity=".9"/><stop offset=".5" stop-color="#f8d398" stop-opacity=".25"/><stop offset="1" stop-color="#ffe8c3" stop-opacity="0"/></radialGradient><linearGradient id="fog" x2="0" y2="1"><stop stop-color="#ecf2f5" stop-opacity="0"/><stop offset="1" stop-color="#f5f8fc"/></linearGradient></defs>${parts.join('')}</svg>`;
}
