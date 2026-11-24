const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function fitScale(size,views){return Math.max(.0001,Math.min(...views.map(v=>{const image=v.image||size;return Math.min(Math.max(1,v.width-24)/image.w,Math.max(1,v.height-24)/image.h);})));}
export function zoomAt(state,next,size,anchor){const x=(anchor.x-anchor.width/2)/(size.w*state.scale)+state.cx,y=(anchor.y-anchor.height/2)/(size.h*state.scale)+state.cy;return {cx:x-(anchor.x-anchor.width/2)/(size.w*next),cy:y-(anchor.y-anchor.height/2)/(size.h*next)};}
export function panBy(center,dx,dy,size,scale){return {cx:center.cx-dx/(size.w*scale),cy:center.cy-dy/(size.h*scale)};}
export function constrainCenter(center,size,scale,views){const extent=(axis,key)=>Math.min(...views.map(v=>v[axis]/((v.image||size)[key]*scale)/2));const hx=extent('width','w'),hy=extent('height','h');return {cx:hx>=.5?.5:clamp(center.cx,hx,1-hx),cy:hy>=.5?.5:clamp(center.cy,hy,1-hy)};}
