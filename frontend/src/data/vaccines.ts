/**
 * Vaccine reference transcribed from the paper immunization table
 * (prd.md section 8). Dose counts/timing are prototype data only —
 * the health center must confirm the official schedule before
 * clinical use.
 */

export interface VaccineDose {
  doseNumber: number;
  timingNote: string;
}

export interface Vaccine {
  id: string;
  name: string;
  shortName: string;
  doses: VaccineDose[];
}

export const VACCINES: Vaccine[] = [
  {
    id: 'bcg',
    name: 'BCG',
    shortName: 'BCG',
    doses: [{ doseNumber: 1, timingNote: 'at birth' }],
  },
  {
    id: 'hepb',
    name: 'Hepatitis B',
    shortName: 'Hep B',
    doses: [{ doseNumber: 1, timingNote: 'at birth' }],
  },
  {
    id: 'penta',
    name: 'Pentavalent vaccine (DPT-Hep B-Hib)',
    shortName: 'Pentavalent',
    doses: [
      { doseNumber: 1, timingNote: '1 1/2 months' },
      { doseNumber: 2, timingNote: '2 1/2 months' },
      { doseNumber: 3, timingNote: '3 1/2 months' },
    ],
  },
  {
    id: 'opv',
    name: 'Oral polio vaccine (OPV)',
    shortName: 'OPV',
    doses: [
      { doseNumber: 1, timingNote: '1 1/2 months' },
      { doseNumber: 2, timingNote: '2 1/2 months' },
      { doseNumber: 3, timingNote: '3 1/2 months' },
    ],
  },
  {
    id: 'ipv',
    name: 'Inactivated polio vaccine (IPV)',
    shortName: 'IPV',
    doses: [{ doseNumber: 1, timingNote: '3 1/2 months' }],
  },
  {
    id: 'pcv',
    name: 'Pneumococcal conjugate vaccine (PCV)',
    shortName: 'PCV',
    doses: [
      { doseNumber: 1, timingNote: '1 1/2 months' },
      { doseNumber: 2, timingNote: '2 1/2 months' },
      { doseNumber: 3, timingNote: '3 1/2 months' },
    ],
  },
  {
    id: 'mmr',
    name: 'Measles, mumps, rubella (MMR)',
    shortName: 'MMR',
    doses: [
      { doseNumber: 1, timingNote: '9 months' },
      { doseNumber: 2, timingNote: '1 year' },
    ],
  },
];

/** Total required doses across the reference schedule (1+1+3+3+1+3+2). */
export const REQUIRED_DOSES = VACCINES.reduce(
  (sum, v) => sum + v.doses.length,
  0,
);

export function vaccineById(id: string): Vaccine | undefined {
  return VACCINES.find((v) => v.id === id);
}
