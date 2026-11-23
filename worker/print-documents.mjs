import {PDFDocument,PDFHexString,PDFName,PDFOperator,rgb} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import bidiFactory from "bidi-js";

const fontAdapter={create(data){
  const font=fontkit.create(data);
  const layout=font.layout.bind(font);
  font.layout=(value,features)=>layout(value,features,undefined,undefined,"ltr");
  return font;
}};
const bidi=bidiFactory();
const navy=rgb(.07,.16,.32);
const gold=rgb(.72,.53,.18);
const gray=rgb(.16,.2,.26);
const priceFormat=new Intl.NumberFormat("he-IL",{maximumFractionDigits:2});
const signedDate=new Intl.DateTimeFormat("he-IL",{dateStyle:"long",timeStyle:"short",timeZone:"Asia/Jerusalem"});
const width=595.28,height=841.89,margin=44;
const decode=asset=>Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0));
function visual(value) {
  const levels=bidi.getEmbeddingLevels(value,"rtl");
  const mirrored=bidi.getMirroredCharactersMap(value,levels);
  return bidi.getReorderedString(value.split("").map((c,i)=>mirrored.get(i)??c).join(""),levels);
}
function wrap(value,measure) {
  const lines=[];
  for(const paragraph of String(value??"").normalize("NFC").replace(/[\u202a-\u202e\u2066-\u2069]/g,"").replace(/[^\x20-\x7e\u00a0-\u017f\u0590-\u05ff\u2000-\u206f₪€\n]/g,"?").split("\n")) {
    let line="";
    for(const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const proposed=line?line+" "+word:word;
      if(measure(proposed)<=width-margin*2){line=proposed;continue;}
      if(line) lines.push(line);
      line="";
      for(const char of word) {
        if(line&&measure(line+char)>width-margin*2){lines.push(line);line="";}
        line+=char;
      }
    }
    lines.push(line);
  }
  return lines;
}
export async function renderBrokeragePdf({title,reference,createdAt,draft,sections},assets) {
  const pdf=await PDFDocument.create();
  const context=pdf.context;
  const object=value=>context.obj(value);
  const mark=name=>PDFName.of(name);
  const root=object({Type:"StructTreeRoot"});
  const rootRef=context.register(root);
  const items=object([]);
  const documentRef=context.register(object({Type:"StructElem",S:"Document",P:rootRef,K:items}));
  const parents=object([]);
  root.set(mark("K"),documentRef);
  root.set(mark("ParentTree"),context.register(object({Nums:parents})));
  pdf.catalog.set(mark("Lang"),PDFHexString.fromText("he-IL"));
  pdf.catalog.set(mark("MarkInfo"),object({Marked:true}));
  pdf.catalog.set(mark("StructTreeRoot"),rootRef);
  pdf.catalog.getOrCreateViewerPreferences().setDisplayDocTitle(true);
  pdf.registerFontkit(fontAdapter);
  pdf.setTitle(title);
  pdf.setSubject(reference);
  pdf.setAuthor("שפע נדל״ן");
  pdf.setCreationDate(new Date(createdAt));
  pdf.setModificationDate(new Date(createdAt));
  const font=await pdf.embedFont(decode(assets["/media/documents-he.ttf"]),{subset:true});
  const logo=await pdf.embedJpg(decode(assets["/media/documents-logo.jpg"]));
  let page,y,pageParents,pageNumber=0;
  const draw=(target,value,baseline,size,color,element)=>{
    const shaped=visual(value);
    const x=width-margin-font.widthOfTextAtSize(shaped,size);
    if(element){
      const mcid=pageParents.size();
      pageParents.push(element.ref);
      element.children.push(object({Type:"MCR",Pg:target.ref,MCID:mcid}));
      target.pushOperators(PDFOperator.of("BDC",[mark(element.role),object({MCID:mcid,ActualText:PDFHexString.fromText(value)})]));
    }else target.pushOperators(PDFOperator.of("BMC",[mark("Artifact")]));
    target.drawText(shaped,{x,y:baseline,font,size,color});
    target.pushOperators(PDFOperator.of("EMC",[]));
  };
  function newPage() {
    page=pdf.addPage([width,height]);
    page.node.set(mark("StructParents"),object(pageNumber));
    page.node.set(mark("Tabs"),mark("S"));
    pageParents=object([]);
    parents.push(object(pageNumber++));
    parents.push(pageParents);
    page.pushOperators(PDFOperator.of("BMC",[mark("Artifact")]));
    page.drawImage(logo,{x:margin,y:height-83,width:49,height:49});
    page.drawLine({start:{x:margin,y:height-97},end:{x:width-margin,y:height-97},color:gold,thickness:1});
    page.pushOperators(PDFOperator.of("EMC",[]));
    draw(page,"שפע נדל״ן",height-49,14,navy);
    draw(page,(draft?"טיוטה לעיון · ":"אסמכתה ")+reference,height-70,10,gray);
    y=height-122;
  }
  function text(value,size=11,color=gray,role="P"){
    const children=object([]);
    const ref=context.register(object({Type:"StructElem",S:role,P:documentRef,K:children,ActualText:PDFHexString.fromText(value)}));
    items.push(ref);
    for(const line of wrap(value,t=>font.widthOfTextAtSize(visual(t),size))){
      if(y<66) newPage();
      if(line) draw(page,line,y,size,color,{children,ref,role});
      y-=size*1.48;
    }
  }
  newPage();
  text(title,18,navy,"H1");
  text("שפע נדל״ן · אסמכתה "+reference);
  if(draft) text("טיוטה לבדיקה. חתימה דיגיטלית אינה פעילה במסמך זה.");
  text((draft?"הופקה ":"נחתם ")+signedDate.format(new Date(createdAt)));
  y-=12;
  for(const section of sections){
    if(y<106) newPage();
    text(section.title,13,navy,"H2");
    for(const line of section.lines.filter(Boolean)) text(line);
    y-=9;
  }
  const pages=pdf.getPages();
  root.set(mark("ParentTreeNextKey"),object(pageNumber));
  pages.forEach((current,index)=>{
    if(draft) draw(current,"טיוטה לבדיקה · חתימה דיגיטלית אינה פעילה במסמך זה",48,9,gray);
    draw(current,`עמוד ${index+1} מתוך ${pages.length}`,32,9,gray);
  });
  return pdf.save();
}
const nameLine=person=>"שם מלא "+(person.name??(person.firstName+" "+person.lastName));
const contactLines=person=>[nameLine(person),person.identity?"מספר זהות "+person.identity:"",person.address?"כתובת "+person.address:"",
  person.phone?"טלפון "+person.phone:"",person.email?"דוא״ל "+person.email:""];
