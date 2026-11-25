import {renderManualPortrait} from './manual-portrait-engine.js';
self.onmessage=({data:m})=>{try{const result=renderManualPortrait(new Uint8ClampedArray(m.pixels),m.width,m.height,m.operations);self.postMessage({id:m.id,...result},[result.pixels.buffer,result.protection.buffer]);}catch(e){self.postMessage({id:m.id,error:e.message});}};
