import sharp from 'sharp';
// A warning heuristic for whole-person masks, never an automatic permission expansion.
export async function personMaskIntegrity(mask){const {data,info}=await sharp(mask).flatten({background:'black'}).greyscale().resize({width:256,height:256,fit:'inside',withoutEnlargement:true,kernel:'nearest'}).raw().toBuffer({resolveWithObject:true}),width=info.width,height=info.height,seen=new Uint8Array(width*height),queue=new Int32Array(width*height);let selected=0,left=width,right=-1,top=height,bottom=-1,largest=0,components=0;
 for(let i=0;i<data.length;i++)if(data[i]>=128){selected++;const x=i%width,y=Math.floor(i/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 for(let i=0;i<data.length;i++){if(data[i]<128||seen[i])continue;components++;let head=0,tail=0;queue[tail++]=i;seen[i]=1;while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);for(const n of [x>0?p-1:-1,x+1<width?p+1:-1,y>0?p-width:-1,y+1<height?p+width:-1])if(n>=0&&data[n]>=128&&!seen[n]){seen[n]=1;queue[tail++]=n;}}largest=Math.max(largest,tail);}
 const occupancy=selected?(selected/((right-left+1)*(bottom-top+1))):0,dominant=selected?largest/selected:0,requiresReview=selected===0||occupancy<.42||dominant<.75;
 return {version:'person-mask-integrity-v1',requiresReview,occupancy:Number(occupancy.toFixed(4)),dominantComponent:Number(dominant.toFixed(4)),components,selectedPixels:selected,sampledWidth:width,sampledHeight:height,note:requiresReview?'自动人物范围可能遗漏或分离，完整人物风格转换前请预览并修正范围；该估算不会扩展黑色保护区。':'人物范围基本连贯，仍需检查发丝、配饰与轮廓。'};
}