const priceLine=property=>"מחיר מבוקש "+priceFormat.format(property.price)+" ₪"+(property.deal==="rent"?" לחודש":"");
function feeLine(property){
  const fee=property.fee;
  const amount=fee.amount===0?"ללא דמי תיווך":
    fee.mode==="fixed"?priceFormat.format(fee.amount)+" ₪":
    property.deal==="rent"&&fee.amount===100?"דמי שכירות של חודש אחד":
    priceFormat.format(fee.amount)+"% "+(property.deal==="rent"?"מדמי השכירות החודשיים המוסכמים":"ממחיר העסקה המוסכם");
  return "דמי תיווך "+amount+(fee.amount===0?"":fee.vat==="included"?" כולל מע״מ":" בתוספת מע״מ");
}
export function visitDocumentSpec(doc,id){
  const {terms,customer}=doc;
  return {
    title:"הזמנה בכתב לשירותי תיווך",
    reference:id,
    createdAt:doc.signedAt,
    sections:[
      {title:"פרטי המתווך",lines:[...contactLines(terms.broker),"רישיון "+terms.broker.license]},
      {title:"פרטי הלקוח",lines:contactLines(customer)},
      {title:"הנכסים ודמי התיווך",lines:terms.properties.flatMap(p=>[p.title+" · "+p.address+" · "+p.town,
        "סוג העסקה "+(p.deal==="rent"?"השכרה":"מכירה"),priceLine(p),feeLine(p)])},
      {title:"תנאים",lines:[terms.orderText,terms.paymentTerms,terms.feeChange,terms.consentText]},
      {title:"תיעוד חתימה",lines:["השם שהוקלד ואושר "+doc.signedBy,"טביעת התיעוד "+doc.digest,
        doc.brokerAcceptance?"אישור המתווך "+doc.brokerAcceptance.name:""]},
    ],
  };
}
export function draftOwnerSpec(record,kind){
  const common={reference:record.reference+"-"+kind,createdAt:record.at,draft:true};
  const property=record.property;
  const details={title:"פרטי הנכס",lines:[property.title,property.address+" · "+property.town,property.type,
    "סוג עסקה "+(property.deal==="sale"?"מכירה":"השכרה"),priceLine(property)]};
  if(kind==="exclusive") return {...common,title:"טיוטת מסמך בלעדיות נפרד",sections:[details,{title:"תקופה ותנאים לבדיקה",lines:[record.end?"עד "+record.end:"",record.exclusiveText]}]};
  if(kind==="marketing") return {...common,title:"טיוטת טופס פעולות שיווק",sections:[details,{title:"פעולות מוצעות",lines:[record.marketingText]}]};
  return {...common,title:"טיוטת הזמנת שירותי תיווך לבעל נכס",sections:[
    {title:"פרטי המתווך",lines:record.broker?[...contactLines(record.broker),"רישיון "+record.broker.license]:["פרטי מתווך טרם הוזנו."]},
    details,{title:"עמלה ותנאים מוצעים",lines:[feeLine(property),record.orderText]},
  ]};
}
