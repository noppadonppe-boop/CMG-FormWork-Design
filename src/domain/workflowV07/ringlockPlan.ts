import type {RinglockConfiguration} from './ringlock.js';

/** Owner-selected plan modules, in mm. These presets carry no supplier/capacity approval. */
export const RINGLOCK_PLAN_PRESETS = [
  {id: '900x900', xMm: 900, yMm: 900},
  {id: '900x1200', xMm: 900, yMm: 1200},
  {id: '1200x1200', xMm: 1200, yMm: 1200},
  {id: '1200x1500', xMm: 1200, yMm: 1500},
  {id: '1500x1500', xMm: 1500, yMm: 1500},
] as const;
export const DEFAULT_RINGLOCK_PLAN_ID = '1200x1500';

export function selectRinglockPlan(current: RinglockConfiguration | null, presetId = DEFAULT_RINGLOCK_PLAN_ID): RinglockConfiguration {
  const preset = RINGLOCK_PLAN_PRESETS.find(p => p.id === presetId);
  if (!preset) throw Error('Unknown Ringlock plan preset');
  const config: RinglockConfiguration = current ?? {
    manufacturer: null, systemId: null, configurationId: null, ratingId: null,
    bayXMm: null, bayYMm: null, liftHeightsMm: [], totalHeightMm: null,
    headExtensionMm: null, baseExtensionMm: null, headEngagementMm: null, baseEngagementMm: null,
    braceXRef: null, braceYRef: null, planRestraintRef: null, topRestraintRef: null, baseRestraintRef: null,
    jointStiffnessRef: null, groundOrSlabEvidence: null, legs: [],
  };
  const changed = config.bayXMm !== preset.xMm || config.bayYMm !== preset.yMm ||
    config.planLayout?.bearerAxis !== 'X' || config.planLayout?.headAlignment !== 'STANDARD_AXIS';
  return {...config, bayXMm: preset.xMm, bayYMm: preset.yMm,
    planLayout: {bearerAxis: 'X', headAlignment: 'STANDARD_AXIS'},
    // Existing actual heads, brace layout and rating cannot be reused for a changed plan.
    ...(changed ? {configurationId: null, ratingId: null, braceXRef: null, braceYRef: null,
      planRestraintRef: null, topRestraintRef: null, baseRestraintRef: null, legs: []} : {})};
}
