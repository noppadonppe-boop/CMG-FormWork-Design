import type {BeamCriticalStation} from '../domain/workflowV07/beam';

const sideLabel: Record<BeamCriticalStation['side'], string> = {
  LEFT_LIMIT: 'ด้านซ้ายของขอบ segment',
  INTERIOR: 'ภายใน segment',
  RIGHT_LIMIT: 'ด้านขวาของขอบ segment',
};

export function beamStationLabel(station: BeamCriticalStation) {
  return `${station.stationMm.toLocaleString('en-US', {maximumFractionDigits: 3})} mm จากต้นสมาชิก · segment ${station.segmentIndex + 1} · ${sideLabel[station.side]}`;
}
