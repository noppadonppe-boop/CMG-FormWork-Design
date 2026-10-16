/** Proposed handoff types, not verified imports from preview26. */
export interface NoConstructionRelease { confirmed: false; constructionRelease: 'NO_GO'; }
export interface AnalysisContext {
  projectId: string; revisionId: string; designSnapshotHash: string;
  activeStageId: string; capturedStageId: string; loadCaseId: string;
}
export type TieCheckSlot = 'INNER_UNIT' | 'THREAD_END_LEFT' | 'THREAD_END_RIGHT'
  | 'OUTER_LEFT' | 'OUTER_RIGHT' | 'END_CONNECTION_LEFT' | 'END_CONNECTION_RIGHT'
  | 'NUT_LEFT' | 'NUT_RIGHT' | 'PLATE_LEFT' | 'PLATE_RIGHT'
  | 'WALER_LOCAL_LEFT' | 'WALER_LOCAL_RIGHT';
export type DemandBasis = 'WORKING' | 'FACTORED_DESIGN';
export type ResistanceBasis = 'ALLOWABLE' | 'DESIGN_RESISTANCE';
export interface TieCheckInput {
  slot: TieCheckSlot; product_id: string | null; reference_record_id: string | null;
  capacity_kN: number | null; capacity_basis: ResistanceBasis | null;
  capacity_scope: 'EQUIVALENT_AXIAL_TIE_LIMIT'; evidence_ref: string | null;
  actual_engagement_mm: number | null; required_engagement_mm: number | null;
}
export interface TieDraft extends NoConstructionRelease {
  schema_version: 'closure-v1'; kind: 'TIE_ASSEMBLY_DRAFT';
  origin: 'SYNTHETIC_EXAMPLE' | 'USER_DRAFT'; context: AnalysisContext;
  template_id: 'SEGMENTED_INNER_B' | 'SEGMENTED_INNER_C' | 'SEGMENTED_INNER_BC' | 'SEGMENTED_INNER_D';
  demand: {axial_kN: number | null; basis: DemandBasis | null;
    reaction_ref: string | null; symmetry_and_alignment_evidence_ref: string | null};
  checks: TieCheckInput[]; actual_assembly_compatibility_evidence_ref: string | null;
}
export interface SignedTransfer {
  context: AnalysisContext; interfaceId: string; datumId: string; coordinateFrameId: string;
  force_kN: [number, number, number]; moment_kNm: [number, number, number];
}
export interface EvidenceReview {
  engineerId: string | null; evidenceRef: string | null;
  acceptedSnapshotHash: string | null; acceptedStageId: string | null;
  acceptedLoadCaseId: string | null; trustedVerificationStatus: 'NOT_VERIFIED';
}
export interface ProjectInputTemplate extends NoConstructionRelease {
  schema_version: 'closure-v1'; form_type: string;
  context: {[K in keyof AnalysisContext]: string | null};
  inputs: Record<string, unknown>; review: EvidenceReview;
}
export interface ClosureStatus {
  packaging: 'COMPLETE' | 'INCOMPLETE'; appIntegration: 'NOT_TESTED' | 'VERIFIED' | 'BLOCKED';
  fullTestSuite: 'NOT_RERUN' | 'GREEN' | 'RED' | 'KNOWN_BLOCKED_NOT_GREEN';
  projectEngineering: 'INCOMPLETE' | 'AWAITING_AUTHORIZED_REVIEW';
  constructionRelease: 'NO_GO';
}
