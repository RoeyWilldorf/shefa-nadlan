import assert from "node:assert/strict";
import test from "node:test";
import {findTown,findNeighborhood,summarize,marketSection} from "../dist/market.mjs";

const index={"2550":{SETL_NAME:"גדרה"},"5000":{SETL_NAME:"תל אביב -יפו"},"6200":{SETL_NAME:"בת ים"}};
const g=(key,price,year=2026,month=3)=>({[key]:price,countryPrice:2920600,year,month});
const town={settlementID:"2550",settlementName:"גדרה",version:"20-08-2026",
  otherNeighborhoods:[{title:"אמירי גן",id:1},{title:"גדרה הצעירה",id:2}],
  trends:{indexes:{yield:2.33},rooms:[
    {numRooms:5,hasDeals:1,graphData:[{settlementPrice:null,countryPrice:1,year:2026,month:6},g("settlementPrice",3137000)],summary:{priceDifferencePercentage:"-2.87"}},
    {numRooms:"all",hasDeals:1,graphData:[g("settlementPrice",3110700)],summary:{priceDifferencePercentage:"-2.72"}}]}};

test("matches town and neighborhood names",()=>{
  assert.equal(findTown(index,"גדרה"),"2550");
  assert.equal(findTown(index,"תל אביב"),"5000");
  assert.equal(findTown(index,"בת-ים"),"6200");
  assert.equal(findNeighborhood(town.otherNeighborhoods,"אמירי גן").id,1);
  assert.equal(findNeighborhood(town.otherNeighborhoods,"גדרה מזרח (גולדה)"),null);
});

test("uses the room-specific median for apartments and the newest quarter with data",()=>{
  const m=summarize(town,null,{type:"דירה",rooms:5,deal:"sale"});
  assert.equal(m.city.price,3137000);assert.equal(m.city.when,"רבעון 1 2026");assert.equal(m.label,"5 חדרים");assert.equal(m.change,-2.87);
  const html=marketSection(m);
  assert.match(html,/3\.14 מיליון ₪/);assert.match(html,/nadlan\.gov\.il\/\?view=settlement&amp;id=2550&amp;page=deals/);
});

test("houses use the overall figure, not the apartment one",()=>{
  const m=summarize(town,null,{type:"בית פרטי",rooms:5,deal:"sale"});
  assert.equal(m.label,"כל העסקאות");assert.equal(m.city.price,3110700);
});

test("no data means no box",()=>{
  assert.equal(marketSection(null),"");
  assert.equal(summarize({trends:{rooms:[]}},null,{type:"דירה",rooms:4,deal:"sale"}),null);
});
