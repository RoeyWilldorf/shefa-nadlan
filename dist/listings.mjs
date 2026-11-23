export const towns = ["גדרה", "יבנה", "בני עי״ש", "מזכרת בתיה", "קריית עקרון", "גן יבנה", "רחובות", "יישובי גדרות",
  "אשדוד", "אשקלון", "קריית גת", "ראשון לציון", "בת ים", "תל אביב"];
// Address of each town's area page (/areas/<slug>.html).
export const townSlugs = {"גדרה":"gedera","יבנה":"yavne","בני עי״ש":"bnei-ayish","מזכרת בתיה":"mazkeret-batya","קריית עקרון":"kiryat-ekron",
  "גן יבנה":"gan-yavne","רחובות":"rehovot","יישובי גדרות":"gderot","אשדוד":"ashdod","אשקלון":"ashkelon","קריית גת":"kiryat-gat",
  "ראשון לציון":"rishon-lezion","בת ים":"bat-yam","תל אביב":"tel-aviv"};
export const types = ["דירה", "בית פרטי", "דירת גן", "פנטהאוז"];
export const dealNames = {sale: "למכירה", rent: "להשכרה"};

// Sample listings used before the office had real ones. Kept for the brokerage-form demo and tests,
// but hidden from the public site while showSamples is false.
export const showSamples = false;
export const properties = [
  {
    id: "gedera-01", deal: "sale", town: "גדרה", neighborhood: "גדרה הצעירה",
    title: "דירת 4 חדרים עם מרפסת", type: "דירה", rooms: 4, area: 103, price: 2390000,
    photo: "apartment", alt: "סלון מואר הפונה למרפסת ירוקה, תמונה להמחשה",
    description: "דירה משפחתית עם חלל מגורים פתוח, מטבח עם אי ומרפסת שמש היוצאת מהסלון. הדירה בקומה השלישית בבניין עם מעלית.",
    amenities: ["מרפסת שמש", "ממ״ד", "מעלית", "חניה"],
  },
  {
    id: "gedera-02", deal: "sale", town: "גדרה", neighborhood: "מרכז המושבה",
    title: "בית משפחתי עם חצר", type: "בית פרטי", rooms: 6, area: 182, price: 4190000,
    photo: "house", alt: "חזית בית פרטי בהירה עם גינה, תמונה להמחשה",
    description: "בית דו-מפלסי עם סלון הפונה לחצר, מטבח פתוח וחדר עבודה בקומת הכניסה. קומת המגורים כוללת יחידת הורים.",
    amenities: ["חצר", "ממ״ד", "חניה כפולה", "יחידת הורים"],
  },
  {
    id: "yavne-01", deal: "sale", town: "יבנה", neighborhood: "יבנה הירוקה",
    title: "פנטהאוז עם מרפסת פתוחה", type: "פנטהאוז", rooms: 5, area: 138, price: 3350000,
    photo: "balcony", alt: "מרפסת שמש עם צמחייה מול שכונת מגורים, תמונה להמחשה",
    description: "דירה בקומה העליונה עם חלל מגורים רחב ומרפסת פתוחה הצופה לשכונה. הכניסה למרפסת מהסלון.",
    amenities: ["מרפסת גדולה", "ממ״ד", "מעלית", "מחסן"],
  },
  {
    id: "bnei-ayish-01", deal: "rent", town: "בני עי״ש", neighborhood: "",
    title: "דירת 3 חדרים מוארת", type: "דירה", rooms: 3, area: 78, price: 4100,
    photo: "rental", alt: "סלון דירה עם מטבח פתוח, תמונה להמחשה",
    description: "דירה עם סלון פתוח, שני חדרי שינה ומקום לפינת אוכל. בבניין מעלית, ולדירה חניה.",
    amenities: ["ממ״ד", "מעלית", "חניה", "מיזוג"],
  },
  {
    id: "mazkeret-01", deal: "rent", town: "מזכרת בתיה", neighborhood: "",
    title: "דירת גן עם יציאה לחצר", type: "דירת גן", rooms: 5, area: 121, price: 7800,
    photo: "garden", alt: "סלון הפונה לגינה עם מדשאה, תמונה להמחשה",
    description: "דירת גן בקומת הכניסה, עם יציאה מהסלון לחצר ומרחב ישיבה מקורה. בדירה ארבעה חדרי שינה.",
    amenities: ["גינה פרטית", "ממ״ד", "חניה", "מחסן"],
  },
  {
    id: "kiryat-ekron-01", deal: "rent", town: "קריית עקרון", neighborhood: "",
    title: "דירת 4 חדרים בבניין נמוך", type: "דירה", rooms: 4, area: 96, price: 5400,
    photo: "building", alt: "בניין מגורים נמוך בגוון אבן בהירה, תמונה להמחשה",
    description: "דירה בבניין בן ארבע קומות, עם מרפסת קטנה וסלון הפונה לרחוב. חדר השינה השלישי מתאים גם לעבודה מהבית.",
    amenities: ["מרפסת", "מעלית", "ממ״ד", "חניה"],
  },
];

const normalize = value => String(value ?? "").toLowerCase().normalize("NFKD")
  .replace(/\p{M}/gu, "").replace(/[״׳'"]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function parsePrice(input) {
  const value = String(input).trim();
  if (!value) return null;
  if (!/^\d+$|^\d{1,3}(?:[,\s]\d{3})+$/.test(value)) return NaN;
  return Number(value.replace(/[,\s]/g, ""));
}

export function filterProperties(filters, sort) {
  const stop=new Set(["עם","של","עד","יש","אני","מחפש","מחפשת","נכס","רוצה"]);
  const terms = normalize(filters.q).split(" ").filter(term=>term&&!stop.has(term));
  const results = properties.filter(property => {
    if (filters.deal && property.deal !== filters.deal) return false;
    if (filters.town && property.town !== filters.town) return false;
    if (filters.type && property.type !== filters.type) return false;
    if (filters.neighborhood&&!normalize(property.neighborhood).includes(normalize(filters.neighborhood))) return false;
    if (filters.minArea&&(!property.area||property.area<Number(filters.minArea))) return false;
    if (filters.amenity&&!property.amenities.some(amenity=>normalize(amenity).includes(normalize(filters.amenity)))) return false;
    if (filters.rooms && (filters.rooms === "6+" ? property.rooms < 6 : property.rooms !== Number(filters.rooms))) return false;
    if (filters.min !== null && property.price < filters.min) return false;
    if (filters.max !== null && property.price > filters.max) return false;
    const haystack = normalize([property.title, property.town, property.neighborhood, property.type,
      dealNames[property.deal], property.description, ...property.amenities, `${property.rooms} חדרים`].join(" "));
    return terms.every(term => haystack.includes(term)||(term.length>3&&term.startsWith("ב")&&haystack.includes(term.slice(1))));
  });
  const compare = {
    low: (a, b) => a.price - b.price,
    high: (a, b) => b.price - a.price,
    area: (a, b) => b.area - a.area,
    recent: (a, b) => (b.publishedAt??"").localeCompare(a.publishedAt??""),
  }[sort];
  return compare ? results.sort(compare) : results;
}

export function validPhone(value) {
  return /^(?:\+972[2-9]|0[2-9])\d{7,8}$/.test(value.replace(/[\s().-]/g, ""));
}
