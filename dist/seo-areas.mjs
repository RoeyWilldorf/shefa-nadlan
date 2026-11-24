// Search landing pages for Gedera: deal pages and neighborhood pages.
// Shared by the page generator (static content) and the Worker (live listings, breadcrumbs).

// Hebrew "in X": the definite article merges into the preposition (ב+המושבה = במושבה).
export const inPlace = name => `ב${String(name).startsWith("ה") ? String(name).slice(1) : name}`;

export const letters = value => String(value || "").replace(/[^א-ת]/g, "");

export const gederaNeighborhoods = [
  {
    slug: "gedera-amirei-gan", name: "אמירי גן", aliases: ["אמירי גן", "אמירי גדרה", "אמירי"], kind: "houses",
    intro: "אמירי גן היא שכונת מגורים בגדרה שבולטים בה בתים צמודי קרקע ודו־משפחתיים. היא מתאימה במיוחד למשפחות שמחפשות בית עם חצר, הרבה חדרים ומרחב, במרחק נסיעה קצר ממרכז העיר.",
    focus: "בתים דו־משפחתיים ובתים פרטיים",
  },
  {
    slug: "gedera-golda", name: "גדרה מזרח (גולדה)", short: "גולדה", aliases: ["גדרה מזרח (גולדה)", "גדרה מזרח/גולדה", "גולדה", "גדרה מזרח"], kind: "apartments",
    intro: "גדרה מזרח, המוכרת גם כשכונת גולדה, היא אזור מגורים חדש יחסית במזרח העיר, עם בנייני מגורים חדשים ודירות מרווחות של 4 ו־5 חדרים. היא פופולרית בקרב זוגות צעירים ומשפחות שמחפשים דירה חדשה בגדרה.",
    focus: "דירות 4–5 חדרים בבניינים חדשים",
  },
  {
    slug: "gedera-german-colony", name: "המושבה הגרמנית", aliases: ["המושבה הגרמנית"], kind: "houses",
    intro: "המושבה הגרמנית היא שכונה בגדרה שבה משווקים בעיקר בתים פרטיים על מגרשים, לרבות בתים גדולים של 5 חדרים ויותר. קונים בשכונה מחפשים בדרך כלל בית פרטי עם שטח בנוי גדול ומגרש משמעותי.",
    focus: "בתים פרטיים",
  },
  {
    slug: "gedera-emek-hanesher", name: "עמק הנשר", aliases: ["עמק הנשר"], kind: "houses",
    intro: "עמק הנשר היא שכונת מגורים בגדרה עם בתים דו־משפחתיים וצמודי קרקע, שמתאימה למשפחות המחפשות בית מרווח, לקנייה או לשכירות ארוכת טווח.",
    focus: "בתים דו־משפחתיים לקנייה ולהשכרה",
  },
  {
    slug: "gedera-hatseira", name: "גדרה הצעירה", aliases: ["גדרה הצעירה"], kind: "houses",
    intro: "גדרה הצעירה היא שכונה בגדרה שבה מוצעים בתים פרטיים לצד מגרשים לבנייה. היא מעניינת גם משפחות שרוצות לבנות בית בהתאמה אישית וגם משקיעים שמחפשים קרקע.",
    focus: "בתים פרטיים ומגרשים",
  },
  {
    slug: "gedera-moshava", name: "המושבה", page: "המושבה (מרכז גדרה הוותיק)", aliases: ["המושבה"], kind: "mixed",
    intro: "המושבה היא הלב ההיסטורי של גדרה, שנוסדה בשנת 1884 בידי אנשי תנועת ביל״ו. באזור משתלבים בתים ותיקים, מגרשים ודירות, בקרבה למרכז העיר ולשירותים.",
    focus: "בתים ותיקים, מגרשים ודירות",
  },
];

export function neighborhoodFor(property) {
  if (property?.town !== "גדרה") return null;
  const value = letters(property.neighborhood);
  return value ? gederaNeighborhoods.find(n => n.aliases.some(alias => letters(alias) === value)) || null : null;
}

// Filters live listings for a landing page.
export function listingFilter({town, deal, neighborhood}) {
  const hood = neighborhood ? gederaNeighborhoods.find(n => n.slug === neighborhood) : null;
  return property => (!town || property.town === town)
    && (!deal || property.deal === deal)
    && (!hood || neighborhoodFor(property) === hood);
}
