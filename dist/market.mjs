// Area price data from the government real-estate site (nadlan.gov.il, Israel Tax Authority deals).
// Uses the site's public open-data files (data.nadlan.gov.il), which it refreshes itself every quarter:
// median deal price per number of rooms for the town and the neighborhood, the yearly change,
// and the national median. Responses are cached at the edge for 12 hours; on any failure the
// property page simply shows no box. Runs in the visitor's browser: the data server refuses
// requests from hosting servers outside Israel but allows any web page (CORS *).
const DATA="https://data.nadlan.gov.il/api";
const SITE="https://www.nadlan.gov.il/";

const clean=value=>String(value||"").replace(/\(.*?\)/g," ").replace(/[^א-ת]/g,"");

async function get(path) {
  const response=await fetch(`${DATA}/${path}`,{signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw Error(`nadlan ${response.status} ${path}`);
  return response.json();
}

export function findTown(index,town) {
  const want=clean(town);
  if (!want) return null;
  const entries=Object.entries(index).map(([id,v])=>[id,clean(v.SETL_NAME)]);
  const hit=entries.find(([,name])=>name===want)||entries.find(([,name])=>name.startsWith(want)||want.startsWith(name)&&name.length>2);
  return hit?hit[0]:null;
}

export function findNeighborhood(list,neighborhood) {
  const want=clean(neighborhood);
  const inner=clean((String(neighborhood||"").match(/\((.*?)\)/)||[])[1]);
  if (!want&&!inner) return null;
  return (list||[]).find(n=>{const name=clean(n.title);return name&&(name===want||name===inner||(want&&want.includes(name)&&name.length>3));})||null;
}

const quarter=({year,month})=>`רבעון ${Math.ceil(month/3)} ${year}`;

// Picks the newest quarter that has a value for `key` (within the last two years).
function latest(graph,key) {
  const point=(graph||[]).slice(0,8).find(p=>p[key]);
  return point?{price:point[key],country:point.countryPrice||null,when:quarter(point),year:point.year,month:point.month}:null;
}

export function summarize(town,neighborhood,property) {
  const apartment=["דירה","פנטהאוז","דירת גן","דופלקס"].includes(property.type);
  const rooms=Math.round(Number(property.rooms)||0);
  const pick=page=>{
    const list=page?.trends?.rooms||[];
    return (apartment&&list.find(r=>Number(r.numRooms)===rooms&&r.hasDeals))||list.find(r=>r.numRooms==="all");
  };
  const cityRooms=pick(town);
  const hoodRooms=neighborhood?pick(neighborhood):null;
  const hood=hoodRooms&&latest(hoodRooms.graphData,"neighborhoodPrice");
  const city=cityRooms&&latest(cityRooms.graphData,"settlementPrice");
  if (!city&&!hood) return null;
  const specific=Number(cityRooms?.numRooms)>0;
  return {
    rent:property.deal==="rent",
    label:specific?`${cityRooms.numRooms} חדרים`:"כל העסקאות",
    town:town.settlementName,
    neighborhood:hood?neighborhood.neighborhoodName:"",
    hood,city,
    change:cityRooms?.summary?.priceDifferencePercentage!=null?Number(cityRooms.summary.priceDifferencePercentage):null,
    yield:town?.trends?.indexes?.yield??null,
    link:`${SITE}?view=${hood?"neighborhood":"settlement"}&id=${hood?neighborhood.neighborhoodId:town.settlementID}&page=${property.deal==="rent"?"rent":"deals"}`,
    version:town.version||"",
  };
}

export async function areaMarket(property) {
  if (!property?.town||property.type==="מגרש") return null;
  try {
    const kind=property.deal==="rent"?"rent":"buy";
    const id=findTown(await get("index/setl_types.json"),property.town);
    if (!id) return null;
    const town=await get(`pages/settlement/${kind}/${id}.json`);
    const match=findNeighborhood(town.otherNeighborhoods,property.neighborhood);
    const neighborhood=match?await get(`pages/neighborhood/${kind}/${match.id}.json`).catch(()=>null):null;
    return summarize(town,neighborhood,property);
  } catch (error) {
    console.warn("market_data_unavailable",error?.message);
    return null;
  }
}

const nis=value=>`${new Intl.NumberFormat("he-IL").format(Math.round(value))} ₪`;
const short=value=>value>=1e6?`${(value/1e6).toFixed(2).replace(/\.?0+$/,"")} מיליון ₪`:nis(value);
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

export function marketSection(m) {
  if (!m) return "";
  const money=m.rent?v=>`${nis(v)} לחודש`:short;
  const verb=m.rent?"שכר דירה חציוני":"מחיר חציוני בעסקאות";
  const tiles=[];
  if (m.hood) tiles.push([`${verb} · ${esc(m.neighborhood)}`,money(m.hood.price),`${m.label} · ${m.hood.when}`]);
  if (m.city) tiles.push([`${verb} · ${esc(m.town)}`,money(m.city.price),`${m.label} · ${m.city.when}`]);
  const country=(m.city||m.hood).country;
  if (country) tiles.push(["חציון ארצי",money(country),`${m.label} · ${(m.city||m.hood).when}`]);
  if (!m.rent&&m.change!=null) tiles.push(["שינוי בשנה האחרונה",`<span dir="ltr">${m.change>0?"+":""}${m.change.toFixed(1)}%</span>`,m.change<0?"ירידת מחירים ב"+esc(m.town):"עליית מחירים ב"+esc(m.town)]);
  else if (m.rent&&m.yield) tiles.push(["תשואת שכירות שנתית",`${m.yield}%`,`חציון ב${esc(m.town)}`]);
  return `<section class="listing-section market" aria-labelledby="market-title">
    <h2 id="market-title">מחירים באזור לפי נתוני המדינה</h2>
    <p class="market-intro">עסקאות שדווחו לרשות המסים, מתוך אתר הנדל״ן הממשלתי. הנתונים מתעדכנים אוטומטית.</p>
    <dl class="market-grid">${tiles.map(([k,v,s])=>`<div><dt>${k}</dt><dd>${v}</dd><span>${s}</span></div>`).join("")}</dl>
    <p class="market-foot"><a class="button outline" href="${esc(m.link)}" target="_blank" rel="noopener">לכל העסקאות באזור באתר הממשלתי</a>
    <small>חציון לפי עסקאות מדווחות; מחיר נכס בודד תלוי בגודל, קומה, מצב ומיקום. ייתכנו אי דיוקים במקור.</small></p>
  </section>`;
}

// Property page: <div id="market-box" data-town data-neighborhood data-type data-rooms data-deal>
if (typeof document!=="undefined") {
  const box=document.getElementById("market-box");
  if (box) areaMarket({...box.dataset}).then(m=>{
    const html=marketSection(m);
    if (html) box.outerHTML=html;
  });
}
