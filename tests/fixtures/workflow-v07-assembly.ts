import {captureRinglockAssembly, stampRinglockAssembly, type InstalledJack} from '../../src/domain/workflowV07/ringlockAssembly';
import {frameGeometryFromAssembly, stampFrameLayout} from '../../src/domain/workflowV07/frameWorkflow';
import {regenerateDraftLayouts} from '../../src/domain/workflowV07/model';
import {coverageModel} from './workflow-v07-coverage';

// Synthetic measured-datum/linear mechanics fixtures. No values are real component ratings.
export function unevenBaseModel() {
  const model = coverageModel(), layout = structuredClone(model.soffitLayout!);
  layout.baseElevationMm = null;
  layout.baseDatumsByHead = model.ringlock!.legs.map((l, i) => ({headNodeId: l.headNodeId, localXMm: l.xMm, localYMm: l.yMm, elevationMm: i * 20, evidenceRef: 'SYNTHETIC per-head ground datum'}));
  return regenerateDraftLayouts(model, {soffitLayout: layout});
}
const syntheticJack = (installedHeightMm: number): InstalledJack => ({productRef: 'SYNTHETIC not stock', nominalLengthMm: 600, installedHeightMm,
  extensionMm: 100, engagementMm: 200, maxExtensionMm: 200, minEngagementMm: 100, geometryEvidenceRef: 'SYNTHETIC nonoverlapping installed datums', limitEvidenceRef: 'SYNTHETIC comparison limits, not certified'});
export function assemblyFixture() {
  const model = unevenBaseModel(), definition = captureRinglockAssembly(model);
  definition.evidenceRef = 'SYNTHETIC measured stack, not installed-system approval'; definition.headDatum = 'U_HEAD_BEARING_SURFACE'; definition.headDatumEvidenceRef = 'SYNTHETIC reduction plane as bearing-surface hypothesis';
  for (const l of definition.legs) {
    l.soffitElevationMm = 3187; l.toleranceMm = 0; l.soleBoard = {thicknessMm: 50, evidenceRef: 'SYNTHETIC board top/ground datum'};
    l.baseJack = syntheticJack(150); l.headJack = syntheticJack(300 - l.groundElevationMm);
    l.standards = [{id: 'S1', productRef: 'SYNTHETIC first tube', nominalLengthMm: 1000, installedRiseMm: 1000, datumEvidenceRef: 'SYNTHETIC bottom-to-top ends'},
      {id: 'S2', productRef: 'SYNTHETIC second tube', nominalLengthMm: 1500, installedRiseMm: 1500, datumEvidenceRef: 'SYNTHETIC bottom-to-top ends'}];
    l.spigots = [{id: 'P1', lowerStandardId: 'S1', upperStandardId: 'S2', productRef: 'SYNTHETIC splice', gapMm: 0, overallLengthMm: 200, lowerInsertionMm: 100, upperInsertionMm: 100, evidenceRef: 'SYNTHETIC overlap recorded, not added to height'}];
    l.upperStack = {bearerDepthMm: 100, joistDepthMm: 75, plywoodThicknessMm: 12, evidenceRef: 'SYNTHETIC nonoverlapping layer depths'};
  }
  return {model, definition};
}
export function assemblyApplied() {
  const {model, definition} = assemblyFixture(); return regenerateDraftLayouts(model, {ringlockAssembly: stampRinglockAssembly(model, definition)});
}
export function assemblyFrameApplied() {
  const model = assemblyApplied(), frame = frameGeometryFromAssembly(model);
  frame.actionBasis = 'SERVICE'; frame.acknowledgeLinearScope = true; frame.assumptionEvidenceRef = 'SYNTHETIC independent assembled columns; no stock properties';
  for (const n of frame.nodes) n.boundary = Array.from({length: 6}, () => ({kind: n.role === 'BASE' ? 'FIXED' as const : 'FREE' as const}));
  for (const e of frame.elements) {
    e.evidenceRef = 'SYNTHETIC stiffness, not actual jack/thread/spigot data'; e.localY = [0, 1, 0];
    if (e.kind === 'JOINT_SPRING') {e.localX = [0, 0, 1]; e.stiffness = [1e6, 1e6, 1e6, 1e8, 1e8, 1e8];}
    else {e.E_MPa = 200000; e.G_MPa = 80000; e.A_mm2 = 2000; e.Iy_mm4 = 1e6; e.Iz_mm4 = 1e6; e.J_mm4 = 2e6;}
  }
  return regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, frame)});
}
