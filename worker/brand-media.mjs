import {brandPlacement,brandLogo} from "../dist/brand.mjs";

function brandedSize(bytes,mime) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const textAt=(offset,size)=>String.fromCharCode(...bytes.subarray(offset,offset+size));
  if (mime==="image/png"&&bytes.length>=24) return [view.getUint32(16),view.getUint32(20)];
  if (mime==="image/webp"&&bytes.length>=30) {
    const kind=textAt(12,4);
    if (kind==="VP8X") return [1+(view.getUint32(24,true)&0xffffff),1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)];
    if (kind==="VP8 ") return [view.getUint16(26,true)&0x3fff,view.getUint16(28,true)&0x3fff];
    if (kind==="VP8L") {
      const bits=view.getUint32(21,true);
      return [1+(bits&0x3fff),1+((bits>>>14)&0x3fff)];
    }
  }
  if (mime==="image/jpeg") {
    const sof=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
    for(let i=2;i+8<bytes.length;) {
      if(bytes[i]!==255) break;
      const marker=bytes[i+1];
      if(marker===255){i++;continue;}
      if(marker===0xda||marker===0xd9) break;
      if(sof.has(marker)) return [view.getUint16(i+7),view.getUint16(i+5)];
      const length=view.getUint16(i+2);
      if(length<2) break;
      i+=length+2;
    }
  }
  return [1600,1067];
}
function brandBase64(bytes) {
  const chunks=[];
  const block=24576;
  for(let i=0;i<bytes.length;i+=block) chunks.push(btoa(String.fromCharCode(...bytes.subarray(i,i+block))));
  return chunks.join("");
}
export async function brandMediaResponse(object,file,assets,headers) {
  if(file.already_branded) return new Response(object.body,{headers:{...headers,"Content-Type":file.mime}});
  const bytes=new Uint8Array(await new Response(object.body).arrayBuffer());
  let [width,height]=brandedSize(bytes,file.mime);
  if(width<1||height<1||width>32000||height>32000) [width,height]=[1600,1067];
  const mark=brandPlacement({x:0,y:0,width,height});
  const logo=assets[brandLogo].base64;
  const image=brandBase64(bytes);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:${file.mime};base64,${image}"/><image x="${mark.x}" y="${mark.y}" width="${mark.width}" height="${mark.height}" href="data:image/webp;base64,${logo}"/></svg>`;
  return new Response(svg,{headers:{...headers,"Content-Type":"image/svg+xml; charset=utf-8",
    "Content-Security-Policy":"default-src 'none'; img-src data:; frame-ancestors 'none'; sandbox"}});
}
