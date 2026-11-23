// Publishing properties to the office's Facebook Page and Instagram business account
// through the Meta Graph API.
//
// One-time setup: a Meta app (developers.facebook.com) whose App ID goes in FB_APP_ID
// (variable) and App Secret in FB_APP_SECRET (Secret). The owner then clicks "חיבור לפייסבוק"
// in the office; the login returns here, and the Page token (which does not expire) is stored
// in the database - it never reaches the browser.
import {marketingCopy} from "./model.mjs";
import {withBrandContacts} from "../dist/brand.mjs";
import {writeCopy} from "./site-growth.mjs";

const SCOPES="pages_show_list,pages_read_engagement,pages_manage_posts,business_management,instagram_basic,instagram_content_publish";
const version=env=>env.META_GRAPH_VERSION||"v23.0";
const graph=env=>`https://graph.facebook.com/${version(env)}`;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const configured=env=>Boolean(env.FB_APP_ID&&env.FB_APP_SECRET);

async function call(url,init) {
  const response=await fetch(url,init);
  const data=await response.json().catch(()=>({}));
  if (!response.ok||data.error) throw Error(data.error?.message||`Meta ${response.status}`);
  return data;
}
async function saved(env) {
  return env.DB.prepare("SELECT * FROM site_social WHERE id='meta'").first();
}

export async function socialStatus(env) {
  const row=configured(env)?await saved(env):null;
  const posts=(await env.DB.prepare("SELECT property_id,network,post_id,error,at FROM site_social_posts ORDER BY at DESC LIMIT 20").all()).results;
  return {configured:configured(env),connected:Boolean(row),page:row?.page_name||"",instagram:row?.ig_username||"",
    pages:row?JSON.parse(row.pages_json||"[]").map(({id,name,ig_username})=>({id,name,instagram:ig_username||""})):[],
    selected:row?.page_id||"",auto:Boolean(row?.auto),posts};
}

export function connectRedirect(env,origin,state) {
  const params=new URLSearchParams({client_id:env.FB_APP_ID,redirect_uri:`${origin}/office/social/callback`,state,scope:SCOPES,response_type:"code"});
  return `https://www.facebook.com/${version(env)}/dialog/oauth?${params}`;
}

export async function connectCallback(env,origin,code) {
  const base=graph(env);
  const short=await call(`${base}/oauth/access_token?${new URLSearchParams({client_id:env.FB_APP_ID,client_secret:env.FB_APP_SECRET,redirect_uri:`${origin}/office/social/callback`,code})}`);
  const long=await call(`${base}/oauth/access_token?${new URLSearchParams({grant_type:"fb_exchange_token",client_id:env.FB_APP_ID,client_secret:env.FB_APP_SECRET,fb_exchange_token:short.access_token})}`);
  const accounts=await call(`${base}/me/accounts?${new URLSearchParams({fields:"id,name,access_token,instagram_business_account{id,username}",limit:"50",access_token:long.access_token})}`);
  const pages=(accounts.data||[]).map(p=>({id:p.id,name:p.name,token:p.access_token,ig_id:p.instagram_business_account?.id||"",ig_username:p.instagram_business_account?.username||""}));
  if (!pages.length) throw Error("לא נמצא עמוד פייסבוק שאתה מנהל. ודא שבחרת את עמוד שפע נדל״ן בחלון ההרשאות.");
  const page=pages.find(p=>/שפע|shefa/i.test(p.name))||pages[0];
  await env.DB.prepare(`INSERT INTO site_social (id,page_id,page_name,page_token,ig_id,ig_username,pages_json,auto,connected_at) VALUES ('meta',?,?,?,?,?,?,1,?)
    ON CONFLICT(id) DO UPDATE SET page_id=excluded.page_id,page_name=excluded.page_name,page_token=excluded.page_token,ig_id=excluded.ig_id,
    ig_username=excluded.ig_username,pages_json=excluded.pages_json,connected_at=excluded.connected_at`)
    .bind(page.id,page.name,page.token,page.ig_id,page.ig_username,JSON.stringify(pages),new Date().toISOString()).run();
  return page;
}

