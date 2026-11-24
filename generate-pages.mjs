import {mkdir, readFile, writeFile} from "node:fs/promises";
import {properties, dealNames, towns, townSlugs, showSamples} from "./dist/listings.mjs";
import {propertyUrl} from "./dist/engagement.mjs";
import {singleBrackets, additionalBrackets} from "./dist/tax.mjs";
import {gederaNeighborhoods, inPlace} from "./dist/seo-areas.mjs";
import {reviews, googleRating} from "./dist/reviews.mjs";

const root = new URL("./dist/", import.meta.url);
const index = new URL("index.html", root);
const home = await readFile(index, "utf8");
const origin = new URL(home.match(/<link rel="canonical" href="([^"]+)"/)[1]).origin;
const symbols = home.match(/  <svg class="symbols"[\s\S]+?\n  <\/svg>/)[0];
const siteHeader = home.match(/  <header class="site-header">[\s\S]+?<\/header>/)[0];
const footer = home.match(/  <footer class="site-footer">[\s\S]+?<\/footer>/)[0];
const dialogs = home.match(/  <p id="page-status"[^\n]*/)[0]+"\n"+home.match(/  <dialog id="dialog"[^\n]*/)[0];
const escaped = value => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const number = new Intl.NumberFormat("he-IL");
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#${name}"/></svg>`;

