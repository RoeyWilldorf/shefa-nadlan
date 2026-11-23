import {brandContacts,brandLogo,brandLayouts,brandCorners,brandFit,brandPlacement} from "./brand.mjs";

const brandImage=async url=>{
  const image=new Image();
  image.src=url;
  await image.decode();
  return image;
};
const selectedOption=(items,selected)=>Object.entries(items).map(([key,label])=>
  '<option value="'+key+'" '+(key===selected?'selected':'')+'>'+label+'</option>').join("");
const escapeBrand=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

export function bindBrandStudio(root,property,files,channel) {
  const photos=files.filter(file=>file.public_photo&&file.mime.startsWith("image/"));
  if(!photos.length){
    root.innerHTML='<h3>תמונות ממותגות</h3><p>העלו תמונה ואשרו שימוש שיווקי דרך ״קבצים ומחירים״.</p>';
    return;
  }
  const defaultChannel=Object.hasOwn(brandLayouts,channel)?channel:"site";
  root.innerHTML='<h3>תמונות ממותגות</h3><div class="office-fields">'+
    '<label class="field"><span>תמונה מאושרת לשיווק</span><select name="photo">'+photos.map(f=>'<option value="'+f.id+'">'+escapeBrand(f.label)+'</option>').join("")+'</select></label>'+
    '<label class="field"><span>פורמט לייצוא</span><select name="layout">'+selectedOption(Object.fromEntries(Object.entries(brandLayouts).map(([key,x])=>[key,x.label])),defaultChannel)+'</select></label>'+
    '<label class="field"><span>מיקום הלוגו</span><select name="corner">'+selectedOption(brandCorners,"bottom-right")+'</select></label>'+
    '<label class="field"><span>גודל הלוגו</span><input name="scale" type="range" min="12" max="24" value="16"></label></div>'+
    '<label class="office-check"><input name="contacts" type="checkbox"> הוספת פס פרטי קשר</label>'+
    '<p class="office-small" role="status"></p><canvas role="img" aria-label="תצוגה מקדימה של התמונה הממותגת"></canvas>'+
    '<div class="office-actions"><button type="button" class="button primary" disabled data-download-image>הורדת תמונה ממותגת (JPG)</button></div>';
  const field=name=>root.querySelector('[name="'+name+'"]');
  const preview=root.querySelector("canvas");
  const status=root.querySelector("[role=status]");
  const download=root.querySelector("[data-download-image]");
  const ctx=preview.getContext("2d",{alpha:false});
  const images=new Map();
  const logoPromise=brandImage(brandLogo).catch(()=>null);
  let version=0;
  let currentFilename;
  async function renderBrand() {
    const sequence=++version;
    const photo=photos.find(f=>f.id===field("photo").value);
    const layout=brandLayouts[field("layout").value];
    download.disabled=true;
    preview.hidden=true;
    field("corner").disabled=Boolean(photo.already_branded);
    field("scale").disabled=Boolean(photo.already_branded);
    status.textContent="מכין תצוגה ממותגת…";
    try{
      if(!images.has(photo.id)) images.set(photo.id,brandImage("/api/office/files/"+photo.id));
      const [source,logo]=await Promise.all([images.get(photo.id),logoPromise]);
      if(sequence!==version||!root.isConnected) return;
      if(!logo||!ctx) throw Error();
      const bar=field("contacts").checked?Math.round(layout.width*.092):0;
      const width=layout.height?layout.width:Math.min(1800,source.naturalWidth);
      const photoHeight=layout.height?layout.height-bar:Math.round(source.naturalHeight*width/source.naturalWidth);
      preview.width=width;preview.height=photoHeight+bar;
      ctx.fillStyle="#102951";ctx.fillRect(0,0,preview.width,preview.height);
      const box=brandFit(source.naturalWidth,source.naturalHeight,width,photoHeight);
      ctx.drawImage(source,box.x,box.y,box.width,box.height);
      if(!photo.already_branded){
        const logoBox=brandPlacement(box,field("corner").value,Number(field("scale").value)/100);
        ctx.drawImage(logo,logoBox.x,logoBox.y,logoBox.width,logoBox.height);
      }
      if(bar){
        ctx.fillStyle="#efc768";ctx.fillRect(0,photoHeight,preview.width,Math.max(2,bar*.035));
        ctx.fillStyle="#fff";ctx.textAlign="center";ctx.textBaseline="middle";ctx.direction="ltr";
        ctx.font="700 "+Math.round(width*.026)+"px Arial, sans-serif";
        for(const [index,person] of brandContacts.entries()){
          const x=width*(index===0?.75:.25);
          ctx.fillText(person.name,x,photoHeight+bar*.32,width*.46);
          ctx.fillText(person.display,x,photoHeight+bar*.67,width*.46);
        }
      }
      preview.hidden=false;
      status.textContent=(photo.already_branded?"נעשה שימוש בלוגו הקיים שאושר בתמונה. ":"")+preview.width+" × "+preview.height+" פיקסלים";
      currentFilename="shefa-"+property.id.slice(0,8)+"-"+photo.id.slice(0,8)+"-"+field("layout").value+".jpg";
      download.disabled=false;
    }catch{
      if(sequence===version) status.textContent="אי אפשר להכין תצוגה לתמונה זו. בדקו את הקובץ ונסו שוב.";
      images.delete(photo.id);
    }
  }
  root.addEventListener("input",renderBrand);
  download.addEventListener("click",()=>{
    preview.toBlob(blob=>{
      if(!blob) {status.textContent="יצירת קובץ JPG נכשלה.";return;}
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");link.href=url;link.download=currentFilename;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    },"image/jpeg",.92);
  });
  renderBrand();
}
