import {withBrandContacts} from "../dist/brand.mjs";

export const propertyStates = {draft:"טיוטה",active:"פעיל",pending:"בהמתנה",negotiation:"במשא ומתן",sold:"נמכר",rented:"הושכר",archived:"ארכיון"};
export const leadStates = {new:"חדש",contacted:"נוצר קשר",matched:"הותאם נכס",tour:"נקבע סיור",negotiation:"משא ומתן",closed:"נסגר",lost:"לא הבשיל"};
export const intents = {general:"בירור כללי",visit:"בקשת סיור",buy:"קנייה",rent:"שכירות",sell:"מכירה",let:"השכרה",invest:"השקעה",access:"נגישות",returning:"לקוח חוזר",prospect:"בעל נכס פוטנציאלי"};
export const channels = {site:"אתר שפע נדל״ן",facebook:"Facebook",instagram:"Instagram",whatsapp:"WhatsApp",marketplace:"Marketplace",story:"סטוריז",landing:"דף נחיתה"};
export const featureNames = {lift:"מעלית",parking:"חניה",shelter:"ממ״ד",balcony:"מרפסת",storage:"מחסן",yard:"חצר"};
export const idPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export const supportedTypes = ["דירה","בית פרטי","קוטג׳","דירת גן","פנטהאוז","דופלקס","מגרש","משרד","מסחרי","אחר"];

export function marketingCopy(p, channel, url) {
  const deal = p.deal === "sale" ? "למכירה" : "להשכרה";
  const title = `${deal} · ${p.title} · ${p.town}`;
  const price = `${new Intl.NumberFormat("he-IL").format(p.price)} ₪${p.deal === "rent" ? " לחודש" : ""}`;
  const location = [p.town, p.neighborhood].filter(Boolean).join(" · ");
  const facts = [location,p.rooms ? `${p.rooms} חדרים` : "",p.area ? `${p.area} מ״ר` : "",price].filter(Boolean).join(" | ");
  const features = Object.entries(featureNames).filter(([key])=>p.specs?.[key]===true).map(([,value])=>value).join(", ");
  const action = {site:"לפרטים ותיאום סיור פנו לשפע נדל״ן.",facebook:"רוצים לראות את הנכס? פנו אלינו לתיאום סיור.",instagram:"לפרטים ולתיאום סיור, כתבו לנו בהודעה.",whatsapp:"רוצים פרטים נוספים או תיאום סיור? נשמח לעזור.",marketplace:"לפרטים ולתיאום ביקור, שלחו הודעה.",story:"לתיאום סיור כתבו לנו.",landing:"השאירו פרטים לתיאום סיור עם שפע נדל״ן."}[channel];
  const tracking = ["facebook","whatsapp","landing"].includes(channel) ? url : "";
  const parts = channel === "whatsapp" ? [title,facts,features,action,tracking] : [title,facts,p.description,features,action,tracking];
  return {title,body:withBrandContacts(parts.filter(Boolean).join("\n\n"))};
}

export function matchProperty(lead, property) {
  const profile=lead.profile??{};
  if (!["active","negotiation"].includes(property.status)) return null;
  const requiredDeal = lead.intent === "rent" ? "rent" : ["buy","invest"].includes(lead.intent) ? "sale" : "";
  if (!requiredDeal || requiredDeal!==property.deal) return null;
  const reasons=["סוג עסקה מתאים"];
  let score=25;
  if (profile.town) {
    if (profile.town!==property.town) return null;
    score+=25; reasons.push("ביישוב המבוקש");
  }
  if (profile.budget) {
    if (property.price>profile.budget) return null;
    score+=25; reasons.push("בתקציב");
  }
  if (profile.rooms) {
    if (!property.rooms || property.rooms<profile.rooms) return null;
    score+=15; reasons.push("מספר חדרים מתאים");
  }
  if (profile.area) {
    if (!property.area || property.area<profile.area) return null;
    score+=10; reasons.push("שטח מתאים");
  }
  if ((profile.features??[]).some(key=>property.specs?.[key]!==true)) return null;
  if (profile.features?.length) reasons.push("כולל את המאפיינים שסומנו");
  return {score,reasons};
}
