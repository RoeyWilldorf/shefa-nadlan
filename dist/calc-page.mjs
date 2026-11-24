// Standalone calculator pages (/calculators/*.html): the same calculators as the homepage
// dialogs, rendered inline in the page.
import {bindCalculator, calculatorMarkup} from "./tool-views.mjs";
import {bindYield, yieldMarkup} from "./yield.mjs";
import {bindBetterment, bettermentMarkup} from "./betterment.mjs";

const root = document.getElementById("calc-root");
if (root) {
  const kind = root.dataset.kind;
  root.innerHTML = kind === "yield" ? yieldMarkup() : kind === "betterment" ? bettermentMarkup() : calculatorMarkup(kind, undefined, "");
  root.querySelector("#dialog-title")?.remove(); // the page has its own heading
  if (kind === "yield") bindYield(root);
  else if (kind === "betterment") bindBetterment(root);
  else bindCalculator(root, kind);
  root.removeAttribute("aria-busy");
}
