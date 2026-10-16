import {describe, expect, it} from 'vitest';
import {defaults} from '../src/domain';
import {fromLegacy, parseWorkflowModel, previewWorkflow, reviseDraft} from '../src/domain/workflowV07/model';
import {RINGLOCK_PLAN_PRESETS, selectRinglockPlan} from '../src/domain/workflowV07/ringlockPlan';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';

describe('Ringlock plan selection in the engineering draft', () => {
  it('uses the requested default without inventing actual heads, supplier ratings or height', () => {
    const ringlock = selectRinglockPlan(null);
    expect(ringlock).toMatchObject({bayXMm: 1200, bayYMm: 1500, planLayout: {bearerAxis: 'X', headAlignment: 'STANDARD_AXIS'},
      manufacturer: null, totalHeightMm: null, ratingId: null, legs: []});
    const model = reviseDraft(fromLegacy(defaults, 'S1'), {elementType: 'SLAB', ringlock});
    const preview = previewWorkflow(model);
    expect(preview.status).toBe('BLOCKED');
    expect(preview.blockers).toContain('MISSING_LEGS');
    expect(preview.constructionEligible).toBe(false);
  });

  it('invalidates actual heads and configuration-specific data when module dimensions change', () => {
    const previous = {...selectRinglockPlan(null), configurationId: 'OLD', ratingId: 'OLD-RATING', braceXRef: 'OLD-X', braceYRef: 'OLD-Y',
      legs: [{id: 'L1', headNodeId: 'H1', xMm: 1200, yMm: 1500, headElevationMm: 3000, baseElevationMm: 0}]};
    const next = selectRinglockPlan(previous, '900x1200');
    expect(next).toMatchObject({bayXMm: 900, bayYMm: 1200, configurationId: null, ratingId: null, braceXRef: null, braceYRef: null, legs: []});
    expect(previous.legs).toHaveLength(1);
    expect(selectRinglockPlan(previous)).toEqual(previous);
    expect(() => selectRinglockPlan(null, '1200x1219')).toThrow(/Unknown/);
  });

  it('persists each preset in the snapshot and makes earlier drawings/reports stale after an edit', async () => {
    const original = reviseDraft(fromLegacy(defaults, 'S1'), {elementType: 'SLAB', ringlock: selectRinglockPlan(null)});
    const snapshot = await freezeDesign(original);
    for (const preset of RINGLOCK_PLAN_PRESETS) {
      const edited = reviseDraft(original, {ringlock: selectRinglockPlan(original.ringlock, preset.id), ringlockRating: null});
      const frozen = await freezeDesign(edited), view = await documentView(frozen, edited);
      expect(view.report.model.ringlock).toMatchObject({bayXMm: preset.xMm, bayYMm: preset.yMm});
      expect(view.freshness).toBe('CURRENT');
      expect((await documentView(snapshot, edited)).freshness).toBe(preset.id === '1200x1500' ? 'CURRENT' : 'STALE');
      expect(edited.humanInputReviewed).toBe(false);
    }
    const wrongAxis = {...original.ringlock!, planLayout: {bearerAxis: 'Y', headAlignment: 'STANDARD_AXIS'}};
    expect(() => parseWorkflowModel({...original, ringlock: wrongAxis})).toThrow(/Unsupported Ringlock plan/);
  });
});
