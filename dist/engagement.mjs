import {properties} from "./listings.mjs";

const isLive=id=>/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id);
export const propertyUrl = id => isLive(id)?`/listing/${id}`:`/properties/${id}.html`;
const storageKey = "shefa-saved-properties";
const knownIds = new Set(properties.map(item => item.id));
const known = id=>typeof id==="string"&&(knownIds.has(id)||isLive(id));

export function readSaved() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    return new Set(Array.isArray(stored) ? stored.filter(known) : []);
  } catch {
    return new Set();
  }
}

let saved = readSaved();

export function isSaved(id) {
  return saved.has(id);
}

export function savedCount() {
  return saved.size;
}

export function syncSavedControls() {
  for (const button of document.querySelectorAll("[data-save]")) {
    const active = isSaved(button.dataset.save);
    button.setAttribute("aria-pressed", String(active));
  }
  for (const count of document.querySelectorAll("[data-saved-count]")) count.textContent = saved.size;
}

export function bindEngagement() {
  const status = document.querySelector("#page-status");
  document.addEventListener("click", async event => {
    const save = event.target.closest("[data-save]");
    if (save && known(save.dataset.save)) {
      const id = save.dataset.save;
      if (saved.has(id)) saved.delete(id);
      else saved.add(id);
      let persisted = true;
      try {
        localStorage.setItem(storageKey, JSON.stringify([...saved]));
      } catch {
        persisted = false;
      }
      syncSavedControls();
      status.textContent = isSaved(id) ? (persisted ? "הנכס נשמר בדפדפן." : "הנכס נשמר עד לסגירת הדף.") : "הנכס הוסר מהשמורים.";
      document.dispatchEvent(new Event("shefa:saved"));
    }

    if (event.target.closest("[data-share]")) {
      const field = document.querySelector("#share-address");
      const box = document.querySelector("#share-box");
      field.value = new URL(location.pathname, location.origin).href;
      try {
        await navigator.clipboard.writeText(field.value);
        status.textContent = "הקישור הועתק.";
        document.querySelector("#share-result").textContent = "הקישור הועתק.";
      } catch {
        box.hidden = false;
        field.focus();
        field.select();
      }
    }
  });
  window.addEventListener("storage", event => {
    if (event.key !== storageKey && event.key !== null) return;
    saved = readSaved();
    syncSavedControls();
    document.dispatchEvent(new Event("shefa:saved"));
  });
  syncSavedControls();
}
