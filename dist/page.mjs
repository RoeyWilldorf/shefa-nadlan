import {properties} from "./listings.mjs";
import {bindEngagement} from "./engagement.mjs";
import {initDialogs} from "./dialogs.mjs";

const live = document.querySelector("#live-property");
if (live) properties.push(JSON.parse(live.textContent));

bindEngagement();
initDialogs();
