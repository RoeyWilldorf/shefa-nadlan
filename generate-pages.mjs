import {mkdir, readFile, writeFile} from "node:fs/promises";
import {properties, dealNames} from "./dist/listings.mjs";
import {propertyUrl} from "./dist/engagement.mjs";

const root = new URL("./dist/", import.meta.url);
const index = new URL("index.html", root);
const home = await readFile(index, "utf8");
const origin = new URL(home.match(/<link rel="canonical" href="([^"]+)"/)[1]).origin;
const symbols = home.match(/  <svg class="symbols"[\s\S]+?\n  <\/svg>/)[0];
const brand = home.match(/<a class="wordmark" href="#top" aria-label=[\s\S]+?<\/a>/)[0].replace('href="#top"', 'href="/"');
const footer = home.match(/  <footer class="footer">[\s\S]+?<\/footer>/)[0]
  .replace('href="#top"', 'href="/"').replaceAll('href="#', 'href="/#');
const dialogs = home.match(/  <p id="page-status"[^\n]*/)[0]+"\n"+home.match(/  <dialog id="dialog"[^\n]*/)[0];
const escaped = value => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const number = new Intl.NumberFormat("he-IL");
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#${name}"/></svg>`;

function layout({path, title, description, contents, image}) {
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
  <link rel="stylesheet" href="/styles.css?v=10">
  <script type="module" src="/page.mjs?v=10"></script>
  <script type="module" src="/site-tools.mjs"></script>
</head>
<body data-site-tools="public">
${symbols}
<a class="skip" href="#content">דילוג לתוכן הראשי</a>
<header class="header">
  <div class="wrap header-inner">
    ${brand}
    <nav aria-label="ניווט ראשי"><a href="/#listings">נכסים</a><a href="/#services">שירותי תיווך</a><a href="/#guides">מדריכים</a></nav>
    <a class="mobile-tools" href="/#tools" aria-label="מחשבונים ומסמכים">${icon("calculator")}<span>כלים</span></a>
    <button type="button" class="button outline header-contact" data-contact>יצירת קשר</button>
  </div>
</header>
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
        <p class="detail-note">הקישור מיועד למי שכבר מורשה להיכנס לאבטיפוס.</p>
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

const accessibilityPage = layout({
  path: "/accessibility.html",
  title: "הצהרת נגישות",
  description: "התאמות הנגישות באבטיפוס שפע נדל״ן, ודרך לדווח על בעיית נגישות.",
  contents: `
  <nav class="breadcrumbs" aria-label="מיקום באתר"><a href="/">דף הבית</a><span aria-hidden="true">/</span><span aria-current="page">נגישות</span></nav>
  <article class="reading-page">
    <h1>הצהרת נגישות</h1>
    <p class="reading-lead">שפע נדל״ן פועלת להנגיש את האתר ואת שירותי המשרד לאנשים עם מוגבלות.</p>
    <p><strong>טיוטה לגרסת הבדיקה הפרטית.</strong> עדכון אחרון <time datetime="2026-11-16">16 בנובמבר 2026</time>.</p>
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

await Promise.all(["properties/", "guides/"].map(dir => mkdir(new URL(dir, root), {recursive: true})));
for (const property of properties) await writeFile(new URL(propertyUrl(property.id).slice(1), root), propertyPage(property));
for (const guide of guides) await writeFile(new URL(`guides/${guide.slug}.html`, root), guidePage(guide));
await writeFile(new URL("accessibility.html", root), accessibilityPage);

const listingLinks = properties.map(property => `<article class="card static-listing"><h3><a href="${propertyUrl(property.id)}">${escaped(property.title)}</a></h3><p>${escaped(property.town)} · ${dealNames[property.deal]} · נכס לדוגמה</p></article>`).join("\n          ");
const linkedHome = home.replace(/<!-- BEGIN LISTING LINKS -->[\s\S]*?<!-- END LISTING LINKS -->/, `<!-- BEGIN LISTING LINKS -->\n          ${listingLinks}\n        <!-- END LISTING LINKS -->`);
if (linkedHome !== home) await writeFile(index, linkedHome);
