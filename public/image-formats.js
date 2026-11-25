export const RAW_EXTENSIONS=['dng','cr2','cr3','crw','nef','nrw','arw','srf','sr2','raf','orf','rw2','pef','srw','rwl','3fr','fff','iiq','mos','mrw','x3f','raw'];
export const EXTRA_IMAGE_EXTENSIONS=['tif','tiff','avif','gif','bmp'];
export const IMAGE_ACCEPT='image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp,image/tiff,'+[...RAW_EXTENSIONS,...EXTRA_IMAGE_EXTENSIONS].map(s=>'.'+s).join(',');
export const extension=name=>String(name||'').split('.').at(-1).toLowerCase();
export const needsImageImport=file=>RAW_EXTENSIONS.includes(extension(file.name))||EXTRA_IMAGE_EXTENSIONS.includes(extension(file.name));
export function originalImageSignature(bytes){const s=(start,end)=>String.fromCharCode(...bytes.subarray(start,end));return bytes.length>16&&(s(0,2)==='II'&&[42,43].includes(bytes[2])&&bytes[3]===0||s(0,2)==='MM'&&bytes[2]===0&&[42,43].includes(bytes[3])||s(0,8)==='FUJIFILM'||s(0,4)==='FOVb'||s(6,14)==='HEAPCCDR'||s(4,8)==='ftyp'||s(0,2)==='BM'||s(0,3)==='GIF');}
