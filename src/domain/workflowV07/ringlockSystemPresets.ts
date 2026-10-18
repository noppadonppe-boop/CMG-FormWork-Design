export type RinglockSystemPresetId = 'DOKA_RINGLOCK_2020' | 'CORONET_RINGLOCK_2024' | 'TCB_RINGLOCK' | 'CUSTOM';

export const RINGLOCK_SYSTEM_PRESETS: Record<Exclude<RinglockSystemPresetId, 'CUSTOM'>, {
  label: string;
  sourceUrl: string;
  technicalSourceUrl?: string;
  standardRatings?: Array<{lengthMm: number; safeAxialLoadKN: number; sourcePage: number}>;
  values: Record<string, unknown>;
}> = {
  DOKA_RINGLOCK_2020: {
    label: 'Doka Ringlock · brochure 11/2020 + technical leaflet 02/2023',
    sourceUrl: 'https://www.doka.com/web/products/system-groups/doka-working-scaffold-systems/working-scaffolds/ringlock/Ringlock-Doka-Scaffold-Brochure-201119.pdf',
    technicalSourceUrl: 'https://www.doka.com/web/media/files/DOA_23_Leaflet_Ringlock_4p_en_230223ca_web.pdf',
    values: {
      manufacturer: 'Doka / AT-PAC',
      system: 'Ringlock',
      generation: 'Brochure 11/2020 · technical leaflet 02/2023',
      componentCodes: [
        'Standard: OD 48.3 mm; rosette pitch 500 mm; standard lengths 500–3000 mm in 500 mm increments',
        'Ledger module labels: 390, 730, 1040, 1090, 1400, 1570, 2070, 2570, 3070 mm',
        'Technical leaflet: tube 48.3 x 3.2 mm, S355JOH; verify installed product and batch',
      ],
      braceLayoutRef: 'Brochure 11/2020 p.31: brace reference is exact listed bay at 2000 mm lift; axial brace force only.',
      headBaseDetailRef: 'Brochure 11/2020 pp.7,31: shoring screw-jack / U-head accessory references; project head/base extensions and ratings remain to be entered.',
      connectionRulesRef: 'Brochure 11/2020 p.31 component-force table; use exact selectors and retain source basis text.',
      jointInteractionRuleRef: 'Brochure 11/2020 p.31 reports single-action references only; combined action is not supplied by this table.',
      configurationRatingRef: 'Component reference only: brochure 11/2020 p.31. Not a complete tower/configuration rating.',
      actualProductEvidenceRef: 'Doka Ringlock brochure 11/2020 and technical leaflet 02/2023; project stock identity and batch certificate not established.',
      nationalBasisMappingRef: 'Engineer to reconcile source heading “Maximum Design Forces” and note “permissible loads, γM=1.1, γF=1.5” with project design basis.',
      notes: 'Reference profile only. Do not treat component rows as full tower capacity or apply values to unverified stock. No interpolation or extrapolation.',
    },
  },
  TCB_RINGLOCK: {
    label: 'T.C.B. Home Center · Thai catalogue profile',
    sourceUrl: 'https://www.tcbhome.co.th/ring-lock-scaffolding-system/',
    values: {
      manufacturer: 'T.C.B. Home Center Co., Ltd.',
      system: 'Ring Lock Scaffolding System',
      generation: 'Supplier catalogue page; edition not stated',
      componentCodes: [
        'Standard: OD 48.3 x 3.2 mm; lengths 500, 1000, 1500, 2000, 3000 mm',
        'Ledger: OD 48.3 x 2.75 mm; labels 610, 1219, 1829 mm',
        'Diagonal brace: OD 48.3 x 2.50 mm; bay labels 610, 1219, 1829 mm; lift not stated',
        'Base jack: OD 38 x 4 mm, length 600 mm, plate 150 x 150 x 5 mm',
        'U-head: OD 38 x 4 mm, length 600 mm, plate 118 x 110 x 60 x 5 mm',
      ],
      braceLayoutRef: 'Supplier catalogue lists brace bay labels but does not state the installed lift or brace resistance.',
      headBaseDetailRef: 'Supplier catalogue product dimensions only; actual spindle extension, engagement and assembled resistance are not listed.',
      connectionRulesRef: 'Supplier catalogue page lists parts and nominal dimensions; joint interaction and system analysis are not listed.',
      jointInteractionRuleRef: 'Supplier catalogue page does not publish a joint interaction rule.',
      configurationRatingRef: 'No standard-leg, brace or complete shoring configuration rating is published on the inspected product page; enter the controlled supplier document used for this project.',
      actualProductEvidenceRef: 'https://www.tcbhome.co.th/ring-lock-scaffolding-system/ · verify current product, delivery lot and certificates against site stock.',
      nationalBasisMappingRef: null,
      notes: 'Thai supplier reference profile. The page has plank-load information, but it is not a Ringlock standard/brace/tower rating. Select Custom and enter the actual tested/configuration data when available.',
    },
  },
  CORONET_RINGLOCK_2024: {
    label: 'Coronet Ringlock · Technical Manual 08/2024',
    sourceUrl: 'https://scaffolding.com/wp-content/uploads/2024/09/8-2024-Coronet-Ringlock-Technical-Manual.pdf',
    standardRatings: [
      {lengthMm: 500, safeAxialLoadKN: 65, sourcePage: 17},
      {lengthMm: 1000, safeAxialLoadKN: 55, sourcePage: 17},
      {lengthMm: 1500, safeAxialLoadKN: 42, sourcePage: 17},
      {lengthMm: 2000, safeAxialLoadKN: 28, sourcePage: 17},
    ],
    values: {
      manufacturer: 'Coronet Scaffold',
      system: 'Coronet Ringlock System',
      generation: 'Technical Manual 08/2024',
      componentCodes: [
        'Standard: OD 48.3 x 3.2 mm; rosette pitch 500 mm; steel grade S235 or S355; hot-dip galvanized',
        'Ledger: OD 48.3 x 3.2 mm; standard modules include 420, 730, 1090, 1400, 1570, 2070, 2570, 3070 mm',
        'Diagonal brace: OD 48.3 x 2.5 mm; steel grade S235 or S355; exact brace configuration must match manual',
      ],
      braceLayoutRef: 'Manual 08/2024 pp.19–20 lists brace dimensions and tabulated component loads; verify exact row, lift, bay and load type against the source before project use.',
      headBaseDetailRef: 'Manual 08/2024 pp.28–29 shows base-jack dimensions and proof/ultimate tests; no project-specific assembled base capacity is set by this profile.',
      connectionRulesRef: 'Manual 08/2024 pp.14–17 includes component tests and Standard safe axial loads. The tables are not a complete shoring tower rating.',
      jointInteractionRuleRef: 'Manual 08/2024 pp.14–15 reports rosette test results; combined-action interaction and project rotational stiffness remain unestablished.',
      configurationRatingRef: 'Component reference only: Manual 08/2024 p.17 Safe Axial Load by Standard length. The p.15 three-tier test is one stated test setup, not a general project tower rating.',
      actualProductEvidenceRef: 'Coronet Ringlock Technical Manual 08/2024; actual site stock identity, grade, dimensions and batch certificates must be verified.',
      nationalBasisMappingRef: 'Engineer to confirm applicability of manufacturer Safe Axial Load table to the project design basis and actual shoring configuration.',
      notes: 'Reference profile only. Standard loads are exact listed component references, not complete tower capacities. Do not interpolate or extrapolate; head/base, bracing, stability, eccentricity and support conditions still require project checks.',
    },
  },
};

export function applyRinglockSystemPreset(inputs: Record<string, unknown>, presetId: RinglockSystemPresetId | null) {
  if (presetId === null) return {...inputs, systemPresetId: null};
  if (presetId === 'CUSTOM') return {...inputs, systemPresetId: 'CUSTOM'};
  const preset = RINGLOCK_SYSTEM_PRESETS[presetId];
  const resetConfiguration = {
    ...inputs,
    bayX_mm: null, bayY_mm: null, liftPattern_mm: [], totalInstalledHeight_mm: null,
    headExtension_mm: null, headEngagement_mm: null, baseExtension_mm: null, baseEngagement_mm: null,
    jointStiffnessRef: null, globalAnalysisRef: null, secondOrderAndImperfectionBasisRef: null,
    windAndLateralCasesRef: null, ratingBasis: null, loadPatternsCovered: [], perNodeRating_kN: [],
  };
  return {...resetConfiguration, ...structuredClone(preset.values), systemPresetId: presetId};
}
