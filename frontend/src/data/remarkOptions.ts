/**
 * Common remarks presets for immunization entries (see prd.md section 8).
 * Short, factual visit notes only — no diagnosis or sensitive details.
 * Free-typed remarks are always allowed via the "Other" choice.
 */
export const REMARK_OPTIONS: string[] = [
  'No reaction observed',
  'Mild fever after dose — advised follow-up per protocol',
  'Swelling at site — advised cold compress',
  'Deferred — child was ill',
  'Absent during visit — rescheduled',
  'Vaccine out of stock — rescheduled',
  'Catch-up dose',
  'Late dose — per catch-up schedule',
  'Referred to RHU for assessment',
  'Parent/guardian consented',
  'Record transferred from another purok',
  'Corrected entry — fixed encoding error',
];

export const REMARK_OTHER = 'Other — type below';
