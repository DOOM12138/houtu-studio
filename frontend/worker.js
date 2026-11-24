import { render,analyze } from './engine.js';
import { maskAlpha } from './masks.js';
self.onmessage=({data:m})=>{try{const layers=m.layers.map(l=>({...l,alpha:maskAlpha(l,m.width,m.height,m.pixels,m.semantic)}));const pixels=render(m.pixels,m.width,m.height,m.settings,layers);let overlay=null;if(m.overlay){const l=layers.find(l=>l.id===m.selected);if(l)overlay=l.alpha;}self.postMessage({id:m.id,pixels,overlay,analysis:analyze(pixels)},[pixels.buffer,...(overlay?[overlay.buffer]:[])]);}catch(e){self.postMessage({id:m.id,error:e.message});}};
