/**
 * Facts about the (fictional) business that the code itself needs, such as
 * phone numbers inside canned safety and fallback messages.
 *
 * WHY here and not only in data/: canned messages must work even when
 * retrieval or the model fails, so they cannot depend on either. Keep these in
 * sync with data/hours.md and data/emergency-policy.md; a unit test checks.
 */
export const BUSINESS = {
  name: "Timpanogos Heating & Plumbing",
  coreArea: "Provo, Orem, and Lehi, Utah",
  officePhone: "(801) 555-0142",
  emergencyPhone: "(801) 555-0199",
  officeHours: "Monday-Friday 7 a.m.-6 p.m., Saturday 8 a.m.-2 p.m.",
} as const;