export async function updateSocial(env,data) {
  const row=await saved(env);
  if (!row) return json({error:"החשבון עדיין לא מחובר."},409);
  if (data.disconnect===true) {
    await env.DB.prepare("DELETE FROM site_social WHERE id='meta'").run();
    return json({ok:true});
  }
  if (typeof data.auto==="boolean") await env.DB.prepare("UPDATE site_social SET auto=? WHERE id='meta'").bind(data.auto?1:0).run();
  if (data.pageId) {
    const page=JSON.parse(row.pages_json||"[]").find(p=>p.id===data.pageId);
    if (!page) return json({error:"העמוד לא נמצא."},400);
    await env.DB.prepare("UPDATE site_social SET page_id=?,page_name=?,page_token=?,ig_id=?,ig_username=? WHERE id='meta'")
      .bind(page.id,page.name,page.token,page.ig_id,page.ig_username).run();
  }
  return json(await socialStatus(env));
}

function fallbackCopy(property,channel,link) {
  const copy=marketingCopy(property,channel,link);
  return withBrandContacts(copy.body);
}

// Publishes one property. `loadProperty` returns the office view of the property ({property,files}).
export async function publishProperty(env,propertyId,loadProperty,origin,{force=false}={}) {
  const row=await saved(env);
  if (!configured(env)||!row) return {skipped:"not_connected"};
  if (!force) {
    const done=await env.DB.prepare("SELECT 1 AS done FROM site_social_posts WHERE property_id=? AND error IS NULL").bind(propertyId).first();
    if (done) return {skipped:"already_posted"};
  }
  const {property,files}=await (await loadProperty()).json();
  if (!["active","negotiation"].includes(property?.status)) return {skipped:"not_published"};
  const photo=(files||[]).find(f=>f.public_photo&&f.mime.startsWith("image/"));
  if (!force&&!photo) return {skipped:"waiting_for_photo"}; // automatic posts wait for the first approved photo
  const imageUrl=photo?`${origin}/listing-media/${photo.id}`:"";
  const link=network=>`${origin}/listing/${propertyId}?utm_source=${network}&utm_medium=social&utm_campaign=auto`;
  const caption=async network=>{
    const ai=await writeCopy(env,property,network,"warm","");
    const text=ai?`${ai.title}\n\n${ai.body}`:fallbackCopy(property,network,"");
    return withBrandContacts(`${text}\n\n${network==="instagram"?"לפרטים - קישור בביו או בהודעה פרטית 📩\n":""}${link(network)}`).slice(0,2100);
  };
  const results=[];
  const record=async(network,postId,error)=>{
    await env.DB.prepare("INSERT INTO site_social_posts (property_id,network,post_id,error,at) VALUES (?,?,?,?,?)")
      .bind(propertyId,network,postId||null,error?String(error).slice(0,300):null,new Date().toISOString()).run();
    results.push({network,postId,error:error||null});
  };
  try {
    const message=await caption("facebook");
    const data=imageUrl
      ?await call(`${graph(env)}/${row.page_id}/photos`,{method:"POST",body:new URLSearchParams({url:imageUrl,message,access_token:row.page_token})})
      :await call(`${graph(env)}/${row.page_id}/feed`,{method:"POST",body:new URLSearchParams({message,link:link("facebook"),access_token:row.page_token})});
    await record("facebook",data.post_id||data.id,null);
  } catch(error) { await record("facebook",null,error.message); }
  if (row.ig_id) {
    if (!imageUrl) await record("instagram",null,"אינסטגרם דורש תמונה - העלו תמונה לנכס");
    else try {
      const created=await call(`${graph(env)}/${row.ig_id}/media`,{method:"POST",body:new URLSearchParams({image_url:imageUrl,caption:await caption("instagram"),access_token:row.page_token})});
      for (let i=0;i<5;i++) {
        const state=await call(`${graph(env)}/${created.id}?fields=status_code&access_token=${encodeURIComponent(row.page_token)}`);
        if (state.status_code==="FINISHED") break;
        if (state.status_code==="ERROR") throw Error("אינסטגרם לא הצליח לעבד את התמונה");
        await new Promise(r=>setTimeout(r,2000));
      }
      const published=await call(`${graph(env)}/${row.ig_id}/media_publish`,{method:"POST",body:new URLSearchParams({creation_id:created.id,access_token:row.page_token})});
      await record("instagram",published.id,null);
    } catch(error) { await record("instagram",null,error.message); }
  }
  return {results};
}

export async function autoPublish(env,propertyId,loadProperty,origin) {
  const row=configured(env)?await saved(env):null;
  if (!row?.auto) return;
  await publishProperty(env,propertyId,loadProperty,origin);
}
