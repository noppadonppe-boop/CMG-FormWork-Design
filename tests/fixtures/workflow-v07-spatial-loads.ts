import {emptyMemberAction, emptySpatialLoading, emptySurfaceRegion, type SpatialLoading, type SurfaceRegion} from '../../src/domain/workflowV07/spatialLoads';
import {regenerateDraftLayouts} from '../../src/domain/workflowV07/model';
import {coverageModel} from './workflow-v07-coverage';
import {plywoodFixture} from './workflow-v07-plywood';
export const region = (id: string, patch: Partial<SurfaceRegion> = {}): SurfaceRegion => ({...emptySurfaceRegion(id), kind: 'CONCRETE', x0: 0, x1: 1200, y0: 0, y1: 1500, placedDepthMm: 150, ownershipId: `SYN-${id}`, evidenceRef: 'SYNTHETIC coordinates, not project placement evidence', ...patch});
export function spatialDefinition(): SpatialLoading {
  return {...emptySpatialLoading(), surfaceScope: 'COMPLETE_FOR_DECLARED_STAGE', evidenceRef: 'SYNTHETIC independent placement', omittedAreasEvidenceRef: 'SYNTHETIC unplaced right half concrete; DL/LL cover full deck',
    regions: [region('C'), region('D', {kind: 'ADDITIONAL_DL', x1: 2400, placedDepthMm: null}), region('L', {kind: 'CONSTRUCTION_LL', x1: 2400, placedDepthMm: null})],
    memberActions: [{...emptyMemberAction('POINT'), kind: 'PLACEMENT', targetMemberId: 'JOIST-3', shape: 'POINT', startMm: 300, forceN: 1000, ownershipId: 'SYN-DIRECT-P', evidenceRef: 'SYNTHETIC direct bearing, not a plywood point load', separateFromSurfaceAndMemberWeight: true, applicationLine: 'MEMBER_ANALYSIS_LINE'},
      {...emptyMemberAction('LINE'), kind: 'OTHER', targetMemberId: 'B2', shape: 'LINE', startMm: 600, endMm: 1800, lineLoadNPerMm: 1, ownershipId: 'SYN-DIRECT-L', evidenceRef: 'SYNTHETIC actual line on bearer', separateFromSurfaceAndMemberWeight: true, applicationLine: 'MEMBER_ANALYSIS_LINE'}]};
}
export function spatialApplied() {const model = coverageModel(); return regenerateDraftLayouts(model, {designBasisRef: 'SYNTHETIC no engineering release', soffitLayout: {...model.soffitLayout!, plywood: plywoodFixture(), loading: spatialDefinition()}});}
