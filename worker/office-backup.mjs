export const officeBackupTables=[
  "office_properties","property_prices","office_media","office_contacts","office_leads","office_work","office_marketing",
  "office_audit","office_comparables","office_visit_settings","office_visit_forms","office_prospects","office_prospect_sources",
  "office_lead_events","office_property_changes","office_deals","office_document_refs",
];

export async function officeSnapshot(db,at){
  const tables=await db.batch(officeBackupTables.map(table=>db.prepare("SELECT * FROM "+table)));
  return {version:1,createdAt:at,tables:Object.fromEntries(officeBackupTables.map((name,i)=>[name,tables[i].results]))};
}
