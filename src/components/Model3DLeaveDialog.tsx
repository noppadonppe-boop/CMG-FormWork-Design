import {useEffect, useRef} from 'react';

/** Asked when leaving the 3D model with unsaved edits: save, discard (restore the values from when the model was opened) or keep editing. */
export function Model3DLeaveDialog({busy, canSave, onSave, onDiscard, onStay}: {busy: boolean; canSave: boolean; onSave: () => void; onDiscard: () => void; onStay: () => void}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const key = (e: KeyboardEvent) => {if (e.key === 'Escape') onStay();};
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [onStay]);
  return <div className="modal-backdrop" role="presentation" onClick={e => {if (e.target === e.currentTarget) onStay();}}>
    <div className="modal-dialog" role="alertdialog" aria-modal="true" aria-labelledby="m3d-leave-title" aria-describedby="m3d-leave-text">
      <h3 id="m3d-leave-title">บันทึกการแก้ไขจากโมเดล 3D หรือไม่?</h3>
      <p id="m3d-leave-text">มีค่าที่แก้ในโมเดล 3D (หน้าตัด ระยะ หรือขนาด) ที่ยังไม่ได้บันทึก</p>
      <div className="modal-actions">
        <button ref={first} className="btn" disabled={busy || !canSave} onClick={onSave}>บันทึกการแก้ไข</button>
        <button className="btn secondary" disabled={busy} onClick={onDiscard}>ไม่บันทึก (คืนค่าเดิม)</button>
        <button className="btn secondary" disabled={busy} onClick={onStay}>แก้ไขต่อ</button>
      </div>
    </div>
  </div>;
}
