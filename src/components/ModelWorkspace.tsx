import {useMemo} from 'react';
import {Box, Download, RotateCcw} from 'lucide-react';
import type {Result} from '../domain';
import {buildScene, toDxf, toGltf} from '../domain/scene';
import {Model3D} from './Model3D';

export type ModelRevision = {note: string; at: number};
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], {type})), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

export function ModelWorkspace({caseName, result, error, history, canEdit, onUndo, onEditGeometry}: {
  caseName: string; result: Result | null; error: string | null; history: ModelRevision[]; canEdit: boolean; onUndo: () => void; onEditGeometry: () => void;
}) {
  const scene = useMemo(() => {try {return result ? buildScene(result) : null;} catch {return null;}}, [result]);
  const file = caseName.replace(/[^\w\u0E00-\u0E7F-]+/g, '_').slice(0, 60) || 'formwork';
  return <section className="card model-workspace" aria-label="โมเดลจำลองแบบหล่อ">
    <div className="card-title">
      <h3><Box size={18}/> โมเดลจำลอง · {caseName}</h3>
      {result && <span className={'pill ' + (result.status === 'FAIL' ? 'red' : 'amber')}>{result.status}{result.input.confirmed ? ' · ยืนยันมิติแล้ว' : ' · ยังไม่ยืนยันมิติ'}</span>}
    </div>
    {error || !result || !scene ? <div className="warning">{error ?? 'ข้อมูลโมเดลไม่ถูกต้อง'} · แก้มิติหรือขอให้ AI ปรับค่า</div> : <div className="model-grid">
      <Model3D scene={scene}/>
      <div>
        <table aria-label="ปริมาณวัสดุจากโมเดล"><tbody>
          <tr><td>ขนาด (กว้าง × ยาว × สูง)</td><td>{result.input.width} × {result.input.length} × {result.input.height} mm · {result.input.kind === 'COLUMN' ? 'เสา' : 'ฐานราก'} {result.input.shape === 'L' ? 'รูป L' : 'สี่เหลี่ยม'}</td></tr>
          <tr><td>คอนกรีต / ไม้อัด</td><td>{scene.quantities.concrete_m3} m³ / {scene.quantities.plywood_m2} m² (หนา {result.input.plywood} mm)</td></tr>
          <tr><td>คร่าว</td><td>{scene.quantities.studs.count} ตัว · {scene.quantities.studs.totalLength_m} m · {scene.quantities.studs.section} @ ≤{result.input.studSpacing}</td></tr>
          <tr><td>คานคู่</td><td>{scene.quantities.walers.members} ท่อน · {scene.quantities.walers.levels} ระดับ · {scene.quantities.walers.totalLength_m} m · {scene.quantities.walers.section}</td></tr>
          <tr><td>Tie rod</td><td>{scene.quantities.ties.count ? `${scene.quantities.ties.count} เส้น · ${scene.quantities.ties.totalLength_m} m · Ø${scene.quantities.ties.diameter_mm}` : 'ไม่มี Tie ทะลุในโมเดลนี้'}</td></tr>
          <tr><td>แรงดันสูงสุด / ตรวจที่เกินเกณฑ์</td><td>{result.pressure.toFixed(1)} kPa / {result.checks.filter(c => c.status === 'FAIL').map(c => c.label).join(', ') || 'ไม่มี (ยังเป็น INCOMPLETE)'}</td></tr>
        </tbody></table>
        {scene.warnings.length > 0 && <ul className="blockers">{scene.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
        <div className="source-actions">
          <button className="btn secondary" onClick={() => download(file + '.gltf', toGltf(scene.solids, caseName), 'model/gltf+json')}><Download size={14}/>3D (.gltf)</button>
          <button className="btn secondary" onClick={() => download(file + '.dxf', toDxf(scene.solids), 'application/dxf')}><Download size={14}/>CAD (.dxf)</button>
          <button className="btn secondary" onClick={onEditGeometry}>ตรวจ / ยืนยันมิติ</button>
        </div>
        <h4>ประวัติการแก้จาก AI</h4>
        {history.length ? <ol className="model-history">{history.map((h, i) => <li key={i}>{h.note} <small>{new Date(h.at).toLocaleTimeString('th-TH')}</small></li>)}</ol> : <p className="muted">ยังไม่มีการแก้ผ่านแชท · พิมพ์คำสั่งในปุ่ม “สนทนากับ AI” เช่น “เปลี่ยนความลึกเป็น 1200 มม.”</p>}
        <button className="btn secondary" disabled={!canEdit || !history.length} onClick={onUndo}><RotateCcw size={14}/>ย้อนการแก้ล่าสุด</button>
      </div>
    </div>}
  </section>;
}
