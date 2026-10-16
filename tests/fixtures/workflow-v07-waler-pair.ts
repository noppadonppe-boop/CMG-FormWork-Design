import {emptyWalerPair, type IndependentWalerPair} from '../../src/domain/workflowV07/walerPair';
import {sideDefinition} from './workflow-v07-side';

export function explicitRailPair(): IndependentWalerPair {
  const p = emptyWalerPair(); p.rail1Share = .25; p.sharingEvidenceRef = 'SYNTHETIC prescribed split; not verified contact';
  p.clearGapMm = 20; p.separationAxis = 'FACE_VERTICAL'; p.geometryEvidenceRef = 'SYNTHETIC gap geometry';
  p.rails = p.rails.map((r, i) => ({...r, family: 'RHS', E_MPa: i ? 100000 : 200000, bendingI_mm4: i ? 4e6 : 1e6, orientationDeg: i ? 90 : 0,
    sectionRef: 'SYNTHETIC independent section', materialRef: 'SYNTHETIC elastic property', axisEvidenceRef: 'SYNTHETIC selected bending axis',
    continuity: 'CONTINUOUS', spliceEvidenceRef: 'SYNTHETIC no splice through full member'})) as IndependentWalerPair['rails'];
  p.supportFittings = ['S1', 'S2'].map(supportId => ({supportId, plateRef: 'SYNTHETIC plate', plateWidthAcrossRailsMm: 120, plateThicknessMm: 10,
    clearHoleDiameterMm: 24, requiredRadialClearanceMm: 1, contactEvidenceRef: 'SYNTHETIC envelope only'}));
  return p;
}
export function explicitSideDefinition() {
  const d = sideDefinition();
  for (const f of d.faces) {f.rail = {E_MPa: null, I_mm4: null, evidenceRef: ''}; f.heavierRailShare = null; f.sharingEvidence = null;
    for (const w of f.walers) w.pair = explicitRailPair();}
  return d;
}
