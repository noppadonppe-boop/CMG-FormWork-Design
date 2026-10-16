import {useMemo, useRef, useState} from 'react';
import {LAYER_COLORS, LAYERS, type Layer, type Scene} from '../domain/scene';
import {projectSolids} from '../drawing/iso';

const LABELS: Record<Layer, string> = {CONCRETE: 'คอนกรีต', PLYWOOD: 'ไม้อัด', STUD: 'คร่าว', WALER: 'คานคู่', TIE: 'Tie rod'};
const VIEWS = [['ไอโซ', -0.75, 0.55], ['ด้านบน', 0, Math.PI / 2], ['ด้านหน้า', 0, 0]] as const;

/** Lightweight SVG renderer (painter's algorithm + back-face culling); drag to rotate. */
export function Model3D({scene}: {scene: Scene}) {
  const [yaw, setYaw] = useState(-0.75), [pitch, setPitch] = useState(0.55), [hidden, setHidden] = useState<Layer[]>([]);
  const drag = useRef<{x: number; y: number; yaw: number; pitch: number} | null>(null);
  const view = useMemo(() => {
    const {faces, bounds: b} = projectSolids(scene.solids, yaw, pitch, hidden);
    const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1) * 0.06;
    return {faces, box: `${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + 2 * pad} ${b.maxY - b.minY + 2 * pad}`};
  }, [scene, yaw, pitch, hidden]);
  return <div className="model3d">
    <div className="model3d-tools">
      {VIEWS.map(([label, y, p]) => <button key={label} type="button" className="btn secondary" onClick={() => {setYaw(y); setPitch(p);}}>{label}</button>)}
      <span className="model3d-layers">{LAYERS.map(l => <label key={l}><input type="checkbox" checked={!hidden.includes(l)} onChange={e => setHidden(h => e.target.checked ? h.filter(x => x !== l) : [...h, l])}/>
        <i style={{background: `rgb(${LAYER_COLORS[l].rgb.map(v => v * 255).join(',')})`}}/>{LABELS[l]}</label>)}</span>
    </div>
    <svg viewBox={view.box} className="model3d-canvas" role="img" aria-label="โมเดล 3 มิติของแบบหล่อ ลากเพื่อหมุน"
      onPointerDown={e => {drag.current = {x: e.clientX, y: e.clientY, yaw, pitch}; e.currentTarget.setPointerCapture?.(e.pointerId);}}
      onPointerMove={e => {const d = drag.current; if (!d) return; setYaw(d.yaw + (e.clientX - d.x) * 0.01); setPitch(Math.max(-0.2, Math.min(Math.PI / 2, d.pitch + (e.clientY - d.y) * 0.01)));}}
      onPointerUp={() => {drag.current = null;}} onPointerLeave={() => {drag.current = null;}}>
      {view.faces.map((f, i) => <path key={i} d={f.d} fill={f.fill} fillOpacity={f.opacity} stroke={f.fill} strokeOpacity={f.opacity} strokeWidth={0.6} vectorEffect="non-scaling-stroke"/>)}
    </svg>
    <p className="muted">ลากเพื่อหมุนโมเดล · ภาพประกอบผังคัดกรอง (NTS) ไม่ใช่แบบติดตั้ง</p>
  </div>;
}
