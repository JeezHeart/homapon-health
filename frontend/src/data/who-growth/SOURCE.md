# WHO Child Growth Standards reference data

Source: https://github.com/WorldHealthOrganization/anthro
Snapshot: b776d8a12b1c97369c748b561159fd2ec4f4db58
Retrieved: 2026-11-11. Original tables: data-raw/growthstandards/{weianthro,lenanthro,wflanthro,wfhanthro}.txt.
reference.json retains the five numeric columns sex, age-in-days or length/height-in-cm, L, M, S. Sex: 1 male, 2 female.
Data provided by the World Health Organization; upstream GPL-3 license is included in LICENSE.md.
Local calculations follow the documented LMS method, tail adjustment for weight indicators, and 0.7 cm measurement-position adjustment.
Scope: under 60 months (age in days / 30.4375), exact dated measurements. No imputation from legacy weight fields.
See https://www.who.int/tools/child-growth-standards and https://worldhealthorganization.github.io/anthro/.
