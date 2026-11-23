// Property photo pipeline used by the office upload form:
// automatic enhancement (exposure, white balance, contrast, color, sharpness),
// resizing for the web, and the Shefa Nadlan logo burned into the pixels so the
// photo can't be reused without the brand.
import {brandLogo,brandPlacement} from "./brand.mjs";

const MAX_SIDE=2000;

// Pure pixel operation (RGBA array in place). Exported for tests.
export function enhancePixels(data) {
  const pixels=data.length/4;
  const hist=new Uint32Array(256);
  let sumR=0,sumG=0,sumB=0;
  for (let i=0;i<data.length;i+=4) {
    const r=data[i],g=data[i+1],b=data[i+2];
    sumR+=r;sumG+=g;sumB+=b;
    hist[(r*77+g*150+b*29)>>8]++;
  }
  // Levels: stretch the luminance range between the 0.5% and 99.5% points (only partly, to stay natural).
  const pick=fraction=>{let seen=0;for(let v=0;v<256;v++){seen+=hist[v];if(seen>=pixels*fraction) return v;}return 255;};
  let low=pick(.005),high=pick(.995);
  if (high-low<40) {low=0;high=255;}
  const stretch=255/Math.max(1,high-low);
  const blend=.7;
  // Gentle gray-world white balance, limited so real wall colors are not "corrected" away.
  const avg=(sumR+sumG+sumB)/3/pixels||1;
  const gain=value=>Math.min(1.12,Math.max(.9,1+((avg/(value/pixels||1))-1)*.5));
  const gr=gain(sumR),gg=gain(sumG),gb=gain(sumB);
  // Midtone lift for dark interior shots (gamma < 1 brightens).
  const mean=(sumR*.3+sumG*.59+sumB*.11)/pixels;
  const gamma=mean<95?.82:mean<120?.9:1;
  const curve=new Uint8ClampedArray(256);
  for (let v=0;v<256;v++) {
    let x=((v-low)*stretch)*blend+v*(1-blend);
    x=255*Math.pow(Math.min(1,Math.max(0,x/255)),gamma);
    const t=x/255; // soft S-curve: a little more contrast in the midtones
    curve[v]=255*(t-.12*Math.sin(2*Math.PI*t)/(2*Math.PI));
  }
  const saturation=1.12;
  for (let i=0;i<data.length;i+=4) {
    let r=curve[Math.min(255,data[i]*gr)|0],g=curve[Math.min(255,data[i+1]*gg)|0],b=curve[Math.min(255,data[i+2]*gb)|0];
    const l=r*.299+g*.587+b*.114;
    data[i]=l+(r-l)*saturation;data[i+1]=l+(g-l)*saturation;data[i+2]=l+(b-l)*saturation;
  }
  return {low,high,gamma,gains:[gr,gg,gb]};
}

// Light unsharp mask on the finished image (3x3), for crisp edges after resizing.
export function sharpenPixels(data,width,height,amount=.35) {
  const copy=new Uint8ClampedArray(data);
  const row=width*4;
  for (let y=1;y<height-1;y++) for (let x=1;x<width-1;x++) {
    const i=y*row+x*4;
    for (let c=0;c<3;c++) {
      const blur=(copy[i-row+c]+copy[i+row+c]+copy[i-4+c]+copy[i+4+c]+copy[i+c]*4)/8;
      data[i+c]=copy[i+c]+(copy[i+c]-blur)*amount*2;
    }
  }
}

async function loadImage(source) {
  if (typeof createImageBitmap==="function") {
    try {return await createImageBitmap(source,{imageOrientation:"from-image"});} catch {}
  }
  const image=new Image();
  image.src=typeof source==="string"?source:URL.createObjectURL(source);
  await image.decode();
  return image;
}

// Returns a JPEG Blob: enhanced (optional), resized and branded (optional).
export async function preparePhoto(file,{enhance=true,brand=true}={}) {
  const source=await loadImage(file);
  const w0=source.width||source.naturalWidth, h0=source.height||source.naturalHeight;
  const scale=Math.min(1,MAX_SIDE/Math.max(w0,h0));
  const width=Math.round(w0*scale), height=Math.round(h0*scale);
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  ctx.imageSmoothingQuality="high";
  ctx.drawImage(source,0,0,width,height);
  if (enhance) {
    const image=ctx.getImageData(0,0,width,height);
    enhancePixels(image.data);
    sharpenPixels(image.data,width,height);
    ctx.putImageData(image,0,0);
  }
  if (brand) {
    const logo=await loadImage(brandLogo);
    const box=brandPlacement({x:0,y:0,width,height},"bottom-right",.13);
    ctx.save();
    ctx.shadowColor="rgba(0,0,0,.35)";ctx.shadowBlur=Math.round(box.width*.08);
    ctx.drawImage(logo,box.x,box.y,box.width,box.height);
    ctx.restore();
  }
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error("שמירת התמונה נכשלה.")),"image/jpeg",.88));
}
