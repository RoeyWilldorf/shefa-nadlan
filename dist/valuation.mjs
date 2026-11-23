// Valuation page: open the valuation form, pre-filling the town from ?town=
const button=document.querySelector("#valuation-start");
const town=new URLSearchParams(location.search).get("town");
if (button&&town) button.dataset.prefillTown=town;
