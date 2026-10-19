import ringlock from '../reference/workflow-v07/closure/templates/ringlock_configuration.json' with {type:'json'};
import slab from '../reference/workflow-v07/closure/templates/support_slab.json' with {type:'json'};
import soil from '../reference/workflow-v07/closure/templates/support_soil.json' with {type:'json'};
import service from '../reference/workflow-v07/closure/templates/serviceability.json' with {type:'json'};
import stage from '../reference/workflow-v07/closure/templates/stage_release.json' with {type:'json'};
import {validateClosureInputTemplate, type ClosureProjectInputTemplate} from './workflowV07/closurePack.js';
import type {WorkflowModel} from './workflowV07/model.js';

/** Completed editable evidence worksheets. Example reviewer/snapshot entries
 * explicitly say UNSIGNED; trustedVerificationStatus remains NOT_VERIFIED. */
export function exampleEvidenceWorksheets(m:WorkflowModel,projectId='PROJECT-EXAMPLE') {
  const r=m.ringlock,s=m.soffitLayout??m.sideLayout!,basis='EX-DB-01 (MOCK)',L=Math.max(...m.vertices.map(p=>p.x))-Math.min(...m.vertices.map(p=>p.x));
  const values:Record<string,Record<string,unknown>>={
    ringlock_configuration:{systemPresetId:'CUSTOM',manufacturer:'MOCK workshop',system:'EX-CUSTOM',generation:'EX-2026',componentCodes:['EX-CHS48.3x3.2','EX-JACK250','EX-HEAD150'],
      bayX_mm:r?.bayXMm??2000,bayY_mm:r?.bayYMm??2000,liftPattern_mm:r?.liftHeightsMm??[2000],totalInstalledHeight_mm:r?.totalHeightMm??3000,
      headExtension_mm:150,headEngagement_mm:100,baseExtension_mm:150,baseEngagement_mm:100,
      braceLayoutRef:'EX-BRACE-X-Y: diagonal restraint assumed at each bay',headBaseDetailRef:'EX-JACK: max extension150 / min engagement100 mm',
      connectionRulesRef:'EX joints: rigid continuity',jointInteractionRuleRef:'EX N/30kN + M/0.5kNm <= 1',jointStiffnessRef:'EX ideal rigid beam-column; no spring element',
      globalAnalysisRef:'Current case elastic frame results',secondOrderAndImperfectionBasisRef:'EX-PDELTA: initial sway H/500',windAndLateralCasesRef:'EX sheltered pour; wind excluded from active service case',
      configurationRatingRef:'EX-CUSTOM-30KN: assumed mock configuration',ratingBasis:'ALLOWABLE / SERVICE — MOCK',loadPatternsCovered:['EX-SERVICE-01'],
      perNodeRating_kN:r?.legs.map(l=>({node:l.headNodeId,allowable_kN:30}))??[{node:'EX-ALTERNATIVE-LEG',allowable_kN:30}],
      actualProductEvidenceRef:'EX mock product schedule — no commercial product claim',nationalBasisMappingRef:'EX training worksheet; no statutory approval',
      notes:r?'EX-DB-01: complete custom teaching configuration':'N/A to active side-only system; completed alternative Ringlock worksheet for training'},
    support_slab:{interfaceId:'EX-SLAB-CONTACT',supportingSlabId:'EX-RC-SLAB-200',asBuiltDrawingRef:'EX-S-01: synthetic existing RC slab',thickness_mm:200,effectiveDepthX_mm:160,effectiveDepthY_mm:148,
      reinforcementRef:'EX DB12@150 each way, top and bottom',openingsEdgesAndSupportsRef:'EX 3m bay; no openings; 300mm minimum edge distance',actualContactAreaRef:'EX 150x150 mm base plate',
      concreteMixId:'EX-C24',pourTimestamp:'2026-09-21T08:00:00+07:00',loadTimestamp:'2026-10-19T08:00:00+07:00',inSituStrength_MPa:24,
      strengthEvidenceRef:'EX assumed 28-day cylinder strength24MPa',maturityCalibrationRef:'N/A: example specifies 28-day strength directly',temperatureHistoryRef:'EX assumed curing 28C for28d',
      youngSlabStiffnessRef:'EX Ec=23025MPa, mature existing slab',crackingCreepBasisRef:'EX effective I=0.35Ig; creep multiplier2.0',punchingCriticalPerimeterRef:'EX d/2 from150mm plate; verify per support',
      punchingRulePackRef:'EX-PUNCH: classroom worksheet, no approved capacity',momentTransferAndGroupPunchingRef:'EX separated base contacts; group effects to be examined',
      flexureOneWayShearBearingChecksRef:'EX local bearing limit3MPa; flexure/shear in supporting-slab worksheet',multistoreyStageAnalysisRef:'N/A: single supporting floor example',
      reshoringPlanRef:'EX retain shores until next declared stage',notes:`${basis}; all slab data assumed for data-entry demonstration`},
    support_soil:{interfaceId:'EX-ALTERNATIVE-SOIL',basePlateRef:'EX 150x150x6mm',soleBoardRef:'EX timber spreader1000x1000x50mm',actualFootprint_Bx_mm:1000,actualFootprint_Ly_mm:1000,
      contactConditionEvidenceRef:'EX level full contact',geotechnicalReportRef:'EX-GEO-01: assumed teaching ground profile',soilLayerAndGroundwaterRef:'EX compacted granular fill; groundwater2m below',
      grossOrNetBearingBasis:'GROSS',allowableBearingPressure_kPa:100,bearingDesignResistance_kN:100,loadResistanceBasis:'EX service allowable100kPa x1m2',subgradeModulus_kN_m3:20000,
      subgradeCalibrationRef:'EX independent assumed k; not derived from bearing limit',settlementPredictionRef:'EX linear Winkler s=q/k',maxTotalSettlement_mm:10,maxDifferentialSettlement_mm:5,differentialGaugeLength_mm:2000,
      settlementLimitEvidenceRef:basis,drainageAndErosionPlanRef:'EX perimeter drainage; no standing water',slidingRestraintRef:'EX positive horizontal restraint; no friction credit',notes:'Completed alternative soil worksheet; not applied to active existing-slab supports'},
    serviceability:{policyId:'EX-SLS-01',memberRole:m.elementType,governingSourceRef:basis,loadSetRef:s.loadCaseId,relativeDeflectionDenominator:360,absoluteDeflectionLimit_mm:3,
      maxTieOpening_mm:2,maxTotalSettlement_mm:3,maxDifferentialSettlement_mm:2,gaugeLength_mm:L,combinedDisplacementModelRef:'EX separate member deflection + support displacement; no hidden cancellation',
      creepMoistureReuseBasisRef:'EX plywood Fb8MPa Fv0.6MPa; dry short-term teaching assumptions',notes:'Independent mock criteria, not automatic engineering acceptance'},
    stage_release:{stageRecordId:s.stageId,requestedAction:'EXAMPLE POUR — training request only',capturedAnalysisRef:'EX current deterministic case preview',currentAnalysisRef:m.revisionId,
      constructionSequenceRef:'EX assemble > inspect > pour > cure > review stripping',loadTransferRef:'EX plywood > joist/stud > bearer/waler > support',
      strengthAndSupportEvidenceRefs:['EX-C24','EX-CUSTOM-30KN','EX-M16-30KN'],serviceabilityEvidenceRef:'EX-SLS-01',engineerRulePackRefs:['EX-DB-01'],
      siteInspectionRef:'EX-INSPECTION-01 — illustrative unsigned record',manualAcceptanceRef:'EX-REVIEW — UNSIGNED, training only',notes:'Mock request populated; no actual release has been signed'},
  };
  return [ringlock,slab,soil,service,stage].map(raw=>{
    const baseline=raw as ClosureProjectInputTemplate,existing=m.closureInputs?.find(e=>e.form_type===baseline.form_type);
    const defaults=values[baseline.form_type],inputs={...defaults};
    if(existing)for(const [k,v] of Object.entries(existing.inputs))if(v!=null&&v!==''&&(!Array.isArray(v)||v.length))inputs[k]=v;
    return validateClosureInputTemplate({...baseline,inputs,
      context:{projectId,revisionId:m.revisionId,designSnapshotHash:'EXAMPLE-NOT-A-RELEASE-SNAPSHOT',activeStageId:s.stageId,capturedStageId:s.stageId,loadCaseId:s.loadCaseId},
      review:{engineerId:'EXAMPLE-ENGINEER (fictional)',evidenceRef:'EX-REVIEW (UNSIGNED)',acceptedSnapshotHash:'EXAMPLE-NOT-APPROVED',acceptedStageId:'EXAMPLE-NOT-APPROVED',acceptedLoadCaseId:'EXAMPLE-NOT-APPROVED',trustedVerificationStatus:'NOT_VERIFIED'},
    },baseline);
  });
}