function layout({path, title, description, contents, image, head = ""}) {
  const url = new URL(path, origin);
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#223e33">
  <title>${escaped(title)} | שפע נדל״ן</title>
  <meta name="description" content="${escaped(description)}">
  <link rel="canonical" href="${url.href}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="he_IL">
  <meta property="og:title" content="${escaped(title)} | שפע נדל״ן">
  <meta property="og:description" content="${escaped(description)}">
  <meta property="og:url" content="${url.href}">
  ${image ? `<meta property="og:image" content="${new URL(image, origin).href}">` : ""}
  <link rel="icon" href="/media/shefa-round.webp" type="image/webp">
  <link rel="stylesheet" href="/styles.css?v=23">
  <script type="module" src="/page.mjs?v=10"></script>
  <script type="module" src="/site-tools.mjs?v=3"></script>
${head}</head>
<body data-site-tools="public">
${symbols}
<a class="skip" href="#content">דילוג לתוכן הראשי</a>
${siteHeader}
<main class="wrap secondary-page" id="content" tabindex="-1">
${contents}
</main>
${footer}
${dialogs}
</body>
</html>
`;
}

const guides = [
  {
    slug: "buying-in-gedera", title: "קניית דירה בגדרה והסביבה",
    description: "מדריך לקנייה בגדרה והסביבה: בחירת אזור, השוואת עסקאות, בדיקות מסמכים והכנה לסיור.",
    lead: "התחילו באזור ובתקציב, ואז בדקו אילו עסקאות באמת דומות לנכס שאתם שוקלים.",
    sections: [
      ["מיקוד החיפוש", "סמנו את היישובים שבאים בחשבון ואת הדרישות שלא תרצו לוותר עליהן. אם אתם מתלבטים בין גדרה, יבנה ויישובים סמוכים, בדקו את מסלול הנסיעה בשעות שבהן תשתמשו בו ואת המרחק מהשירותים שאתם צריכים."],
      ["השוואת מחיר", "השוו עסקאות מכר באותו אזור ובשטח דומה. בדקו את תאריך המכירה ואת ההבדלים בקומה, בחניה ובמצב הנכס. אפשר לפתוח את טבלת העסקאות מכרטיס נכס ולבחור תקופה של עד 36 חודשים."],
      ["מה לברר בסיור", "בדקו אור ורעש, מצב רטיבות ותחזוקה, גישה לחניה, מעלית וממ״ד. שאלו מתי אפשר לקבל חזקה ואילו פריטים כלולים במחיר."],
      ["עלויות ומסמכים", "רכזו מראש את הוצאות העסקה, ובהן מס רכישה, מימון ושיפוץ. באזור המחשבונים והמסמכים אפשר לבדוק אומדן מס ולפתוח את שירותי הטאבו והמשכונות. בעסקה ממשית, בדיקת הזכויות וההסכם מתבצעת עם עורך הדין שלכם."],
    ],
    primary: ["/?deal=sale#listings", "חיפוש נכסים למכירה"], intent: "buy", action: "בקשת התאמת נכס לקנייה",
  },
  {
    slug: "selling-in-gedera", title: "מכירת דירה בגדרה והסביבה",
    description: "מה להכין לפני שיווק דירה למכירה בגדרה, איך לקרוא עסקאות השוואה ומה לברר בשיחת תיווך ראשונה.",
    lead: "מפרט מדויק ותמונות ברורות מאפשרים לקונים להבין את הנכס לפני שיחת הטלפון הראשונה.",
    sections: [
      ["הכנת מפרט", "רכזו יישוב ושכונה, שטח ומקור המדידה, מספר חדרים, קומה, מעלית, ממ״ד, חניה, מחסן ומועד מסירה משוער. אם יש הבדל בין שטח רשום לשטח שמופיע בחשבון הארנונה, ציינו את מקור כל מספר."],
      ["בדיקת מחיר לפני פרסום", "בדקו עסקאות שנחתמו באזור בתקופה האחרונה. השוו נכסים בשטח ובסוג דומים ותעדו אילו מאפיינים עשויים להסביר פערים בין המחירים. אם המדגם קטן, הרחיבו את טווח התאריכים וסמנו אילו עסקאות פחות דומות."],
      ["צילום, פרסום וסיורים", "צלמו את חללי הבית, כיווני האור והחוץ באור יום. החליטו מראש אם לפרסם כתובת מלאה. קבעו חלונות זמן לסיורים ועדכנו את המתווך כשיש שינוי במחיר, בזמינות או בתנאי המסירה."],
      ["שיחת הכנה עם המשרד", "הכינו שלושה פרטים לשיחה הראשונה: מה חשוב לכם בלוח הזמנים, מה ידוע על הנכס, ומה תרצו לברר על המחיר. אפשר להתחיל עם יישוב, סוג נכס וטלפון לחזרה."],
    ],
    primary: ["/#tools", "מחשבונים ומסמכים"], intent: "sell", action: "בקשת שיחה על מכירת נכס",
  },
  {
    slug: "renting-in-gedera", title: "השכרת דירות ושכירות בגדרה והסביבה",
    description: "מדריך לשוכרים ולמשכירים בגדרה והסביבה: תקציב, מועד כניסה, מידע לפני סיור ותנאי השכירות.",
    lead: "חיפוש ממוקד מתחיל במחיר החודשי, בתאריך הכניסה ובפרטים שתצטרכו לברר לפני סיור.",
    sections: [
      ["בדיקות לשוכרים", "שאלו מה כלול בדמי השכירות ומה משולם בנפרד. הוסיפו לתקציב ועד בית, ארנונה ועלויות מעבר רלוונטיות. בררו אילו פריטים נשארים בדירה ומתי ניתן להיכנס."],
      ["מידע שכדאי למשכירים להכין", "הכינו מחיר חודשי, מועד כניסה, מצב ריהוט ותנאים חשובים כמו חניה או התאמה לבעלי חיים. שיווק עם פרטים ברורים עוזר למתעניינים להחליט אם לבקש סיור."],
      ["השוואת מחירים", "השוו דירות להשכרה לפי סוג, שטח, אזור, מצב ומועד זמינות. טבלאות עסקאות המכר באתר עוזרות להבין את מחירי הקנייה באזור. להערכת שכירות נדרשים נתוני שכירות רלוונטיים."],
    ],
    primary: ["/?deal=rent#listings", "חיפוש נכסים להשכרה"], intent: "rent", action: "בקשת התאמת נכס להשכרה",
    secondary: ["let", "בקשת שיחה על שיווק נכס להשכרה"],
  },
];

function propertyPage(property) {
  const title = `${property.title} ${dealNames[property.deal]} ב${property.town} · נכס לדוגמה`;
  const description = `${property.title} ב${property.town}, ${property.area} מ״ר. נכס להמחשה עם מפרט, עסקאות השוואה ואפשרות להדגים בקשת סיור.`;
  const path = propertyUrl(property.id);
  const image = `/media/${property.photo}.webp`;
  return layout({path, title, description, image, contents: `
  <nav class="breadcrumbs" aria-label="מיקום באתר"><a href="/">דף הבית</a><span aria-hidden="true">/</span><a href="/?deal=${property.deal}#listings">נכסים ${dealNames[property.deal]}</a><span aria-hidden="true">/</span><span aria-current="page">${escaped(property.town)}</span></nav>
  <article aria-labelledby="property-title">
    <div class="property-heading">
      <div class="badges"><span class="tag tag-${property.deal}">${dealNames[property.deal]}</span><span class="tag tag-example">נכס לדוגמה</span></div>
      <h1 id="property-title">${escaped(property.title)}</h1>
      <p class="location">${icon("pin")}${[property.town, property.neighborhood].filter(Boolean).map(escaped).join(" · ")}</p>
    </div>
    <div class="property-grid">
      <img class="property-image" src="${image}" alt="${escaped(property.alt)}" width="764" height="336" fetchpriority="high">
      <aside class="content-card property-sidebar" aria-label="מחיר ופעולות לנכס">
        <h2>מחיר לדוגמה</h2>
        <p class="property-price"><bdi>${number.format(property.price)} ₪</bdi>${property.deal === "rent" ? " לחודש" : ""}</p>
        <p class="section-caption">פרטי הנכס והתמונה להמחשה.</p>
        <a class="button primary" href="/visit?property=${property.id}">${icon("chat")} בקשת תיאום סיור</a>
        <button class="button outline" type="button" data-market="${property.id}">${icon("chart")} עסקאות באזור</button>
        ${property.deal === "sale" ? `<button class="button outline" type="button" data-calculator="purchase" data-calculator-property="${property.id}">${icon("calculator")} חישוב מס רכישה</button>
        <button class="button outline" type="button" data-calculator="yield" data-calculator-property="${property.id}">${icon("chart")} חישוב תשואה ותזרים</button>` : ""}
        <div class="action-row"><button class="button outline" type="button" aria-pressed="false" data-save="${property.id}" aria-label="שמירה של הנכס">${icon("heart")} <span>שמירה</span></button><button class="button outline" type="button" data-share>העתקת קישור</button></div>
        <p id="share-result" class="section-caption"></p>
        <div id="share-box" hidden><label class="field"><span>קישור לעמוד הנכס</span><input id="share-address" type="url" readonly dir="ltr"></label></div>
        <div class="card-contacts"><button class="card-chat" type="button" data-whatsapp-property="${property.id}">WhatsApp על הנכס</button><a href="tel:+972527504034">שרל <bdi>052-7504034</bdi></a><a href="tel:+972527504037">רועי <bdi>052-7504037</bdi></a></div>
        <p class="detail-note">נכס לדוגמה: הפרטים, המחיר והתמונה מוצגים להמחשה בלבד.</p>
      </aside>
        <section class="content-card property-specs"><h2>פרטי הנכס</h2>
          <dl class="property-facts"><div><dt>סוג נכס</dt><dd>${escaped(property.type)}</dd></div><div><dt>חדרים</dt><dd>${property.rooms}</dd></div><div><dt>שטח</dt><dd>${property.area} מ״ר</dd></div></dl>
          <p>${escaped(property.description)}</p>
          <ul class="amenities" aria-label="מאפייני הנכס">${property.amenities.map(item => `<li>${escaped(item)}</li>`).join("")}</ul>
        </section>
    </div>
  </article>`});
}

function guidePage(guide) {
  return layout({path: `/guides/${guide.slug}.html`, title: guide.title, description: guide.description, contents: `
  <nav class="breadcrumbs" aria-label="מיקום באתר"><a href="/">דף הבית</a><span aria-hidden="true">/</span><a href="/#guides">מדריכים</a></nav>
  <article class="reading-page">
    <h1>${guide.title}</h1>
    <p class="reading-lead">${guide.lead}</p>
    ${guide.sections.map(([heading, body]) => `<section><h2>${heading}</h2><p>${body}</p></section>`).join("\n    ")}
    <div class="action-row"><a class="button primary" href="${guide.primary[0]}">${guide.primary[1]}</a><button class="button outline" type="button" data-contact="${guide.intent}">${guide.action}</button>${guide.secondary ? `<button class="button outline" type="button" data-contact="${guide.secondary[0]}">${guide.secondary[1]}</button>` : ""}</div>
  </article>`});
}


// ---------- Area pages (/areas/<slug>.html) ----------
const areaIntro = {
  "גדרה": "המשרד של שפע נדל״ן נמצא בגדרה, ומכאן אנחנו מכירים מקרוב את השכונות, את סוגי הבנייה ואת קצב העסקאות בעיר - מדירות בבניינים חדשים ועד בתים צמודי קרקע.",
  "יבנה": "יבנה שוכנת בשפלה הקרובה לחוף, בין רחובות לאשדוד, ומשלבת שכונות ותיקות עם אזורי בנייה חדשים. אנחנו מלווים קונים, מוכרים, שוכרים ומשכירים בעיר.",
  "בני עי״ש": "בני עי״ש היא מועצה מקומית הצמודה לגדרה, במרחק קצר מהמשרד שלנו. היא מתאימה למי שמחפש אווירה קהילתית לצד קרבה לשירותי העיר.",
  "מזכרת בתיה": "מזכרת בתיה היא מושבה ותיקה מימי העלייה הראשונה, סמוכה לרחובות ולגדרה, עם שילוב של בתים צמודי קרקע ושכונות חדשות יותר.",
  "קריית עקרון": "קריית עקרון היא מועצה מקומית בין רחובות למזכרת בתיה. אנחנו עוזרים למשפחות ולמשקיעים לבחון בה דירות ובתים למכירה ולהשכרה.",
  "גן יבנה": "גן יבנה היא מועצה מקומית בין יבנה לאשדוד, עם הרבה בנייה צמודת קרקע ושכונות חדשות. אנחנו מלווים עסקאות מכר ושכירות ביישוב.",
  "רחובות": "רחובות היא עיר מרכזית בשפלה, ובה מכון ויצמן למדע והפקולטה לחקלאות של האוניברסיטה העברית. אנחנו מלווים קונים, מוכרים ומשכירים בשכונות העיר.",
  "יישובי גדרות": "המועצה האזורית גדרות כוללת יישובים כפריים סמוכים לגדרה. הביקוש בהם לבתים צמודי קרקע ולמגרשים מצריך היכרות עם התנאים של כל יישוב, ואנחנו כאן כדי לעזור.",
  "אשדוד": "אשדוד היא עיר נמל גדולה לחוף הים, עם מגוון רחב של שכונות - מאזורים ותיקים ועד רובעים חדשים. אנחנו מלווים עסקאות מכר והשכרה בעיר.",
  "אשקלון": "אשקלון היא עיר חוף בדרום מישור החוף, עם שכונות ותיקות ופרויקטים חדשים. אנחנו עוזרים לקונים, למשקיעים ולבעלי נכסים בעיר.",
  "קריית גת": "קריית גת היא עיר בחבל לכיש, ובה אזור תעשייה גדול. אנחנו מלווים רוכשים, משקיעים ובעלי נכסים בעסקאות מכר ושכירות בעיר.",
  "ראשון לציון": "ראשון לציון היא אחת הערים הגדולות בישראל ומהמושבות הראשונות שנוסדו בארץ. אנחנו מלווים עסקאות מכר ושכירות בשכונות העיר.",
  "בת ים": "בת ים היא עיר חוף הסמוכה לתל אביב-יפו, עם ביקוש ערים לדירות להשכרה ולמכירה. אנחנו עוזרים לבעלי נכסים, לשוכרים ולקונים בעיר.",
  "תל אביב": "תל אביב-יפו היא המרכז העסקי והתרבותי של ישראל. יש לנו נכסים גם בתל אביב, ואנחנו מלווים בה עסקאות מכר ושכירות.",
};
const areaFaq = town => [
  [`איך מתחילים לחפש דירה ב${town}?`, `קבעו תקציב, מספר חדרים ומאפיינים שאי אפשר לוותר עליהם, ושלחו לנו את הפרטים. נחזור אליכם עם נכסים מתאימים ב${town} ובסביבה, ונעדכן כשיעלו נכסים חדשים.`],
  [`איך יודעים אם המחיר של נכס ב${town} הוגן?`, `השוו לעסקאות שנחתמו באזור בתקופה האחרונה, בשטח ובמאפיינים דומים. אפשר לבדוק עסקאות במאגר הרשמי של רשות המסים, ואנחנו נשמח לעזור לקרוא את הנתונים.`],
  [`רוצה למכור או להשכיר נכס ב${town} - מה הצעד הראשון?`, `בקשו הערכת שווי. נבחן את הנכס מול עסקאות דומות, נציע מחיר שיווק ונסביר איך נשווק אותו. השיחה הראשונה ללא התחייבות.`],
  ["איך עובדים דמי התיווך?", "לפני שמתחילים, חותמים על הזמנת שירותי תיווך בכתב, שבה מופיעים דמי התיווך ותנאי ההתקשרות - כפי שנדרש בחוק המתווכים. כך הכול ברור מראש."],
];
function areaPage(town) {
  const slug = townSlugs[town];
  const title = `נדל״ן ב${town}: דירות ובתים למכירה ולהשכרה`;
  const description = `תיווך נדל״ן ב${town}: דירות ובתים למכירה ולהשכרה, הערכת שווי לנכס וליווי אישי של שפע נדל״ן.`;
  const others = towns.filter(other => other !== town).map(other => `<a href="/areas/${townSlugs[other]}.html">${escaped(other)}</a>`).join("");
  const crumbs = {"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:[
    {"@type":"ListItem",position:1,name:"דף הבית",item:new URL("/", origin).href},
    {"@type":"ListItem",position:2,name:`נדל״ן ב${town}`,item:new URL(`/areas/${slug}.html`, origin).href}]};
  return layout({path: `/areas/${slug}.html`, title, description, image: "/media/hero.webp",
    head: `  <script type="module" src="/area.mjs?v=3"></script>\n  <script type="application/ld+json">${JSON.stringify(crumbs)}</script>\n${faqLd(areaFaq(town))}`,
    contents: `
  <nav class="breadcrumbs" aria-label="מיקום באתר"><a href="/">דף הבית</a><span aria-hidden="true">/</span><a href="/#areas">אזורים</a><span aria-hidden="true">/</span><span aria-current="page">${escaped(town)}</span></nav>
  <article class="area-page">
    <h1>${escaped(title)}</h1>
    <p class="reading-lead">${escaped(areaIntro[town])}</p>
    <div class="action-row">
      <button class="button primary" type="button" data-contact="alert" data-prefill-town="${escaped(town)}">עדכנו אותי על נכס ב${escaped(town)}</button>
      <a class="button outline" href="/valuation.html?town=${encodeURIComponent(town)}">כמה שווה הנכס שלי ב${escaped(town)}?</a>
    </div>
    <section aria-labelledby="area-listings-title">
      <h2 id="area-listings-title">נכסים ב${escaped(town)}</h2>
      <p id="area-status" class="section-caption" role="status">טוען נכסים…</p>
      <div id="area-listings" class="cards" data-town="${escaped(town)}"><!--SSR--></div>
    </section>
    ${town === "גדרה" ? `<nav class="related-links" id="neighborhoods" aria-label="חיפוש בגדרה"><h2>חיפוש לפי שכונה בגדרה</h2><div class="town-links"><a href="/areas/gedera-for-sale.html">כל הנכסים למכירה בגדרה</a><a href="/areas/gedera-for-rent.html">כל הנכסים להשכרה בגדרה</a>${gederaNeighborhoods.map(n => `<a href="/areas/${n.slug}.html">${escaped(n.name)}</a>`).join("")}</div></nav>` : ""}
    <section class="area-services" aria-labelledby="area-services-title">
      <h2 id="area-services-title">איך נוכל לעזור לכם ב${escaped(town)}</h2>
      <div class="path-grid">
        <article><h3>לקנות</h3><p>נאתר נכסים לפי התקציב והצרכים שלכם, ונעדכן ראשונים כשעולה נכס מתאים.</p><button type="button" class="button outline" data-contact="buy" data-prefill-town="${escaped(town)}">בקשת התאמת נכס</button></article>
        <article><h3>למכור</h3><p>הערכת שווי מול עסקאות דומות, צילום, שיווק וליווי עד החתימה.</p><a class="button outline" href="/valuation.html?town=${encodeURIComponent(town)}">הערכת שווי לנכס</a></article>
        <article><h3>לשכור</h3><p>ספרו לנו על מועד הכניסה והתקציב, ונמקד את החיפוש בשבילכם.</p><button type="button" class="button outline" data-contact="rent" data-prefill-town="${escaped(town)}">בקשת דירה להשכרה</button></article>
        <article><h3>להשכיר</h3><p>נעזור לקבוע מחיר שכירות, לשווק את הנכס ולמצוא שוכרים מתאימים.</p><button type="button" class="button outline" data-contact="let" data-prefill-town="${escaped(town)}">שיחה על השכרת נכס</button></article>
      </div>
    </section>
    <section class="reading-page area-faq" aria-labelledby="area-faq-title">
      <h2 id="area-faq-title">שאלות נפוצות</h2>
      ${areaFaq(town).map(([q, a]) => `<details><summary>${escaped(q)}</summary><p>${escaped(a)}</p></details>`).join("\n      ")}
    </section>
    <nav class="area-others" aria-label="אזורים נוספים"><h2>אזורים נוספים שאנחנו עובדים בהם</h2><div class="town-links">${others}</div></nav>
  </article>`});
}


// ---------- Client reviews (homepage and about page) ----------
const stars = `<span class="stars" aria-hidden="true">★★★★★</span>`;
const reviewsSection = `<section class="reviews-section" aria-labelledby="reviews-title">
        <div class="reviews-head"><div><h2 id="reviews-title">מה הלקוחות אומרים</h2>
          <p class="reviews-score">${stars}<strong>${googleRating.rating.toFixed(1)}</strong> · ${googleRating.count} ביקורות בגוגל</p></div>
          <a class="button outline" href="${googleRating.url}" target="_blank" rel="noopener">לכל הביקורות בגוגל</a></div>
        <div class="reviews-grid">${reviews.map(r => `<figure class="review-card"><div class="review-stars" role="img" aria-label="5 מתוך 5 כוכבים">★★★★★</div><blockquote>${escaped(r.text)}</blockquote><figcaption>${escaped(r.name)} · <span>ביקורת בגוגל</span></figcaption></figure>`).join("")}</div>
      </section>`;

// ---------- Valuation page ----------
const valuationPage = layout({
  path: "/valuation.html",
  title: "כמה שווה הדירה שלי? הערכת שווי לנכס",
  description: "רוצים לדעת כמה שווה הדירה או הבית שלכם? השאירו פרטים וקבלו הערכת שווי מבוססת עסקאות באזור משפע נדל״ן - בלי התחייבות.",
  image: "/media/hero.webp",
  head: `  <script type="module" src="/valuation.mjs?v=1"></script>\n  <script type="module" src="/quick-value.mjs?v=1"></script>\n`,
  contents: `
  <nav class="breadcrumbs" aria-label="מיקום באתר"><a href="/">דף הבית</a><span aria-hidden="true">/</span><span aria-current="page">הערכת שווי</span></nav>
  <article class="reading-page valuation-page">
    <h1>כמה שווה הנכס שלכם?</h1>
    <p class="reading-lead">ספרו לנו כמה פרטים על הדירה או הבית, ונחזור אליכם עם הערכת מחיר מבוססת עסקאות שנחתמו באזור - בלי עלות ובלי התחייבות.</p>
    <div class="action-row"><button class="button primary" type="button" data-contact="valuation" id="valuation-start">לקבלת הערכת שווי</button>
      <a class="button outline" href="tel:+972527504034">או התקשרו: <bdi>052-7504034</bdi></a></div>
    <section class="quick-value content-card" aria-labelledby="quick-value-title">
      <h2 id="quick-value-title">בדיקה מיידית: במה נמכרו דירות כמו שלכם?</h2>
      <p>בחרו יישוב, שכונה ומספר חדרים, וראו את מחירי העסקאות האחרונות לפי נתוני רשות המסים.</p>
      <form id="quick-value" class="quick-value-form">
        <label class="field"><span>יישוב</span><input name="town" list="quick-towns" required autocomplete="address-level2" placeholder="למשל: גדרה"></label>
        <datalist id="quick-towns">${towns.map(t => `<option value="${escaped(t)}">`).join("")}</datalist>
        <label class="field"><span>שכונה (רשות)</span><select name="neighborhood"><option value="">כל העיר</option></select></label>
        <label class="field"><span>מספר חדרים</span><select name="rooms"><option value="3">3 חדרים</option><option value="4" selected>4 חדרים</option><option value="5">5 חדרים</option><option value="all">אחר / בית פרטי</option></select></label>
        <button class="button primary" type="submit">הצגת מחירים</button>
      </form>
      <div id="quick-value-result" class="quick-value-result" role="status" aria-live="polite" hidden></div>
    </section>
    <section><h2>מה כוללת הערכת השווי?</h2><ul>
      <li>השוואה לעסקאות מכר או שכירות שנחתמו באזור, בנכסים דומים בשטח ובמאפיינים.</li>
      <li>טווח מחיר מומלץ לשיווק, והסבר מה מעלה ומה מוריד את המחיר של הנכס שלכם.</li>
      <li>תוכנית שיווק: צילום, פרסום, סיורים וליווי עד החתימה.</li>
    </ul></section>
    <section><h2>חשוב לדעת</h2><p>הערכת השווי היא חוות דעת מקצועית של משרד תיווך ואינה שמאות מקרקעין. לצורך משכנתא, ירושה או הליך משפטי יש לפנות לשמאי מקרקעין מוסמך.</p></section>
  </article>`,
});


// ---------- About ----------
const aboutPage = layout({
  path: "/about.html",
  title: "אודות שפע נדל״ן - משרד תיווך משפחתי בגדרה",
  description: "שפע נדל״ן - משרד תיווך משפחתי בגדרה בהובלת שרל ורועי וילדורף. שיווק דירות יד שנייה, פרויקטים חדשים, מגרשים ודירות להשכרה באזור השפלה.",
  image: "/media/team.webp",
  contents: `
  <nav class="breadcrumbs" aria-label="מיקום באתר"><a href="/">דף הבית</a><span aria-hidden="true">/</span><span aria-current="page">אודות</span></nav>
  <article class="about-page">
    <div class="about-hero">
      <div>
        <h1>אודות שפע נדל״ן</h1>
        <p class="reading-lead">שפע נדל״ן היא חברה לתיווך נדל״ן הנמצאת בגדרה, ומתמחה בשיווק נכסים באזור השפלה: נכסי יד שנייה, נכסים חדשים של חברות בנייה, מגרשים ודירות להשכרה.</p>
        <div class="about-people">
          <div><strong>שרל וילדורף</strong><small>רישיון תיווך <bdi>30826114</bdi></small><a href="tel:+972527504034"><bdi>052-7504034</bdi></a></div>
          <div><strong>רועי וילדורף</strong><small>רישיון תיווך <bdi>3211578</bdi></small><a href="tel:+972527504037"><bdi>052-7504037</bdi></a></div>
        </div>
      </div>
      <figure><img src="/media/team.webp" width="1200" height="988" alt="שרל וילדורף (משמאל) ורועי וילדורף, מייסדי שפע נדל״ן" fetchpriority="high"><figcaption>שרל ורועי וילדורף - אב ובן, משרד תיווך משפחתי</figcaption></figure>
    </div>
    <div class="reading-page">
      <p>מאחורינו ניסיון עשיר בתיווך ובמכירת דירות ומגרשים. אנו מלווים את המוכר ואת הקונה בכל עסקה עד למשא ומתן מוצלח, שבו שני הצדדים מרוצים מהתוצאה. אנו דואגים ליידע את לקוחותינו במצב שוק הנדל״ן הרלוונטי בתקופת המכירה או הקנייה.</p>
      <section><h2>כשאתם מוכרים נכס</h2>
        <p>כשאנו מקבלים נכס למכירה, אנו בודקים את הנכס ובונים לו תוכנית שיווקית שתורמת למכירתו בזמן הקצר ביותר ובמחיר הטוב ביותר - במינימום טרחה מצד המוכר.</p>
        <p>אנו מלווים את בעל הנכס עד תום העסקה, תוך מתן ייעוץ מקצועי בהכנת הבית למכירה.</p>
        <p>אנו מתמחרים את שווי הנכס בהתאם למצב השוק העדכני, ומעדכנים את המוכר על נכסים דומים שנמכרו בתקופה הרלוונטית. בכל מקרה, אנו מעבירים למוכר את כל הצעות המחיר שמתקבלות מקונים פוטנציאליים.</p>
      </section>
      <p class="about-quote">מרבית הנכסים שהיו ברשותנו בבלעדיות נמכרו בתוך 3 חודשים בממוצע, לשביעות רצון שני הצדדים. אמינות היא דגלנו והחריצות בעורקינו - ושתיהן יחד הן הנוסחה להצלחה במכירת נכסים.</p>
      <p class="about-closing">נשמח לקבל פניות מכם ולהציע לכם את שירותינו למכירה או לקניית בית חלומותיכם! חברת שפע נדל״ן על כלל סוכניה עומדת לרשותכם בכל עת.</p>
      <div class="action-row"><a class="button primary" href="/valuation.html">כמה שווה הנכס שלי?</a><button class="button outline" type="button" data-contact>יצירת קשר</button><a class="button outline" href="/#listings">לנכסים שלנו</a></div>
    </div>
    ${reviewsSection}
    <section class="sold-section" hidden aria-labelledby="sold-title"><h2 id="sold-title">נמכרו והושכרו לאחרונה</h2><p class="section-caption">נכסים שליווינו עד החתימה. רוצים שגם הנכס שלכם יופיע כאן? <a class="inline-link" href="/valuation.html">הערכת שווי חינם</a></p><div id="sold-listings" class="cards"><!--SOLD--></div></section>
  </article>`,
});

// ---------- Mortgage calculator ----------
const mortgagePage = layout({
  path: "/mortgage.html",
  title: "מחשבון משכנתא - החזר חודשי וסך ריבית",
  description: "מחשבון משכנתא פשוט: כמה יהיה ההחזר החודשי, כמה ריבית תשלמו לאורך התקופה, וכמה הון עצמי צריך לפי שיעורי המימון המקובלים.",
  head: `  <script type="module" src="/mortgage.mjs?v=1"></script>\n`,
  contents: `
  <nav class="breadcrumbs" aria-label="מיקום באתר"><a href="/">דף הבית</a><span aria-hidden="true">/</span><a href="/#tools">מחשבונים</a><span aria-hidden="true">/</span><span aria-current="page">מחשבון משכנתא</span></nav>
  <article class="reading-page mortgage-page">
    <h1>מחשבון משכנתא</h1>
    <p class="reading-lead">הזינו את מחיר הדירה, ההון העצמי, הריבית והתקופה - ותקבלו הערכה של ההחזר החודשי ושל סך הריבית.</p>
    <form id="mortgage-form" class="content-card mortgage-form" novalidate>
      <label class="field"><span>מחיר הדירה (₪)</span><input name="price" inputmode="numeric" value="2,000,000" required></label>
      <label class="field"><span>הון עצמי (₪)</span><input name="equity" inputmode="numeric" value="600,000" required></label>
      <label class="field"><span>ריבית שנתית ממוצעת (%)</span><input name="rate" inputmode="decimal" value="4.5" required></label>
      <label class="field"><span>תקופה (שנים)</span><input name="years" inputmode="numeric" value="25" required></label>
      <label class="field"><span>סוג הרכישה</span><select name="buyer"><option value="0.75">דירה יחידה (מימון עד 75%)</option><option value="0.7">דירה חלופית (מימון עד 70%)</option><option value="0.5">משקיע / דירה נוספת (מימון עד 50%)</option></select></label>
    </form>
    <div id="mortgage-result" class="mortgage-result" role="status" aria-live="polite"></div>
    <section><h2>חשוב לדעת</h2><ul>
      <li>החישוב לפי שיטת "שפיצר" (החזר חודשי קבוע) ובריבית קבועה, להמחשה בלבד. משכנתא אמיתית בנויה בדרך כלל מכמה מסלולים, וחלקם צמודי מדד או בריבית משתנה.</li>
      <li>שיעורי המימון המרביים לפי הוראות בנק ישראל: עד 75% לדירה יחידה, עד 70% לדירה חלופית ועד 50% לדירה נוספת.</li>
      <li>להצעה מדויקת פנו לבנק או ליועץ משכנתאות. מס רכישה ועלויות נוספות אפשר לחשב <a class="inline-link" href="/#tools">במחשבונים באתר</a>.</li>
    </ul></section>
    <div class="action-row"><a class="button primary" href="/#listings">חיפוש נכסים</a><button class="button outline" type="button" data-contact="buy">בקשת התאמת נכס לקנייה</button></div>
  </article>`,
});

// ---------- Privacy policy ----------
const privacyPage = layout({
  path: "/privacy.html",
  title: "מדיניות פרטיות",
  description: "איזה מידע שפע נדל״ן אוספת באתר, למה הוא משמש, איך הוא נשמר ואיך אפשר לעיין בו או למחוק אותו.",
  contents: `
  <nav class="breadcrumbs" aria-label="מיקום באתר"><a href="/">דף הבית</a><span aria-hidden="true">/</span><span aria-current="page">מדיניות פרטיות</span></nav>
  <article class="reading-page">
    <h1>מדיניות פרטיות</h1>
    <p>עדכון אחרון <time datetime="2026-11-23">23 בנובמבר 2026</time>. האתר מופעל על ידי וילדורף יזמות בע״מ (שפע נדל״ן), סברדלוב 5, גדרה.</p>
    <section><h2>איזה מידע אנחנו אוספים</h2><ul>
      <li><strong>פרטים שאתם מוסרים בטפסים:</strong> שם, טלפון, דוא״ל (רשות), ופרטים על הנכס או על החיפוש שלכם - יישוב, תקציב, מספר חדרים, שטח והודעה חופשית.</li>
      <li><strong>סטטיסטיקת שימוש כללית:</strong> מספר הצפיות בכל עמוד ומקור ההגעה (למשל Google או פייסבוק). הנתונים נספרים במצטבר בלבד, בלי כתובת IP ובלי מידע מזהה.</li>
      <li><strong>עוגיות (Cookies):</strong> עוגייה טכנית אחת עם מזהה אקראי שמאפשרת לשמור את הפניות שלכם ואת טופסי התיווך, ועוגיית התחברות לצוות המשרד בלבד. איננו משתמשים בעוגיות פרסום או מעקב.</li>
    </ul></section>
    <section><h2>למה המידע משמש</h2><ul>
      <li>כדי לחזור אליכם בעקבות הפנייה ולטפל בה.</li>
      <li>כדי להציע לכם נכסים שמתאימים לחיפוש שלכם, אם ביקשתם עדכונים.</li>
      <li>כדי לשפר את האתר ואת השירות.</li>
    </ul><p>איננו מוכרים את המידע ואיננו מעבירים אותו לצד שלישי לצורכי שיווק.</p></section>
    <section><h2>היכן המידע נשמר</h2><p>המידע נשמר במערכת המשרד, המאוחסנת אצל ספק ענן (Cloudflare). התראות על פניות חדשות נשלחות לצוות המשרד בדוא״ל באמצעות ספק שליחה (Resend). הגישה למידע מוגבלת לצוות המשרד בלבד ומוגנת בסיסמה ובחיבור מוצפן.</p></section>
    <section><h2>כמה זמן נשמר המידע</h2><p>המידע נשמר כל עוד הוא נדרש לטיפול בפנייה ולמתן השירות, או לפי מה שנדרש בדין. אפשר לבקש את מחיקתו בכל עת.</p></section>
    <section><h2>הזכויות שלכם</h2><p>לפי חוק הגנת הפרטיות, התשמ״א-1981, אתם רשאים לעיין במידע שנשמר עליכם, לבקש לתקן אותו או לבקש למחוק אותו, וכן לבקש שלא לקבל מאיתנו עדכונים. מסירת הפרטים אינה חובה, אך בלעדיהם לא נוכל לחזור אליכם.</p>
      <p>לפניות בנושא פרטיות: טלפון <a class="inline-link" href="tel:+972527504037"><bdi>052-7504037</bdi></a> או <button class="text-button inline-link" type="button" data-contact>טופס יצירת קשר</button>.</p></section>
  </article>`,
});

const accessibilityPage = layout({
  path: "/accessibility.html",
  title: "הצהרת נגישות",
  description: "התאמות הנגישות באתר שפע נדל״ן, ודרך לדווח על בעיית נגישות.",
  contents: `
  <nav class="breadcrumbs" aria-label="מיקום באתר"><a href="/">דף הבית</a><span aria-hidden="true">/</span><span aria-current="page">נגישות</span></nav>
  <article class="reading-page">
    <h1>הצהרת נגישות</h1>
    <p class="reading-lead">שפע נדל״ן פועלת להנגיש את האתר ואת שירותי המשרד לאנשים עם מוגבלות.</p>
    <p>עדכון אחרון <time datetime="2026-11-23">23 בנובמבר 2026</time>.</p>
    <section><h2>שימוש באתר</h2><ul>
      <li>אפשר לדלג מהחלק העליון של העמוד לתוכן הראשי.</li>
      <li>קישורים וכפתורים מציגים סימון מיקוד במעבר באמצעות Tab. אפשר לסגור חלונות באמצעות Escape.</li>
      <li>לשדות הטפסים יש תוויות, ושגיאות מסומנות בטקסט ליד השדה.</li>
      <li>פרטי נכסים מוצגים בעמודים עם כותרות ותיאורים חלופיים לתמונות. בכפתור נגישות אפשר להגדיל טקסט, להדגיש קישורים ולהפחית תנועה.</li>
    </ul></section>
    <section><h2>תקנים ומצב הבדיקות</h2><p>בדיקת האתר מביאה בחשבון את ת״י 5568 ברמת AA ואת תקנות נגישות השירות, לפי תחולתן. <bdi lang="en">WCAG 2.2 AA</bdi> משמש יעד פיתוח נוסף. בגרסה זו נבדקו מסלולים במקלדת ובדפדפן Chrome, כולל תצוגה המדמה מסכים צרים. התאמה מלאה לתקן, בדיקות במכשירים אמיתיים ובדיקות קוראי מסך עדיין טעונות אימות.</p><p><a class="inline-link" href="https://www.gov.il/he/pages/declaration_website_accessibility">הנחיות הנציבות על הצהרת נגישות</a></p></section>
    <section><h2>מסמכים והתאמות בשירות</h2><p>אפשר לבקש מסמך תיווך בפורמט נגיש או תיאום סיור באמצעות המשרד. נגישות מלאה של קובצי ה־PDF עדיין בבדיקה. הסדרי הגעה, חניה, כניסה וקבלת שירות במשרד טרם אומתו. אפשר לפנות למשרד לפני הגעה לבירור ולתיאום התאמה.</p></section>
    <section><h2>דיווח ובקשה להתאמה</h2><p>בטופס אפשר לכתוב באיזה עמוד נתקלתם בקושי ומה ניסיתם לעשות. הפנייה פותחת משימה במשרד. אפשר גם להתקשר אל <a class="inline-link" href="tel:+972527504037">רועי <bdi>052-7504037</bdi></a> או אל <a class="inline-link" href="tel:+972527504034">שרל <bdi>052-7504034</bdi></a>. פרטי רכז נגישות יושלמו אם חלה חובה למנותו.</p><button type="button" class="button primary" data-contact="access">דיווח על תקלה או בקשת התאמה</button></section>
  </article>`,
});


// ---------- Shared SEO helpers ----------
const ld = data => `  <script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>\n`;
const crumbsLd = items => ld({"@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([name, path], i) => ({"@type": "ListItem", position: i + 1, name, item: new URL(path, origin).href}))});
const faqLd = items => ld({"@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map(([q, a]) => ({"@type": "Question", name: q, acceptedAnswer: {"@type": "Answer", text: a}}))});
const crumbsNav = items => `<nav class="breadcrumbs" aria-label="מיקום באתר">${items.map(([name, path], i) => i === items.length - 1 ? `<span aria-current="page">${escaped(name)}</span>` : `<a href="${path}">${escaped(name)}</a><span aria-hidden="true">/</span>`).join("")}</nav>`;
const faqHtml = (items, title = "שאלות נפוצות") => `<section class="reading-page area-faq" aria-labelledby="faq-title"><h2 id="faq-title">${title}</h2>
      ${items.map(([q, a]) => `<details><summary>${escaped(q)}</summary><p>${escaped(a)}</p></details>`).join("\n      ")}</section>`;
const shekel = value => `${number.format(value)} ₪`;
const pct = rate => `${+(rate * 100).toFixed(1)}%`;
function bracketRows(brackets) {
  let lower = 0;
  return brackets.map(([upper, rate]) => {
    const row = `<tr><td>${upper === Infinity ? `מעל ${shekel(lower)}` : lower === 0 ? `עד ${shekel(upper)}` : `${shekel(lower + 1)} – ${shekel(upper)}`}</td><td>${pct(rate)}</td></tr>`;
    lower = upper; return row;
  }).join("");
}
const calcLinks = current => `<nav class="related-links" aria-label="מחשבונים נוספים"><h2>מחשבונים נוספים</h2><div class="town-links">${[
  ["/calculators/purchase-tax.html", "מחשבון מס רכישה"], ["/calculators/capital-gains-tax.html", "מחשבון מס שבח"], ["/mortgage.html", "מחשבון משכנתא"],
  ["/calculators/betterment-levy.html", "מחשבון היטל השבחה"], ["/calculators/rental-yield.html", "מחשבון תשואה משכירות"]].filter(([href]) => href !== current).map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}</div></nav>`;

// ---------- Calculator pages (/calculators/*.html) ----------
const calculators = [
  {
    slug: "purchase-tax", kind: "purchase", name: "מחשבון מס רכישה",
    title: "מחשבון מס רכישה 2026 - דירה יחידה ודירה נוספת",
    description: "מחשבון מס רכישה מעודכן לשנת 2026: חישוב לפי מדרגות המס לדירה יחידה ולדירה נוספת, כולל פירוט לפי מדרגות וטבלת המדרגות העדכנית.",
    lead: "הזינו את שווי הדירה, את סוג הרכישה ואת החלק שאתם רוכשים, וקבלו אומדן של מס הרכישה עם פירוט לפי מדרגות.",
    body: `<section><h2>מה זה מס רכישה?</h2>
      <p>מס רכישה הוא מס שמשלם מי שרוכש זכות במקרקעין, ובכלל זה דירת מגורים. גובה המס נקבע לפי שווי הדירה ולפי מעמד הרוכש: רוכש דירה יחידה נהנה ממדרגות מס מקלות, ובחלק התחתון של המחיר אינו משלם מס כלל. רוכש דירה נוספת משלם מס גבוה יותר כבר מהשקל הראשון.</p></section>
    <section><h2>מדרגות מס רכישה לדירה יחידה</h2>
      <p>המדרגות שלהלן חלות על עסקאות מ־16.1.2025 ועד 15.1.2028, וכך הן מחושבות במחשבון.</p>
      <div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">שווי הדירה</th><th scope="col">שיעור המס</th></tr></thead><tbody>${bracketRows(singleBrackets)}</tbody></table></div></section>
    <section><h2>מדרגות מס רכישה לדירה נוספת</h2>
      <p>לעסקאות מ־16.1.2025 ועד 31.12.2026.</p>
      <div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">שווי הדירה</th><th scope="col">שיעור המס</th></tr></thead><tbody>${bracketRows(additionalBrackets)}</tbody></table></div></section>
    <section><h2>דוגמה לחישוב</h2>
      <p>רוכש דירה יחידה שקונה דירה ב־2,500,000 ₪ לא ישלם מס על החלק הראשון (עד ${shekel(singleBrackets[0][0])}), ישלם 3.5% על החלק שבין המדרגה הראשונה ל־${shekel(singleBrackets[1][0])}, ו־5% על היתרה. המחשבון עושה את החישוב הזה עבורכם ומציג את הפירוט.</p></section>`,
    faq: [
      ["מי נחשב רוכש דירה יחידה?", "באופן כללי, תושב ישראל שהדירה הנרכשת תהיה דירת המגורים היחידה שלו. מי שמחזיק דירה אחרת ומתחייב למכור אותה בתוך פרק הזמן שקבוע בחוק (דירה חלופית) יכול גם הוא ליהנות מהמדרגות של דירה יחידה, בכפוף לתנאים. את הסיווג הסופי קובעת רשות המסים."],
      ["האם המחשבון מחליף את חישוב רשות המסים?", "לא. המחשבון נותן אומדן לפי המדרגות הרגילות. לבדיקת זכאות להקלות, פטורים או מצבים מיוחדים (למשל עולים חדשים או נכי צה״ל), השתמשו בסימולטור של רשות המסים או היוועצו בעורך הדין המלווה את העסקה."],
      ["מי מדווח ומשלם את מס הרכישה?", "בדרך כלל עורך הדין של הקונה מגיש את הדיווח לרשות המסים אחרי החתימה על החוזה, והקונה משלם את המס לפי השומה. כדאי לתכנן את התשלום כבר בשלב בניית התקציב לרכישה."],
      ["האם מס רכישה נכלל במשכנתא?", "לא. הבנקים מממנים אחוז ממחיר הדירה, ואת מס הרכישה, שכר הטרחה ודמי התיווך יש לשלם מההון העצמי. לכן חשוב לחשב את המס מראש."],
    ],
  },
  {
    slug: "capital-gains-tax", kind: "gain", name: "מחשבון מס שבח",
    title: "מחשבון מס שבח - אומדן מס על מכירת דירה",
    description: "מחשבון מס שבח למכירת דירה: אומדן המס על השבח הריאלי בשיעור 25%, עם הסבר על פטורים, הוצאות מוכרות ומתי כדאי לפנות לייעוץ.",
    lead: "הזינו את מחיר המכירה, את עלות הרכישה המתואמת ואת ההוצאות המוכרות, וקבלו אומדן ראשוני של מס השבח.",
    body: `<section><h2>מה זה מס שבח?</h2>
      <p>מס שבח הוא מס על הרווח (״השבח״) ממכירת זכות במקרקעין: ההפרש בין מחיר המכירה לבין מחיר הרכישה, אחרי הצמדה למדד ואחרי ניכוי הוצאות מוכרות. את המס משלם המוכר.</p></section>
    <section><h2>איך מחושב האומדן במחשבון</h2>
      <p>המחשבון מניח דירה שנרכשה מ־1.1.2014 ושכל השבח הריאלי חייב במס בשיעור 25%. הזינו עלות רכישה והוצאות אחרי הצמדה למדד, כדי שהאומדן יתקרב לחישוב האמיתי.</p>
      <ul><li><strong>הוצאות מוכרות</strong> נפוצות: שכר טרחת עורך דין ודמי תיווך בקנייה ובמכירה, מס רכישה ששולם, ושיפורים שהשביחו את הדירה.</li>
      <li><strong>דירה שנרכשה לפני 2014</strong> מחושבת בדרך כלל בשיטה ״ליניארית״, שבה חלק מהשבח עשוי להיות פטור. המחשבון אינו מחשב מצב זה.</li></ul></section>
    <section><h2>פטור ממס שבח</h2>
      <p>במכירת דירת מגורים מזכה קיימים פטורים, ובראשם פטור למוכר דירה יחידה, בכפוף לתנאים ולתקרת שווי שמתעדכנת מעת לעת. לפני מכירה כדאי לבדוק עם עורך דין או רואה חשבון אם הפטור חל עליכם, ואיך לתכנן את המכירה בצורה הנכונה.</p></section>`,
    faq: [
      ["מי משלם מס שבח, הקונה או המוכר?", "המוכר. הקונה משלם מס רכישה, והמוכר משלם מס שבח על הרווח מהמכירה, אם אינו זכאי לפטור."],
      ["האם מוכר דירה יחידה פטור ממס שבח?", "במקרים רבים כן, בתנאים שקבועים בחוק ועד תקרת שווי מסוימת. התנאים כוללים בין השאר החזקה בדירה לתקופה מינימלית ואי־מכירת דירה אחרת בפטור בתקופה שקדמה למכירה. כדאי לבדוק את הזכאות מול איש מקצוע."],
      ["אילו הוצאות אפשר לנכות?", "בין השאר: שכר טרחת עורך דין ודמי תיווך בקנייה ובמכירה, מס הרכישה ששולם, והוצאות השבחה כמו שיפוץ מהותי או תוספת בנייה. יש לשמור קבלות."],
      ["מתי מדווחים על המכירה?", "בדרך כלל עורך הדין של המוכר מגיש את הדיווח לרשות המסים זמן קצר אחרי החתימה על החוזה. אפשר להיעזר בשירות השומה העצמית של רשות המסים."],
    ],
  },
  {
    slug: "betterment-levy", kind: "betterment", name: "מחשבון היטל השבחה",
    title: "מחשבון היטל השבחה - אומדן לפי שווי לפני ואחרי",
    description: "מחשבון היטל השבחה: אומדן ההיטל בשיעור 50% מעליית השווי בעקבות אישור תכנית, הקלה או שימוש חורג, לפי חלק הזכויות שלכם.",
    lead: "הזינו את סכום ההשבחה או את שווי הנכס לפני השינוי התכנוני ואחריו, ואת חלק הזכויות שלכם, וקבלו אומדן של היטל ההשבחה.",
    body: `<section><h2>מה זה היטל השבחה?</h2>
      <p>היטל השבחה הוא תשלום לוועדה המקומית לתכנון ובנייה, כשערך המקרקעין עולה בעקבות אישור תכנית, מתן הקלה או התרת שימוש חורג. השיעור הרגיל הוא מחצית (50%) מסכום ההשבחה, כלומר מעליית השווי שנגרמה בגלל השינוי התכנוני.</p></section>
    <section><h2>מתי משלמים?</h2>
      <p>החיוב נוצר במועד אישור התכנית או ההקלה, אבל התשלום נדרש בדרך כלל במועד ״מימוש״: מכירת הנכס, קבלת היתר בנייה שמנצל את הזכויות, או התחלת השימוש החורג. לכן קונים ומוכרים של בתים ומגרשים צריכים לבדוק אם יש היטל פתוח לפני החתימה.</p></section>
    <section><h2>איך לבדוק לפני עסקה</h2>
      <ul><li>בקשו מהוועדה המקומית אישור על חובות היטל השבחה לנכס.</li>
      <li>בדקו אילו תכניות אושרו על המגרש מאז הרכישה האחרונה.</li>
      <li>במכירה, ודאו בחוזה מי נושא בהיטל, ובמקרה של מחלוקת על הסכום, היוועצו בשמאי מקרקעין.</li></ul></section>`,
    faq: [
      ["כמה היטל השבחה משלמים?", "השיעור הרגיל הוא 50% מסכום ההשבחה, כלומר מעליית השווי שנגרמה בגלל השינוי התכנוני. הסכום עצמו נקבע בשומה של הוועדה המקומית או של שמאי מכריע."],
      ["האם יש פטורים מהיטל השבחה?", "כן. החוק קובע מצבים מסוימים שבהם ניתן פטור, למשל בתנאים מסוימים בהרחבת דירת מגורים. הפטורים תלויים בפרטי המקרה, ולכן כדאי לבדוק מול הוועדה המקומית או שמאי."],
      ["מי משלם את ההיטל בעסקת מכר?", "לפי החוק, החבות היא של בעל הזכות במועד אישור התכנית, בדרך כלל המוכר. בפועל הצדדים יכולים להסכים אחרת בחוזה, ולכן חשוב לבדוק את הסעיף לפני החתימה."],
    ],
  },
  {
    slug: "rental-yield", kind: "yield", name: "מחשבון תשואה משכירות",
    title: "מחשבון תשואה על דירה להשקעה - ברוטו, נטו ותזרים",
    description: "מחשבון תשואה לדירה להשקעה: תשואה ברוטו, תשואה אחרי הוצאות ותזרים חודשי אחרי החזר משכנתא, לפי מחיר הנכס ושכר הדירה.",
    lead: "הזינו את מחיר הנכס, שכר הדירה הצפוי, עלויות הרכישה וההוצאות, וראו את התשואה ואת התזרים החודשי.",
    body: `<section><h2>איך מחשבים תשואה על דירה?</h2>
      <ul><li><strong>תשואה ברוטו:</strong> שכר הדירה השנתי חלקי מחיר הנכס. זה המדד הנפוץ להשוואה מהירה בין נכסים.</li>
      <li><strong>תשואה אחרי הוצאות:</strong> שכר הדירה השנתי פחות הוצאות שוטפות (תחזוקה, ביטוח, ועד בית ותקופות ללא שוכר), חלקי מחיר הנכס יחד עם עלויות הרכישה.</li>
      <li><strong>תזרים חודשי:</strong> מה נשאר בכיס בכל חודש אחרי ההוצאות והחזר המשכנתא.</li></ul></section>
    <section><h2>מה עוד חשוב לבדוק בנכס להשקעה</h2>
      <ul><li>ביקוש לשכירות באזור: קרבה לתחבורה, לאזורי תעסוקה ולמוסדות חינוך.</li>
      <li>מס רכישה על דירה נוספת, שמגדיל את עלות הרכישה (ראו <a class="inline-link" href="/calculators/purchase-tax.html">מחשבון מס רכישה</a>).</li>
      <li>מיסוי הכנסות משכירות: למגורים קיימים כמה מסלולי מיסוי, ובהם פטור עד תקרה ומסלול של 10%. כדאי לבחור מסלול בעזרת רואה חשבון.</li></ul></section>`,
    faq: [
      ["מהי תשואה טובה לדירה להשקעה?", "אין מספר אחד נכון. התשואה תלויה באזור, בסוג הנכס ובפוטנציאל להשבחה. כדאי להשוות לתשואה החציונית באזור ולשקול גם את עליית הערך הצפויה."],
      ["האם התשואה כוללת מס?", "לא. המחשבון מציג את החישוב לפני מס על הכנסות משכירות. מסלול המיסוי המתאים תלוי בגובה ההכנסה ובמצב האישי שלכם."],
      ["איך שפע נדל״ן יכולה לעזור למשקיעים?", "אנחנו מאתרים נכסים להשקעה בגדרה ובשפלה, בודקים את רמת שכר הדירה באזור ועוזרים למצוא שוכרים ולנהל את ההשכרה."],
    ],
  },
];

function calculatorPage(calc) {
  const path = `/calculators/${calc.slug}.html`;
  const crumbs = [["דף הבית", "/"], ["מחשבונים", "/#tools"], [calc.name, path]];
  return layout({path, title: calc.title, description: calc.description, image: "/media/hero.webp",
    head: `  <script type="module" src="/calc-page.mjs?v=1"></script>\n${crumbsLd(crumbs)}${faqLd(calc.faq)}${ld({"@context": "https://schema.org", "@type": "WebApplication", name: calc.name, url: new URL(path, origin).href, applicationCategory: "FinanceApplication", operatingSystem: "Any", inLanguage: "he", offers: {"@type": "Offer", price: 0, priceCurrency: "ILS"}, provider: {"@type": "RealEstateAgent", name: "שפע נדל״ן", url: origin}})}`,
    contents: `
  ${crumbsNav(crumbs)}
  <article class="calc-page">
    <header class="calc-page-head"><h1>${escaped(calc.title)}</h1><p class="reading-lead">${escaped(calc.lead)}</p></header>
    <div class="calc-layout">
      <div id="calc-root" class="content-card calc-root" data-kind="${calc.kind}" aria-busy="true"><noscript>כדי להשתמש במחשבון יש להפעיל JavaScript.</noscript></div>
      <aside class="calc-aside content-card"><h2>צריכים עזרה בעסקה?</h2><p>אנחנו מלווים קונים ומוכרים בגדרה ובשפלה, מהחיפוש ועד החתימה.</p>
        <button class="button primary" type="button" data-contact="${calc.kind === "gain" || calc.kind === "betterment" ? "sell" : calc.kind === "yield" ? "invest" : "buy"}">דברו איתנו</button>
        <a class="button outline" href="/#listings">לנכסים שלנו</a></aside>
    </div>
    <div class="reading-page calc-content">
      ${calc.body}
      <p class="detail-note">המחשבון נותן אומדן כללי בלבד ואינו מהווה ייעוץ מס או ייעוץ משפטי. לפני עסקה היוועצו בעורך דין, ברואה חשבון או בשמאי מקרקעין.</p>
    </div>
    ${faqHtml(calc.faq)}
    ${calcLinks(path)}
  </article>`});
}


// ---------- Gedera landing pages: sale / rent / neighborhoods ----------
const hoodLinks = current => `<nav class="related-links" aria-label="שכונות בגדרה"><h2>שכונות בגדרה</h2><div class="town-links">${gederaNeighborhoods.filter(n => n.slug !== current).map(n => `<a href="/areas/${n.slug}.html">${escaped(n.name)}</a>`).join("")}</div></nav>`;
const marketBox = (type, deal) => `<div id="market-box" data-town="גדרה" data-neighborhood="" data-type="${type}" data-rooms="" data-deal="${deal}"></div><script type="module" src="/market.mjs?v=3"></script>`;
const hoodMarketBox = hood => `<div id="market-box" data-town="גדרה" data-neighborhood="${escaped(hood.aliases[0])}" data-type="${hood.kind === "apartments" ? "דירה" : "בית פרטי"}" data-rooms="" data-deal="sale"></div><script type="module" src="/market.mjs?v=3"></script>`;
const listingsBlock = ({title, deal = "", neighborhood = "", label}) => `<section aria-labelledby="area-listings-title">
      <h2 id="area-listings-title">${escaped(title)}</h2>
      <p id="area-status" class="section-caption" role="status">טוען נכסים…</p>
      <div id="area-listings" class="cards" data-town="גדרה" data-deal="${deal}" data-neighborhood="${neighborhood}" data-label="${escaped(label)}"><!--SSR--></div>
    </section>`;

const dealPages = [
  {
    slug: "gedera-for-sale", deal: "sale", h1: "דירות ובתים למכירה בגדרה",
    title: "דירות למכירה בגדרה - דירות, בתים ומגרשים", description: "דירות, בתים פרטיים, דו־משפחתיים ומגרשים למכירה בגדרה, מעודכן מהמשרד של שפע נדל״ן בעיר. מחירי עסקאות באזור, שכונות וליווי אישי עד החתימה.",
    lead: "כל הנכסים שאנחנו משווקים למכירה בגדרה, מעודכנים ישירות מהמשרד שלנו בעיר: דירות בבניינים חדשים, בתים פרטיים ודו־משפחתיים, ומגרשים לבנייה.",
    body: `<section><h2>קנייה בגדרה: מה כדאי לדעת</h2>
      <p>גדרה נמצאת בשפלה, בין רחובות לאשדוד, ומושכת משפחות וזוגות צעירים שמחפשים מחיר נגיש יותר מערי המרכז לצד גישה נוחה לכבישים הראשיים. בעיר משתלבות שכונות חדשות עם בנייני מגורים, שכונות של בתים צמודי קרקע ואזורים ותיקים סביב המושבה ההיסטורית.</p>
      <ol class="steps-list"><li><strong>הגדירו תקציב מלא:</strong> מחיר הדירה, מס רכישה, עורך דין, תיווך ושיפוצים. <a class="inline-link" href="/calculators/purchase-tax.html">חשבו את מס הרכישה</a> ואת <a class="inline-link" href="/mortgage.html">ההחזר החודשי</a>.</li>
      <li><strong>בחרו שכונה:</strong> דירה בבניין חדש או בית עם חצר? כל שכונה בגדרה מתאימה לסגנון חיים אחר.</li>
      <li><strong>השוו למחירי עסקאות:</strong> לפני הצעת מחיר, בדקו עסקאות שנחתמו באזור. אנחנו עוזרים לקרוא את הנתונים.</li>
      <li><strong>בדקו את הנכס לעומק:</strong> רישום בטאבו, היתרי בנייה, חובות היטל השבחה ומצב הבניין.</li></ol></section>`,
    faq: [
      ["כמה עולה דירה בגדרה?", "המחיר תלוי בשכונה, בגודל ובסוג הנכס. דירות 4–5 חדרים בבניינים חדשים נמכרות במחירים שונים מבתים צמודי קרקע. בעמוד הזה מוצגים מחירי עסקאות עדכניים מנתוני המדינה, ובכל נכס מופיע המחיר המבוקש."],
      ["אילו שכונות יש בגדרה?", "בין השכונות: גדרה מזרח (גולדה) עם בנייה חדשה, אמירי גן ועמק הנשר עם בתים דו־משפחתיים, המושבה הגרמנית וגדרה הצעירה עם בתים פרטיים ומגרשים, והמושבה - הלב ההיסטורי של העיר."],
      ["למה לקנות דרך משרד תיווך מקומי?", "משרד מקומי מכיר את השכונות, את המחירים בפועל ואת הנכסים שעוד לא פורסמו. אנחנו מלווים את הקנייה מהסיור הראשון ועד החתימה, ופועלים לפי חוק המתווכים עם הזמנת שירותי תיווך בכתב."],
      ["אפשר לקבל עדכון כשעולה נכס חדש?", "כן. השאירו פרטים עם מה שאתם מחפשים, ונעדכן אתכם ראשונים כשעולה נכס מתאים - לפעמים עוד לפני שהוא מתפרסם."],
    ],
  },
  {
    slug: "gedera-for-rent", deal: "rent", h1: "דירות ובתים להשכרה בגדרה",
    title: "דירות להשכרה בגדרה - דירות ובתים לשכירות", description: "דירות ובתים להשכרה בגדרה, מעודכן מהמשרד של שפע נדל״ן בעיר. בתים דו־משפחתיים, דירות ובתים פרטיים לשכירות ארוכת טווח.",
    lead: "נכסים להשכרה בגדרה, מעודכנים ישירות מהמשרד שלנו בעיר. ספרו לנו מה אתם מחפשים, ונעדכן אתכם כשנכס מתאים מתפנה.",
    body: `<section><h2>שכירות בגדרה: מה כדאי לבדוק</h2>
      <ul><li><strong>מועד כניסה ותקופת השכירות:</strong> בררו מראש אם אפשר לחתום לתקופה ארוכה ואם יש אופציה להארכה.</li>
      <li><strong>בטחונות:</strong> בדקו אילו ערבויות נדרשות (ערבים, ערבות בנקאית או צ׳קים) ומתי הן מוחזרות.</li>
      <li><strong>מצב הנכס:</strong> תעדו בתמונות את מצב הדירה לפני הכניסה, ובקשו לתקן ליקויים לפני החתימה.</li>
      <li><strong>הוצאות נוספות:</strong> ארנונה, ועד בית, מים, חשמל וגז - כדאי לדעת את הסכומים מראש.</li></ul></section>
    <section><h2>יש לכם נכס להשכרה בגדרה?</h2><p>אנחנו עוזרים לקבוע את שכר הדירה לפי השוק, לשווק את הנכס ולמצוא שוכרים מתאימים. <a class="inline-link" href="/valuation.html?town=%D7%92%D7%93%D7%A8%D7%94">השאירו פרטים</a> ונחזור אליכם.</p></section>`,
    faq: [
      ["כמה עולה לשכור דירה בגדרה?", "שכר הדירה תלוי בגודל, בשכונה ובסוג הנכס. בעמוד מוצג שכר הדירה החציוני בגדרה לפי נתוני המדינה, ולכל נכס מופיע המחיר המבוקש."],
      ["אילו נכסים להשכרה יש בגדרה?", "בעיר מוצעים להשכרה דירות בבניינים, וגם בתים דו־משפחתיים ובתים פרטיים בשכונות כמו אמירי גן ועמק הנשר."],
      ["איך מקבלים עדכון על דירה להשכרה?", "השאירו פרטים עם התקציב, מספר החדרים ומועד הכניסה, ונעדכן אתכם כשמתפנה נכס מתאים."],
    ],
  },
];

function dealPage(page) {
  const path = `/areas/${page.slug}.html`;
  const crumbs = [["דף הבית", "/"], ["גדרה", "/areas/gedera.html"], [page.h1, path]];
  const other = page.deal === "sale" ? ["/areas/gedera-for-rent.html", "נכסים להשכרה בגדרה"] : ["/areas/gedera-for-sale.html", "נכסים למכירה בגדרה"];
  return layout({path, title: page.title, description: page.description, image: "/media/hero.webp",
    head: `  <script type="module" src="/area.mjs?v=3"></script>\n${crumbsLd(crumbs)}${faqLd(page.faq)}`,
    contents: `
  ${crumbsNav(crumbs)}
  <article class="area-page">
    <h1>${escaped(page.h1)}</h1>
    <p class="reading-lead">${escaped(page.lead)}</p>
    <div class="action-row">
      <button class="button primary" type="button" data-contact="alert" data-prefill-town="גדרה">עדכנו אותי על נכס חדש</button>
      <a class="button outline" href="${other[0]}">${other[1]}</a>
    </div>
    ${listingsBlock({title: page.deal === "sale" ? "נכסים למכירה בגדרה" : "נכסים להשכרה בגדרה", deal: page.deal, label: "גדרה"})}
    ${marketBox("דירה", page.deal)}
    <div class="reading-page">${page.body}</div>
    ${hoodLinks("")}
    ${faqHtml(page.faq)}
  </article>`});
}

const houseChecks = `<ul><li><strong>שטח בנוי מול שטח מגרש:</strong> בקשו את שני הנתונים, ובדקו מה מופיע בהיתר הבנייה ובחשבון הארנונה.</li>
      <li><strong>היתרים ותוספות:</strong> ודאו שכל התוספות (חדרים, מרתף, פרגולות) בנויות בהיתר.</li>
      <li><strong>בית דו־משפחתי:</strong> בררו איך המגרש מחולק בין שני הבתים והאם יש הסכם שיתוף רשום.</li>
      <li><strong>זכויות בנייה ויתרות:</strong> אם יש זכויות שלא נוצלו, הן עשויות להוסיף לערך הנכס. בדקו גם חובות היטל השבחה (<a class="inline-link" href="/calculators/betterment-levy.html">מחשבון היטל השבחה</a>).</li></ul>`;
const apartmentChecks = `<ul><li><strong>רישום הדירה:</strong> בדקו נסח טאבו או אישור זכויות, ובבניין חדש - את רישום הבית המשותף.</li>
      <li><strong>חניה ומחסן:</strong> ודאו שהם צמודים לדירה ברישום ולא רק בפועל.</li>
      <li><strong>ממ״ד, מעלית ומרפסת שמש:</strong> מאפיינים שמשפיעים מאוד על המחיר ועל הביקוש בעת מכירה עתידית.</li>
      <li><strong>ועד בית ותחזוקה:</strong> בררו את גובה דמי ועד הבית ואם מתוכננות עבודות בבניין.</li></ul>`;

function neighborhoodPage(hood) {
  const path = `/areas/${hood.slug}.html`;
  const label = hood.page || hood.name;
  const crumbs = [["דף הבית", "/"], ["גדרה", "/areas/gedera.html"], [label, path]];
  const title = `נדל״ן ${inPlace(hood.name)}, גדרה - ${hood.focus} למכירה ולהשכרה`;
  const description = `${hood.focus} ${inPlace(hood.name)} בגדרה: נכסים למכירה ולהשכרה, מחירי עסקאות מנתוני המדינה, ומה חשוב לבדוק לפני קנייה. שפע נדל״ן - המשרד המקומי בגדרה.`;
  const faq = [
    [`כמה עולה נכס ${inPlace(hood.name)}?`, `המחיר תלוי בסוג הנכס, בגודל ובמצב. בעמוד מוצגים מחירי עסקאות עדכניים מנתוני המדינה לגדרה ולשכונה (כשיש מספיק עסקאות), ולכל נכס מופיע המחיר המבוקש. להערכה מדויקת לנכס מסוים, פנו אלינו.`],
    [`איזה סוג נכסים יש ${inPlace(hood.name)}?`, `${inPlace(hood.name)} משווקים בעיקר ${hood.focus}. הרשימה בעמוד מתעדכנת אוטומטית לפי הנכסים שאנחנו משווקים כרגע.`],
    [`יש לי נכס ${inPlace(hood.name)}. כמה הוא שווה?`, `השאירו פרטים לבקשת הערכת שווי. נשווה את הנכס לעסקאות דומות בשכונה ובגדרה, ונציע מחיר שיווק ותוכנית שיווק - בלי התחייבות.`],
  ];
  return layout({path, title, description, image: "/media/hero.webp",
    head: `  <script type="module" src="/area.mjs?v=3"></script>\n${crumbsLd(crumbs)}${faqLd(faq)}`,
    contents: `
  ${crumbsNav(crumbs)}
  <article class="area-page">
    <h1>נדל״ן ${escaped(inPlace(hood.name))}, גדרה</h1>
    <p class="reading-lead">${escaped(hood.intro)}</p>
    <div class="action-row">
      <button class="button primary" type="button" data-contact="alert" data-prefill-town="גדרה">עדכנו אותי על נכס ${escaped(inPlace(hood.short || hood.name))}</button>
      <a class="button outline" href="/valuation.html?town=%D7%92%D7%93%D7%A8%D7%94">כמה שווה הנכס שלי?</a>
    </div>
    ${listingsBlock({title: `נכסים ${inPlace(hood.short || hood.name)}`, neighborhood: hood.slug, label: hood.name})}
    ${hoodMarketBox(hood)}
    <div class="reading-page">
      <section><h2>מה חשוב לבדוק כשקונים ${escaped(inPlace(hood.short || hood.name))}</h2>${hood.kind === "apartments" ? apartmentChecks : houseChecks}</section>
      <section><h2>מוכרים או משכירים נכס ${escaped(inPlace(hood.short || hood.name))}?</h2><p>אנחנו משווקים נכסים בשכונה ומכירים את הקונים והשוכרים שמחפשים בה. נכין לכם הערכת שווי מול עסקאות דומות, צילום מקצועי ושיווק ממוקד באתר, ביד 2 וברשתות החברתיות.</p>
        <p><a class="inline-link" href="/areas/gedera-for-sale.html">לכל הנכסים למכירה בגדרה</a> · <a class="inline-link" href="/areas/gedera-for-rent.html">לנכסים להשכרה בגדרה</a></p></section>
    </div>
    ${faqHtml(faq)}
    ${hoodLinks(hood.slug)}
  </article>`});
}

await Promise.all(["properties/", "guides/", "areas/", "calculators/"].map(dir => mkdir(new URL(dir, root), {recursive: true})));
for (const property of properties) await writeFile(new URL(propertyUrl(property.id).slice(1), root), propertyPage(property));
for (const guide of guides) await writeFile(new URL(`guides/${guide.slug}.html`, root), guidePage(guide));
await writeFile(new URL("accessibility.html", root), accessibilityPage);
for (const town of towns) await writeFile(new URL(`areas/${townSlugs[town]}.html`, root), areaPage(town));
await writeFile(new URL("valuation.html", root), valuationPage);
await writeFile(new URL("about.html", root), aboutPage);
await writeFile(new URL("mortgage.html", root), mortgagePage);
for (const page of dealPages) await writeFile(new URL(`areas/${page.slug}.html`, root), dealPage(page));
for (const hood of gederaNeighborhoods) await writeFile(new URL(`areas/${hood.slug}.html`, root), neighborhoodPage(hood));
for (const calc of calculators) await writeFile(new URL(`calculators/${calc.slug}.html`, root), calculatorPage(calc));
await writeFile(new URL("privacy.html", root), privacyPage);

const listingLinks = (showSamples ? properties : []).map(property => `<article class="card static-listing"><h3><a href="${propertyUrl(property.id)}">${escaped(property.title)}</a></h3><p>${escaped(property.town)} · ${dealNames[property.deal]} · נכס לדוגמה</p></article>`).join("\n          ");
const reviewedHome = home.replace(/<!-- BEGIN REVIEWS -->[\s\S]*?<!-- END REVIEWS -->/, `<!-- BEGIN REVIEWS -->\n      ${reviewsSection}\n      <!-- END REVIEWS -->`);
const linkedHome = reviewedHome.replace(/<!-- BEGIN LISTING LINKS -->[\s\S]*?<!-- END LISTING LINKS -->/, `<!-- BEGIN LISTING LINKS -->\n          ${listingLinks}\n        <!-- END LISTING LINKS -->`);
if (linkedHome !== home) await writeFile(index, linkedHome);
