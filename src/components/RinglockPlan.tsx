import React from 'react';
import type {RinglockConfiguration} from '../domain/workflowV07/ringlock';
import {RINGLOCK_PLAN_PRESETS} from '../domain/workflowV07/ringlockPlan';

const metres = (mm: number) => (mm / 1000).toFixed(2);

export function RinglockPlanDrawing({config}: {config: RinglockConfiguration}) {
  if (!config.bayXMm || !config.bayYMm || !config.planLayout) return null;
  const scale = 200 / Math.max(config.bayXMm, config.bayYMm);
  const left = 85, bottom = 245, right = left + config.bayXMm * scale, top = bottom - config.bayYMm * scale;
  return <figure className="ringlock-plan-drawing">
    <svg viewBox="0 0 400 320" role="img" aria-label={`แปลน Ringlock X ${metres(config.bayXMm)} ม. Y ${metres(config.bayYMm)} ม. หัว U-head ตรงแนวเสา คานรับตงตามแกน X`}>
      <rect x={left} y={top} width={right - left} height={bottom - top} fill="#eef3f7" stroke="#8294a5" strokeDasharray="5 4"/>
      {[top, bottom].map(y => <g key={y} stroke="#173e62" strokeWidth="3">
        <line x1={left - 15} y1={y - 4} x2={right + 15} y2={y - 4}/>
        <line x1={left - 15} y1={y + 4} x2={right + 15} y2={y + 4}/>
      </g>)}
      {[left, right].flatMap(x => [top, bottom].map(y => <g key={`${x}-${y}`} data-support-x-mm={x === left ? 0 : config.bayXMm} data-support-y-mm={y === bottom ? 0 : config.bayYMm}>
        <circle cx={x} cy={y} r="8" fill="white" stroke="#b17a28" strokeWidth="2"/>
        <circle cx={x} cy={y} r="2.5" fill="#173e62"/>
      </g>))}
      <text x={(left + right) / 2} y={top - 22} textAnchor="middle" fontSize="13">คานรับตง → X</text>
      <text x={(left + right) / 2} y={bottom + 28} textAnchor="middle" fontSize="13">X = {metres(config.bayXMm)} ม.</text>
      <text transform={`translate(${left - 30},${(top + bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize="13">Y = {metres(config.bayYMm)} ม.</text>
      <text x="20" y="300" fontSize="12">○ หัว U-head ตรงแนวเสา · เส้นคู่ = คานรับตง</text>
    </svg>
    <figcaption>แปลนหนึ่งช่อง · ระยะศูนย์กลางเสา · ยังไม่กำหนดระยะเรียงตง</figcaption>
  </figure>;
}

export function RinglockPlanSummary({config}: {config: RinglockConfiguration}) {
  if (!config.bayXMm || !config.bayYMm || !config.planLayout) return null;
  return <>
    <p>หัว U-head: ตรงแนวเสา · คานรับตง: ตามแกน X · ตง: ตามแกน Y</p>
    <p>ช่วงรองรับคานรับตง {metres(config.bayXMm)} ม. · ช่วงพาดตงระหว่างแนวคาน {metres(config.bayYMm)} ม.</p>
    <RinglockPlanDrawing config={config}/>
  </>;
}

export function RinglockPlanFields({config, onChange}: {config: RinglockConfiguration; onChange: (presetId: string) => void}) {
  const selected = RINGLOCK_PLAN_PRESETS.find(p => p.xMm === config.bayXMm && p.yMm === config.bayYMm);
  return <fieldset className="ringlock-plan">
    <legend>แปลนตั้ง Ringlock</legend>
    <label className="field"><span>ขนาดแปลน Ringlock (X × Y)</span><select value={selected?.id ?? ''} onChange={e => onChange(e.target.value)}>
      {!selected && <option value="" disabled>{config.bayXMm&&config.bayYMm?`กำหนดเอง · ${config.bayXMm} × ${config.bayYMm} mm`:'เลือกขนาดแปลน'}</option>}
      {RINGLOCK_PLAN_PRESETS.map(p => <option key={p.id} value={p.id}>
        {metres(p.xMm)} × {metres(p.yMm)} ม. · {p.xMm === p.yMm ? 'สี่เหลี่ยมจัตุรัส' : 'สี่เหลี่ยมผืนผ้า'}
      </option>)}
    </select></label>
    <RinglockPlanSummary config={config}/>
    <p className="muted">ขนาดโมดูลสำหรับจัดแปลน ต้องตรวจให้ตรงกับชุดอุปกรณ์ที่ใช้จริง</p>
  </fieldset>;
}
