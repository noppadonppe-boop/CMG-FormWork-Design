import {regenerateDraftLayouts} from '../../src/domain/workflowV07/model';
import {emptyHeadBearing} from '../../src/domain/workflowV07/headBearing';
import {stampRinglockAssembly} from '../../src/domain/workflowV07/ringlockAssembly';
import {assemblyFrameApplied} from './workflow-v07-assembly';

// SYNTHETIC geometry/contact hypotheses only. No actual head capacity or product certification.
export function headBearingFixture() {
  let model = assemblyFrameApplied(); const soffit = structuredClone(model.soffitLayout!);
  // Real bearing length at an end needs a real member extension, not an imaginary footprint.
  soffit.bearerStartXMm = -100; soffit.bearerEndXMm = 2500;
  model = regenerateDraftLayouts(model, {soffitLayout: soffit}, {allowIncomplete: true});
  const definition = structuredClone(model.ringlockAssembly!);
  for (const l of definition.legs) l.headBearing = {...emptyHeadBearing(), productRef: l.headJack.productRef, geometryEvidenceRef: 'SYNTHETIC measured head drawing',
    layout: 'SINGLE_FLAT_BEARER', seatCenterMm: [l.xMm, l.yMm, l.headBearingElevationMm], seatLocalX: [1, 0], plateLengthMm: 200, plateWidthMm: 160, plateThicknessMm: 10,
    cavityOffsetYMm: 0, insideClearWidthMm: 140, minimumSideClearanceMm: 10, bearerWidthMm: 100, bearerDepthMm: 100, bearerCenterOffsetYMm: 0, bearerGeometryEvidenceRef: 'SYNTHETIC flat bearer with actual ends and explicitly concentric body/analysis line',
    contactCenterMm: [l.xMm, l.yMm, l.headBearingElevationMm], contactLengthMm: 100, contactWidthMm: 100,
    sideBlocking: 'BOTH_SIDES', sideBlockingEvidenceRef: 'SYNTHETIC retention, no strength claim', pressureModel: 'RIGID_HORIZONTAL_RECTANGLE_AFFINE_COMPRESSION_ONLY', pressureModelEvidenceRef: 'SYNTHETIC conditional statics'};
  return {model, definition};
}
export function headBearingApplied() {const {model, definition} = headBearingFixture(); return regenerateDraftLayouts(model, {ringlockAssembly: stampRinglockAssembly(model, definition)}, {allowIncomplete: true});}
