export const brandContacts=Object.freeze([
  {name:"שרל",display:"052-7504034",tel:"+972527504034"},
  {name:"רועי",display:"052-7504037",tel:"+972527504037"},
]);
export const brandContactLine=brandContacts.map(c=>c.name+" "+c.display).join("   |   ");
export const withBrandContacts=text=>brandContacts.every(c=>text.includes(c.display))?text:text.trimEnd()+"\n\n"+brandContactLine;
export const brandLogo="/media/shefa-round.webp";
export const brandLayouts=Object.freeze({
  site:{label:"אתר · יחס התמונה",width:1600,height:0},
  facebook:{label:"Facebook · ריבוע",width:1080,height:1080},
  instagram:{label:"Instagram · פוסט אנכי",width:1080,height:1350},
  story:{label:"סטוריז · 9:16",width:1080,height:1920},
  whatsapp:{label:"WhatsApp · אופקי",width:1440,height:1080},
  marketplace:{label:"Marketplace · אופקי",width:1440,height:1080},
});
export const brandCorners={"bottom-right":"ימין למטה","bottom-left":"שמאל למטה","top-right":"ימין למעלה","top-left":"שמאל למעלה"};
export function brandFit(width,height,boxWidth,boxHeight) {
  const scale=Math.min(boxWidth/width,boxHeight/height);
  return {x:(boxWidth-width*scale)/2,y:(boxHeight-height*scale)/2,width:width*scale,height:height*scale};
}
export function brandPlacement(box,corner="bottom-right",scale=.16) {
  const edge=Math.min(box.width,box.height);
  const size=Math.max(1,Math.round(edge*scale));
  const margin=Math.max(0,Math.round(edge*.035));
  return {width:size,height:size,x:box.x+(corner.endsWith("right")?box.width-size-margin:margin),
    y:box.y+(corner.startsWith("bottom")?box.height-size-margin:margin)};
}
