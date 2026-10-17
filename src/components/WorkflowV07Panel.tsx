import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {Input} from '../domain';
import {canonical, WORKFLOW_VERSION, type ElementType, type Point2} from '../domain/workflowV07/common';
import {createStoredWorkflowDraft, restoreWorkflowDraft, type StoredWorkflowDraft} from '../domain/workflowV07/storage';
import {applyCoverageReview, fromLegacy, previewWorkflow, regenerateDraftLayouts, reviseDraft, type WorkflowModel} from '../domain/workflowV07/model';
import type {SoffitLayout} from '../domain/workflowV07/soffit';
import {stampSideLayout, type SideLayoutDefinition} from '../domain/workflowV07/sideLayout';
import {selectReference, type SelectionSnapshot} from '../domain/workflowV07/catalogues';
import {documentView, freezeDesign, type FrozenDesign} from '../domain/workflowV07/snapshot';
import {references} from '../workflowV07References';
import {closureReferences} from '../closurePackReferences';
import {selectRinglockPlan} from '../domain/workflowV07/ringlockPlan';
import {RinglockPlanFields, RinglockPlanSummary} from './RinglockPlan';
import {SoffitLayoutEditor} from './SoffitLayoutEditor';
import {SoffitResults} from './SoffitResults';
import {RinglockResearchFields, RinglockResearchSummary} from './RinglockResearch';
import {selectRinglockResearch} from '../domain/workflowV07/ringlockResearch';
import {SideLayoutEditor} from './SideLayoutEditor';
import {SideResults} from './SideResults';
import {frameGeometryFromAssembly, frameGeometryFromSoffit, frameGeometryFromSide, stampFrameLayout, type FrameLayoutDefinition} from '../domain/workflowV07/frameWorkflow';
import {FrameLayoutEditor} from './FrameLayoutEditor';
import {FrameResults} from './FrameResults';
import {SupportLayoutEditor} from './SupportLayoutEditor';
import {SupportResults} from './SupportResults';
import {WorkflowTakeoffResults} from './WorkflowTakeoffResults';
import {beamStationLabel} from './beamTrace';
import {captureSupportLayout, stampSupportLayout, type SupportLayoutDefinition} from '../domain/workflowV07/supportLayout';
import {LayoutCandidateEditor, LayoutCandidateSummary} from './LayoutCandidateEditor';
import {applyLayoutCandidate, type CandidateRequest, type CandidateReview} from '../domain/workflowV07/layoutCandidate';
import {CoverageReviewEditor, CoverageReviewResults} from './CoverageReview';
import {captureRinglockAssembly, stampRinglockAssembly, type RinglockAssemblyDefinition} from '../domain/workflowV07/ringlockAssembly';
import {RinglockAssemblyEditor, RinglockAssemblyResults} from './RinglockAssembly';
import {applyLoadCases} from '../domain/workflowV07/loadCases';
import {LoadCasesEditor, LoadCasesResults} from './LoadCases';
import {applyStageStudy, captureStage, copyToDraftStage, loadStageForEditing, removeStageLayout} from '../domain/workflowV07/stageStudy';
import {StageStudyEditor, StageStudyResults} from './StageStudy';
import './workflow-v07.css';

type View = Awaited<ReturnType<typeof documentView>>;
const show = (v: number | null) => v === null ? 'UNKNOWN' : v.toLocaleString('en-US', {maximumFractionDigits: 4});
function initialModel(input: Input, caseId: string, initialElementType: ElementType = input.kind): WorkflowModel {
  const legacy = fromLegacy(input, caseId);
  const model = initialElementType === legacy.elementType ? legacy : {
    ...legacy,
    elementType: initialElementType,
    sideTopology: (initialElementType === 'SLAB' ? null : initialElementType === 'COLUMN' ? 'COLUMN_YOKE' : 'THROUGH_TIE') as WorkflowModel['sideTopology'],
    ringlock: initialElementType === 'BEAM' || initialElementType === 'SLAB' ? selectRinglockPlan(null) : null,
  };
  return {...model, checkCatalogue: {version: '0.7', specifications: references.checks.map(c => ({
    id: String(c.check_id), group: String(c.group), description: String(c.description), appliesTo: String(c.applicable_to)}))}};
}
function CustomReference({selection, slot, onChange, onPendingChange}: {selection: SelectionSnapshot; slot: string; onChange: (next: SelectionSnapshot) => void; onPendingChange: (slot: string, pending: boolean) => void}) {
  const [field, setField] = useState(''), [value, setValue] = useState(''), [reason, setReason] = useState(''), [evidence, setEvidence] = useState(''), [error, setError] = useState('');
  useEffect(() => () => onPendingChange(slot, false), [slot, onPendingChange]);
  function pending(patch: {field?: string; value?: string; reason?: string; evidence?: string}) {
    const next = {field, value, reason, evidence, ...patch};
    onPendingChange(slot, Object.values(next).some(v => v !== ''));
  }
  function discard() {setField(''); setValue(''); setReason(''); setEvidence(''); setError(''); onPendingChange(slot, false);}
  const props = selection.reference.properties as Record<string, unknown> | undefined;
  const fields = props ? Object.keys(props).filter(k => typeof props[k] === 'number' || props[k] === null).map(k => `properties.${k}`) :
    Object.keys(selection.reference).filter(k => (typeof selection.reference[k] === 'number' || (selection.reference[k] === null && /_(mm|cm2|cm3|cm4|MPa|kg_m3)$/.test(k))) && !/id$|status|release|verified|sha256|source|candidate_selectable|capacity_available/i.test(k));
  return <details><summary>{selection.mode === 'CUSTOM' ? 'Custom · เก็บข้อมูลต้นฉบับแยกแล้ว' : 'กำหนด Custom พร้อมหลักฐาน'}</summary>
    <label className="field"><span>คุณสมบัติ (หน่วยตามชื่อช่องต้นฉบับ)</span><select value={field} onChange={e => {setField(e.target.value); setValue(''); pending({field: e.target.value, value: ''});}}><option value="">เลือกคุณสมบัติ</option>{fields.map(k => <option key={k}>{k}</option>)}</select></label>
    <label className="field"><span>ค่าที่ใช้ใหม่ · เว้นว่าง = UNKNOWN</span><input type="number" step="any" value={value} onChange={e => {setValue(e.target.value); pending({value: e.target.value});}}/></label>
    <label className="field"><span>เหตุผล</span><input value={reason} onChange={e => {setReason(e.target.value); pending({reason: e.target.value});}}/></label>
    <label className="field"><span>อ้างอิงหลักฐาน</span><input value={evidence} onChange={e => {setEvidence(e.target.value); pending({evidence: e.target.value});}}/></label>
    <button className="btn secondary" disabled={!field || !reason.trim() || !evidence.trim()} onClick={() => {
      try {
        const effectiveValue = value === '' ? null : Number(value);
        const propertyName = field.replace(/^properties\./, '');
        const previous = Object.fromEntries(Object.entries(selection.effective).filter(([k, v]) => canonical(v) !== canonical(selection.reference[k])));
        const changes = field.startsWith('properties.') ? {...previous, properties: {...selection.effective.properties as object, [propertyName]: effectiveValue}} : {...previous, [field]: effectiveValue};
        onChange(selectReference(selection.reference, selection.provenance.sourceVersion, {changes, reason, evidenceRef: evidence})); discard();
      } catch (e) {setError((e as Error).message);}
    }}>ใช้ Custom เป็นร่าง</button><button className="btn secondary" onClick={discard}>ยกเลิกค่าที่กรอก Custom</button>{error && <p role="alert">{error}</p>}
  </details>;
}
function PairDrawing({topology}: {topology: ReturnType<typeof previewWorkflow>['topology']}) {
  const xs = topology.vertices.map(p => p.x), ys = topology.vertices.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), width = Math.max(...xs) - minX, height = Math.max(...ys) - minY;
  const scale = 300 / Math.max(width, height), pos = (p: Point2) => `${50 + (p.x - minX) * scale},${45 + (p.y - minY) * scale}`;
  return <svg viewBox="0 0 430 400" role="img" aria-label="ผิวจริงและคู่ช่วงผิวจากฉบับคำนวณร่าง">
    <polygon points={topology.vertices.map(pos).join(' ')} fill="#eef3f7" stroke="#173e62" strokeWidth="2"/>
    {topology.faces.map(f => <text key={f.id} x={50 + ((f.a.x + f.b.x) / 2 - minX) * scale} y={38 + ((f.a.y + f.b.y) / 2 - minY) * scale} textAnchor="middle" fontSize="11">{f.id} · {show(f.lengthMm)} mm</text>)}
    {topology.pairs.map(p => {
      const middle = (p.startMm + p.endMm) / 2;
      const a = p.normalAxis === 'X' ? {x: p.normalAMm, y: middle} : {x: middle, y: p.normalAMm};
      const b = p.normalAxis === 'X' ? {x: p.normalBMm, y: middle} : {x: middle, y: p.normalBMm};
      return <polyline key={p.id} points={`${pos(a)} ${pos(b)}`} fill="none" stroke="#b17a28" strokeDasharray="5 4"/>;
    })}
    <text x="15" y="375" fontSize="11">GEOMETRY ONLY · คู่ช่วงผิวไม่ใช่แนวติดตั้งไทร์</text>
    <text x="15" y="392" fontSize="11">DRAFT / NO_GO · mm · NTS</text>
  </svg>;
}
function ReferenceSelectionSummary({selections}: {selections: WorkflowModel['selections']}) {
  if (!Object.values(selections).some(Boolean)) return null;
  const display = (value: unknown) => value == null ? 'UNKNOWN' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return <section aria-label="ข้อมูลอ้างอิง Standard และ Custom ในฉบับร่าง"><h3>ข้อมูลอ้างอิง Standard / Custom ที่นำไปใช้แล้ว</h3>
    <p>การเลือกในส่วนนี้เพียงอย่างเดียวยังไม่ผูกสมบัติกับสมาชิก ต้องตรวจการผูก หน้าตัด วัสดุ และแกนที่รายละเอียดสมาชิก</p>
    {(['section', 'material', 'ringlock'] as const).map(slot => {
      const selection = selections[slot]; if (!selection) return null;
      const id = selection.reference[slot === 'section' ? 'section_id' : slot === 'material' ? 'material_id' : 'component_id'];
      const rows = Object.entries(selection.reference).flatMap(([key, value]) => key === 'properties' && value !== null && typeof value === 'object'
        ? Object.keys(value).map(property => ({key: `properties.${property}`, original: (value as Record<string, unknown>)[property], effective: selection.effective.properties !== null && typeof selection.effective.properties === 'object' ? (selection.effective.properties as Record<string, unknown>)[property] : null}))
        : [{key, original: value, effective: selection.effective[key]}]);
      return <details key={slot} aria-label={`อ้างอิงที่นำไปใช้ ${slot}`}><summary>{String(id)} · {selection.mode} · Source {selection.provenance.sourceVersion}</summary>
        {selection.mode === 'CUSTOM' && <p>เหตุผล: {display(selection.provenance.reason)} · หลักฐาน: {display(selection.provenance.evidenceRef)}</p>}
        <table><thead><tr><th>คุณสมบัติ / หน่วยตามชื่อช่อง</th><th>ต้นฉบับ</th><th>ค่าที่นำไปใช้ในข้อมูลอ้างอิงร่าง</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><td>{row.key}</td><td>{display(row.original)}</td><td>{display(row.effective)}</td></tr>)}</tbody></table>
      </details>;
    })}
  </section>;
}
function ContractAuditSummary({preview}: {preview: ReturnType<typeof previewWorkflow>}) {
  const audits = preview.contractAudits;
  return <section aria-label="สรุป contract audit ของรายการคำนวณและแบบ"><h3>Contract v0.7 · {audits.length} Revision/Stage/Case audit · NO_GO</h3>
    <p>ตารางนี้ผูก 12 checks กับ Revision, Stage และ Load case ของแต่ละผลลัพธ์; `SCREENED` เป็นการคัดกรองซอฟต์แวร์เท่านั้น และแถวที่ขาดหลักฐานยังคง `INCOMPLETE`</p>
    <table aria-label="สรุป contract audit"><thead><tr><th>Revision / Stage / Case</th><th>สถานะรวม</th><th>INCOMPLETE</th><th>SCREENED</th><th>FAIL</th><th>ยืนยัน/ปล่อยงาน</th></tr></thead><tbody>{audits.map((a, index) => {
      const counts = {INCOMPLETE: 0, SCREENED: 0, FAIL: 0}; a.checks.forEach(c => {counts[c.status]++;});
      return <tr key={`${a.inputRevision}-${a.stageId}-${a.loadCaseId}-${index}`}><td>{a.inputRevision} / {a.stageId || 'UNKNOWN'} / {a.loadCaseId || 'UNKNOWN'}</td><td>{a.status}</td><td>{counts.INCOMPLETE}</td><td>{counts.SCREENED}</td><td>{counts.FAIL}</td><td>{String(a.confirmed)} / {a.constructionRelease}</td></tr>;
    })}</tbody></table>
    <details><summary>รายละเอียด 12 checks ต่อ audit</summary>{audits.map((a, index) => <details key={`${a.inputRevision}-${a.stageId}-${a.loadCaseId}-detail-${index}`}><summary>{a.stageId || 'UNKNOWN'} / {a.loadCaseId || 'UNKNOWN'} · {a.status}</summary><ul>{a.checks.map(c => <li key={c.checkId}>{c.checkId} · {c.status} · {c.entityIds.length ? c.entityIds.join(', ') : 'ยังไม่ระบุ'} · {c.missingInputs.join('; ')}</li>)}</ul></details>)}</details>
  </section>;
}
export function WorkflowDocuments({view}: {view: View}) {
  const {preview, model} = view.report;
  return <article className="workflow-v07-documents" aria-label="รายการคำนวณและแบบจาก Snapshot เดียวกัน">
    <p><b>DRAFT / NO_GO · {view.freshness}</b></p>
    <p>รายการคำนวณและรูปคู่ด้าน · {model.id} · {model.elementType}</p>
    <code className="workflow-v07-hash" data-testid="report-snapshot-hash">{view.snapshotHash}</code>
    <p>พื้นที่ {show(preview.topology.areaM2)} m² · แบบข้าง {show(preview.topology.sideAreaM2)} m² · แรงดันฐาน {show(preview.pressureBaseKPa)} kPa</p>
    <p>Hydrostatic preview: p = γ × depth. โหลดแนวดิ่งแยกจากแรงดันข้าง</p>
    <ContractAuditSummary preview={preview}/>
    <ReferenceSelectionSummary selections={model.selections}/>
    <LayoutCandidateSummary model={model}/>
    <figure><PairDrawing topology={view.drawing.topology}/><figcaption>แบบร่าง · Snapshot <code data-testid="drawing-snapshot-hash">{view.snapshotHash}</code></figcaption></figure>
    {(model.elementType === 'BEAM' || model.elementType === 'SLAB') && model.ringlock?.planLayout && <section aria-label="แปลน Ringlock จากฉบับร่าง"><h3>แปลนตั้ง Ringlock</h3><RinglockPlanSummary config={model.ringlock}/></section>}
    <SoffitResults model={model} preview={preview}/>
    <SideResults model={model} preview={preview}/>
    <WorkflowTakeoffResults model={model} preview={preview}/>
    <FrameResults model={model} preview={preview}/>
    <SupportResults model={model} preview={preview}/>
    <RinglockAssemblyResults model={model} preview={preview}/>
    <LoadCasesResults preview={preview}/>
    <StageStudyResults preview={preview}/>
    <CoverageReviewResults model={model} preview={preview}/>
    <RinglockResearchSummary snapshot={model.ringlockResearch ?? null} summary={preview.ringlockReference}/>
    <table><thead><tr><th>คู่ช่วงผิว</th><th>ผิว</th><th>ระยะผ่านคอนกรีต</th><th>ช่วงผิว</th></tr></thead><tbody>
      {view.drawing.topology.pairs.map(p => <tr key={p.id}><td>{p.id}</td><td>{p.faceAId} ↔ {p.faceBId}</td><td>{show(p.chordMm)} mm</td><td>{show(p.endMm - p.startMm)} mm</td></tr>)}
    </tbody></table>
    <p>สถานะ {preview.status} · ข้อมูลและผลที่ยังขาดทั้งหมด:</p><ul>{preview.blockers.map(b => <li key={b}>{b}</li>)}</ul>
    {!!preview.loadPath?.analyses.length && <table><thead><tr><th>สมาชิก / Revision</th><th>Mmax · N·mm @ station</th><th>Vmax · N @ station</th><th>δmax · mm @ station</th></tr></thead><tbody>
      {preview.loadPath.analyses.map(a => <tr key={a.id}><td>{a.id} / {a.revision}</td>
        <td>{show(a.maxMomentNmm)} @ {beamStationLabel(a.criticalStations.moment)}</td>
        <td>{show(a.maxShearN)} @ {beamStationLabel(a.criticalStations.shear)}</td>
        <td>{show(a.maxDeflectionMm)} @ {beamStationLabel(a.criticalStations.deflection)}</td></tr>)}
    </tbody></table>}
    {model.checkCatalogue && <details><summary>ข้อกำหนดตรวจและ Coverage · ฉบับ {model.checkCatalogue.version}</summary><table><thead><tr><th>Check</th><th>ขอบเขต</th><th>สถานะร่าง</th></tr></thead><tbody>
      {model.checkCatalogue.specifications.filter(s => s.appliesTo === 'ALL' || s.appliesTo.split('|').includes(model.elementType)).map(s => <tr key={s.id}><td>{s.id} · {s.description}</td><td>{s.group}</td><td>{preview.specificationGaps.includes(s.id) ? 'BLOCKED · ยังไม่ผูกสมาชิกจริง' : 'BLOCKED · รอตรวจกำลัง/หลักฐาน'}</td></tr>)}
    </tbody></table></details>}
  </article>;
}

type Restored = {model: WorkflowModel; staleEngine: boolean; sourceChanged: boolean; savedEngineVersion: string | null; savedAtMs: number | null};
function restoreOrSeed(input: Input, caseId: string, initialElementType: ElementType | undefined, stored: StoredWorkflowDraft | null): Restored {
  if (stored) {
    try {const r = restoreWorkflowDraft(stored, input); return {...r, savedAtMs: stored.savedAtMs};} catch { /* unreadable draft: start from the legacy seed below */ }
  }
  return {model: initialModel(input, caseId, initialElementType), staleEngine: false, sourceChanged: false, savedEngineVersion: null, savedAtMs: null};
}
export default function WorkflowV07Panel({input, caseId, initialElementType, stored = null, canPersist = true, onPersist}: {
  input: Input; caseId: string; initialElementType?: ElementType; stored?: StoredWorkflowDraft | null; canPersist?: boolean; onPersist?: (draft: StoredWorkflowDraft) => Promise<void> | void;
}) {
  const [restored, setRestored] = useState<Restored>(() => restoreOrSeed(input, caseId, initialElementType, stored));
  const [model, setModel] = useState(() => restored.model);
  const [saveState, setSaveState] = useState<{status: 'IDLE' | 'SAVING' | 'SAVED' | 'FAILED'; atMs: number | null; message: string}>({status: stored ? 'SAVED' : 'IDLE', atMs: stored?.savedAtMs ?? null, message: ''});
  const [vertices, setVertices] = useState(JSON.stringify(model.vertices.map(p => [p.x, p.y])));
  const [soffitPending, setSoffitPending] = useState(false);
  const [sidePending, setSidePending] = useState(false);
  const [framePending, setFramePending] = useState(false);
  const [supportPending, setSupportPending] = useState(false);
  const [coveragePending, setCoveragePending] = useState(false);
  const [assemblyPending, setAssemblyPending] = useState(false);
  const [loadCasesPending, setLoadCasesPending] = useState(false);
  const [stagePending, setStagePending] = useState(false), [editorEpoch, setEditorEpoch] = useState(0);
  const [candidatePending, setCandidatePending] = useState(false);
  const [referencePending, setReferencePending] = useState<Record<string, boolean>>({});
  const [supplierPending, setSupplierPending] = useState(false);
  const onReferencePending = useCallback((slot: string, pending: boolean) => {
    setReferencePending(previous => previous[slot] === pending ? previous : {...previous, [slot]: pending});
  }, []);
  const pendingSoffit = useRef<SoffitLayout | null>(null), pendingSide = useRef<SideLayoutDefinition | null>(null), pendingFrame = useRef<FrameLayoutDefinition | null>(null);
  const pendingAssembly = useRef<RinglockAssemblyDefinition | null>(null);
  const pendingSupport = useRef<SupportLayoutDefinition | null>(null);
  const [error, setError] = useState(''), [snapshot, setSnapshot] = useState<FrozenDesign | null>(null), [view, setView] = useState<View | null>(null), [busy, setBusy] = useState(false);
  const generation = useRef(0);
  // Re-seed only when the case or the legacy source changes; a saved draft always wins over the seed.
  const storedRef = useRef(stored); storedRef.current = stored;
  useEffect(() => {
    const next = restoreOrSeed(input, caseId, initialElementType, storedRef.current);
    setRestored(next); setModel(next.model); setVertices(JSON.stringify(next.model.vertices.map(p => [p.x, p.y])));
    lastPersisted.current = canonical(next.model);
    setSaveState({status: storedRef.current ? 'SAVED' : 'IDLE', atMs: storedRef.current?.savedAtMs ?? null, message: ''});
  }, [input, caseId, initialElementType]);
  const analysis = useMemo(() => {try {return {preview: previewWorkflow(model), error: null};} catch (e) {return {preview: null, error: (e as Error).message};}}, [model]);
  const draftIdentity = canonical(model);
  // Persist authored changes (debounced). The seed itself is not saved until the user changes something.
  const lastPersisted = useRef<string>(canonical(restored.model));
  useEffect(() => {
    if (!onPersist || !canPersist || draftIdentity === lastPersisted.current) return;
    const timer = window.setTimeout(async () => {
      let draft: StoredWorkflowDraft;
      try {draft = createStoredWorkflowDraft(model, input);} catch (e) {setSaveState({status: 'FAILED', atMs: null, message: (e as Error).message}); return;}
      setSaveState(s => ({...s, status: 'SAVING', message: ''}));
      try {await onPersist(draft); lastPersisted.current = draftIdentity; setSaveState({status: 'SAVED', atMs: draft.savedAtMs, message: ''});}
      catch (e) {setSaveState({status: 'FAILED', atMs: null, message: (e as Error).message});}
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draftIdentity, model, input, onPersist, canPersist]);
  function reanalyseAll() {
    try {setModel(regenerateDraftLayouts(model, {}, {allowIncomplete: true})); setRestored(r => ({...r, staleEngine: false})); setError('');}
    catch (e) {setError((e as Error).message);}
  }
  const currentModel = useRef(model); currentModel.current = model;
  useEffect(() => {
    let canceled = false;
    setView(null);
    if (snapshot) void documentView(snapshot, model).then(v => {if (!canceled) setView(v);}).catch(e => {if (!canceled) setError((e as Error).message);});
    return () => {canceled = true;};
  }, [snapshot, draftIdentity]); // model value is fully represented by canonical identity
  const geometryPending = vertices !== JSON.stringify(model.vertices.map(p => [p.x, p.y]));
  const referencesPending = Object.values(referencePending).some(Boolean);
  const candidateSourcePending = geometryPending || soffitPending || sidePending || framePending || supportPending || assemblyPending || coveragePending || loadCasesPending || stagePending || referencesPending || supplierPending;
  const currentCandidateSourcesPending = useRef(candidateSourcePending); currentCandidateSourcesPending.current = candidateSourcePending;
  const anyPending = candidateSourcePending || candidatePending;
  const fresh = view?.freshness === 'CURRENT' && snapshot?.inputHash === view.inputHash && canonical(snapshot.content.model) === draftIdentity && !anyPending;
  function requireAppliedReferences() {
    if (geometryPending) throw Error('มีพิกัดที่ยังไม่ได้นำไปใช้ กรุณาตรวจและใช้พิกัดก่อนวิเคราะห์');
    if (referencesPending || supplierPending) throw Error('มีค่า Custom หรือผู้จำหน่ายที่ยังไม่ได้นำไปใช้ กรุณากดใช้ บันทึก หรือยกเลิกก่อนวิเคราะห์');
  }
  function pendingFramePatch() {
    if (framePending && !pendingFrame.current) throw Error('มีเฟรมที่ยังไม่ได้นำไปใช้ กรุณาตรวจหรือคืนค่าเฟรมล่าสุด');
    return framePending ? {frameLayout: stampFrameLayout(model, pendingFrame.current!)} : {};
  }
  function pendingAssemblyPatch() {
    if (assemblyPending && !pendingAssembly.current) throw Error('มีการประกอบ Ringlock ค้าง กรุณาตรวจหรือคืนค่า');
    return assemblyPending ? {ringlockAssembly: stampRinglockAssembly(model, pendingAssembly.current!)} : {};
  }
  function pendingSupportPatch() {
    if (supportPending && !pendingSupport.current) throw Error('มีข้อมูลรองรับค้าง กรุณาตรวจหรือคืนค่า');
    return supportPending ? {supportLayout: stampSupportLayout(model, pendingSupport.current!)} : {};
  }
  function applied() {setSoffitPending(false); setSidePending(false); setFramePending(false); setAssemblyPending(false); setSupportPending(false); setError('');}
  function requireStageSourceApplied() {
    requireAppliedReferences();
    if (soffitPending || sidePending || framePending || supportPending || assemblyPending || loadCasesPending || coveragePending || candidatePending) throw Error('มีข้อมูล Layout/กรณีโหลด/แผนตัวแทนค้าง กรุณาเก็บหรือคืนค่าก่อนจัดชุด Stage');
  }
  function replaceStageEditor(next: WorkflowModel) {
    if (anyPending) throw Error('มีข้อมูลค้าง กรุณาเก็บหรือคืนค่าทุกส่วนก่อนเปลี่ยน Stage หน้าจอ');
    setModel(next); setVertices(JSON.stringify(next.vertices.map(p => [p.x, p.y]))); setEditorEpoch(n => n + 1);
    pendingSoffit.current = null; pendingSide.current = null; pendingFrame.current = null; pendingAssembly.current = null; pendingSupport.current = null; setError('');
  }
  function applySoffit(layout: SoffitLayout) {
    requireAppliedReferences();
    if (sidePending && !pendingSide.current) throw Error('มีแบบข้างที่กรอกไม่ครบ กรุณาตรวจพิกัด/ปลายไทร์ หรือคืนค่าที่นำไปใช้ล่าสุด');
    setModel(regenerateDraftLayouts(model, {soffitLayout: layout, ...(sidePending ? {sideLayout: stampSideLayout(model, pendingSide.current!)} : {}), ...pendingAssemblyPatch(), ...pendingFramePatch(), ...pendingSupportPatch()},
      {allowIncomplete: !!layout.joist.binding || !!layout.bearer.binding || !!layout.plywood || !!layout.loading || layout.baseDatumsByHead != null}));
    applied();
  }
  function applySide(layout: SideLayoutDefinition) {
    requireAppliedReferences();
    if (soffitPending && !pendingSoffit.current) throw Error('มีแบบท้องที่กรอกไม่ครบ กรุณาตรวจรายการพิกัดก่อนวิเคราะห์');
    setModel(regenerateDraftLayouts(model, {sideLayout: stampSideLayout(model, layout), ...(soffitPending ? {soffitLayout: pendingSoffit.current!} : {}), ...pendingAssemblyPatch(), ...pendingFramePatch(), ...pendingSupportPatch()},
      {allowIncomplete: layout.faces.some(f => !!f.stud.binding || !!f.rail.binding || !!f.plywood.binding || !!f.pressure || f.walers.some(w => !!w.pair))}));
    applied();
  }
  function applyFrame(layout: FrameLayoutDefinition) {
    requireAppliedReferences();
    if (soffitPending && !pendingSoffit.current) throw Error('มีแบบท้องที่กรอกไม่ครบ กรุณาตรวจรายการพิกัดก่อนวิเคราะห์');
    if (sidePending && !pendingSide.current) throw Error('มีแบบข้างที่กรอกไม่ครบ กรุณาตรวจหรือคืนค่าก่อนวิเคราะห์');
    setModel(regenerateDraftLayouts(model, {frameLayout: stampFrameLayout(model, layout), ...pendingAssemblyPatch(), ...pendingSupportPatch(),
      ...(soffitPending ? {soffitLayout: pendingSoffit.current!} : {}),
      ...(sidePending ? {sideLayout: stampSideLayout(model, pendingSide.current!)} : {})}, {allowIncomplete: true}));
    applied();
  }
  async function applyCandidate(request: CandidateRequest, review: CandidateReview) {
    if (candidateSourcePending) throw Error('มีข้อมูลต้นทางค้าง กรุณาเก็บหรือคืนค่าก่อนใช้ข้อเสนอ');
    const before = canonical(model), next = await applyLayoutCandidate(model, request, review.proposal, review.proposalHash, true);
    if (canonical(currentModel.current) !== before || currentCandidateSourcesPending.current) throw Error('ข้อมูลต้นทางเปลี่ยนหรือมีข้อมูลค้างระหว่างใช้ข้อเสนอ ต้องตรวจข้อมูลก่อนใช้ใหม่');
    pendingSoffit.current = null; pendingSide.current = null; pendingFrame.current = null; pendingAssembly.current = null; pendingSupport.current = null;
    setModel(next); setEditorEpoch(n => n + 1); setCandidatePending(false); applied();
  }
  function applyAssembly(layout: RinglockAssemblyDefinition) {
    requireAppliedReferences();
    if (soffitPending && !pendingSoffit.current) throw Error('มีแบบท้องที่กรอกไม่ครบ กรุณาตรวจหรือคืนค่าก่อนตรวจการประกอบ');
    if (sidePending && !pendingSide.current) throw Error('มีแบบข้างที่กรอกไม่ครบ กรุณาตรวจหรือคืนค่าก่อนตรวจการประกอบ');
    setModel(regenerateDraftLayouts(model, {ringlockAssembly: stampRinglockAssembly(model, layout),
      ...(soffitPending ? {soffitLayout: pendingSoffit.current!} : {}), ...(sidePending ? {sideLayout: stampSideLayout(model, pendingSide.current!)} : {}), ...pendingFramePatch(), ...pendingSupportPatch()}, {allowIncomplete: true}));
    applied();
  }
  function applySupport(layout: SupportLayoutDefinition) {
    requireAppliedReferences();
    if (soffitPending && !pendingSoffit.current) throw Error('มีแบบท้องค้าง กรุณาตรวจหรือคืนค่าก่อนตรวจรองรับ');
    if (sidePending && !pendingSide.current) throw Error('มีแบบข้างค้าง กรุณาตรวจหรือคืนค่าก่อนตรวจรองรับ');
    setModel(regenerateDraftLayouts(model, {supportLayout: stampSupportLayout(model, layout), ...pendingAssemblyPatch(), ...pendingFramePatch(),
      ...(soffitPending ? {soffitLayout: pendingSoffit.current!} : {}), ...(sidePending ? {sideLayout: stampSideLayout(model, pendingSide.current!)} : {})}, {allowIncomplete: true}));
    applied();
  }
  function edit<K extends Exclude<keyof WorkflowModel, 'schemaVersion' | 'id' | 'revisionId' | 'legacy'>>(key: K, value: WorkflowModel[K]) {
    try {
      const patch = {[key]: value};
      if (key === 'elementType' && (value === 'BEAM' || value === 'SLAB') && !model.ringlock) Object.assign(patch, {ringlock: selectRinglockPlan(null)});
      setModel(reviseDraft(model, patch)); setError('');
    } catch (e) {setError((e as Error).message);}
  }
  function editRinglockPlan(presetId: string) {
    try {
      const ringlock = selectRinglockPlan(model.ringlock, presetId);
      if (canonical(ringlock) === canonical(model.ringlock)) return;
      setModel(reviseDraft(model, {ringlock, ringlockRating: null})); setError('');
    } catch (e) {setError((e as Error).message);}
  }
  function numeric(key: 'heightMm' | 'gammaKNm3' | 'slabThicknessMm' | 'beamWidthMm' | 'concreteStripMm' | 'deadStripMm' | 'liveStripMm' | 'additionalDeadKPa' | 'constructionLiveKPa', label: string, unit: string) {
    return <label className="field"><span>{label} <small>{unit}</small></span><input type="number" min="0" step="any" value={model[key] ?? ''} onChange={e => {
      if (key === 'heightMm') {if (e.target.value !== '') edit(key, Number(e.target.value));}
      else edit(key, e.target.value === '' ? null : Number(e.target.value));
    }}/></label>;
  }
  async function freeze() {
    if (anyPending) return;
    const ticket = ++generation.current;
    setBusy(true); setError('');
    try {const next = await freezeDesign(model); if (ticket === generation.current) setSnapshot(next);} catch (e) {setError((e as Error).message);} finally {if (ticket === generation.current) setBusy(false);}
  }
  function download() {
    if (!snapshot || !fresh) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], {type: 'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = `workflow-v07-${snapshot.snapshotHash.slice(0, 12)}-DRAFT.json`; a.click(); URL.revokeObjectURL(url);
  }
  return <section className="card workflow-v07" aria-label="Workflow v0.7 ร่างแยกจากโครงการเดิม">
    <h2>Workflow v0.7 · ร่างตรวจข้อมูล</h2>
    <p>สำเนาสำหรับตรวจรูปทรง คู่ด้าน และโหลด · ข้อมูลที่ไม่ทราบให้เว้นว่าง · การเปลี่ยนค่าที่นี่ไม่แก้โครงการเดิม</p>
    <div className="notice">DRAFT / NO_GO · ยังรอหลักฐานสินค้าจริงและชุดกำลัง Form Tie / Ringlock ที่ตรวจครบ</div>
    <p className="muted" role="status" aria-label="สถานะการบันทึกร่าง v0.7">
      {!onPersist ? 'ร่างนี้ไม่ถูกบันทึก (ไม่มีปลายทางบันทึก)' : !canPersist ? 'สิทธิ์ดูอย่างเดียว · การแก้ไขไม่ถูกบันทึก'
        : saveState.status === 'SAVING' ? 'กำลังบันทึกร่าง…' : saveState.status === 'FAILED' ? `บันทึกร่างไม่สำเร็จ: ${saveState.message}`
          : saveState.status === 'SAVED' && saveState.atMs !== null ? `บันทึกร่างแล้ว ${new Date(saveState.atMs).toLocaleString('th-TH')} · engine ${WORKFLOW_VERSION}` : 'ยังไม่มีการแก้ไขที่ต้องบันทึก'}
      {' · Revision '}{model.revisionId}
    </p>
    {restored.staleEngine && <div className="warning" role="alert"><p>ร่างนี้บันทึกด้วย engine {restored.savedEngineVersion} (ปัจจุบัน {WORKFLOW_VERSION}) ผลที่คำนวณไว้ทั้งหมดถือว่า stale ต้องคำนวณใหม่ก่อนใช้</p>
      <button className="btn secondary" disabled={anyPending} onClick={reanalyseAll}>คำนวณ Layout ทั้งหมดใหม่ด้วย engine ปัจจุบัน</button></div>}
    {restored.sourceChanged && <div className="warning" role="alert"><p>มิติต้นทาง (legacy) ของแบบนี้เปลี่ยนไปหลังบันทึกร่าง ร่างยังใช้รูปทรงเดิมที่บันทึกไว้ ตรวจพิกัดก่อนใช้งานต่อ</p></div>}
    {initialElementType && model.elementType !== initialElementType && <div className="warning" role="alert"><p>ร่างที่บันทึกเป็น {model.elementType} แต่แบบนี้ถูกเลือกเป็น {initialElementType} ระบบใช้ร่างที่บันทึกไว้ก่อน</p>
      <button className="btn secondary" disabled={anyPending} onClick={() => edit('elementType', initialElementType)}>เปลี่ยนประเภทร่างเป็น {initialElementType}</button></div>}
    <div className="grid two"><div>
      <label className="field"><span>ประเภทองค์อาคาร</span><select value={model.elementType} onChange={e => edit('elementType', e.target.value as ElementType)}>
        {(['FOOTING', 'COLUMN', 'WALL', 'BEAM', 'SLAB'] as const).map(t => <option key={t}>{t}</option>)}
      </select></label>
      <label className="field"><span>จุดขอบคอนกรีตตามลำดับ [X,Y] · mm</span><textarea value={vertices} onChange={e => setVertices(e.target.value)}/></label>
      <button className="btn secondary" onClick={() => {try {
        const values: unknown = JSON.parse(vertices);
        if (!Array.isArray(values) || values.some(v => !Array.isArray(v) || v.length !== 2)) throw Error('ระบุรายการคู่พิกัด [X,Y]');
        const next = values.map(v => ({x: v[0], y: v[1]})); previewWorkflow({...model, vertices: next}); edit('vertices', next);
      } catch (e) {setError((e as Error).message);}}}>ตรวจและใช้พิกัด</button>
      <div className="form-grid">{numeric('heightMm', 'ความสูง/ความลึกคอนกรีต', 'mm')}{numeric('gammaKNm3', 'น้ำหนักคอนกรีตสด', 'kN/m³')}</div>
      <label className="field"><span>ระบบแบบข้าง</span><select value={model.sideTopology ?? ''} onChange={e => edit('sideTopology', (e.target.value || null) as WorkflowModel['sideTopology'])}>
        <option value="">ยังไม่ทราบ</option><option value="THROUGH_TIE">Through tie</option><option value="SEGMENTED_TIE">Inner / Outer tie</option><option value="COLUMN_YOKE">Column yoke / clamp</option><option value="GROUND_BRACED">Ground braced</option>
      </select></label>
      {(model.elementType === 'BEAM' || model.elementType === 'SLAB') && <div className="form-grid">
        {numeric('slabThicknessMm', 'ความหนาพื้น (คานแยกพื้นใส่ 0)', 'mm')}{numeric('additionalDeadKPa', 'Additional Dead Load', 'kPa')}{numeric('constructionLiveKPa', 'Construction Live Load', 'kPa')}
        {model.elementType === 'BEAM' && <>{numeric('beamWidthMm', 'ความกว้างคาน b', 'mm')}{numeric('concreteStripMm', 'แถบคอนกรีต Bc รวม b', 'mm')}{numeric('deadStripMm', 'แถบ DL', 'mm')}{numeric('liveStripMm', 'แถบ LL', 'mm')}</>}
      </div>}
      {(model.elementType === 'BEAM' || model.elementType === 'SLAB') && model.ringlock && <RinglockPlanFields config={model.ringlock} onChange={editRinglockPlan}/>}
      {(model.elementType === 'BEAM' || model.elementType === 'SLAB') && <RinglockResearchFields key={caseId} data={references.ringlockResearch} snapshot={model.ringlockResearch ?? null} onPendingChange={setSupplierPending} onChange={choice => {
        try {edit('ringlockResearch', selectRinglockResearch(references.ringlockResearch, references.ringlockResearchSha256, choice));} catch (e) {setError((e as Error).message);}
      }}/>}
      <label className="field"><span>อ้างอิงแบบ/มิติ</span><input value={model.sourceRef ?? ''} onChange={e => edit('sourceRef', e.target.value || null)}/></label>
      <label className="field"><span>Design Basis / Revision</span><input value={model.designBasisRef ?? ''} onChange={e => edit('designBasisRef', e.target.value || null)}/></label>
      <label className="confirm"><input type="checkbox" checked={model.humanInputReviewed} onChange={e => edit('humanInputReviewed', e.target.checked)}/>ตรวจข้อมูลกับต้นฉบับแล้ว (ยังไม่ใช่อนุมัติแบบ)</label>
    </div><div>
      <h3>ข้อมูลอ้างอิง Standard-reference</h3>
      <p>{references.sections.length} หน้าตัด · {references.materials.length} วัสดุ · {references.ringlock.length} อุปกรณ์ Ringlock · {references.checks.length} ข้อกำหนดตรวจ</p>
      <details aria-label="Closure Pack v1 reference status"><summary>Closure Pack v1 · data bridge / input templates · NO_GO</summary>
        <p>Form Tie {closureReferences.inventory.formTieRecordCount} records / {closureReferences.inventory.formTieCheckSlotCount} check slots · Ringlock sidecar {closureReferences.inventory.ringlockReferenceCount} exact references · input templates {Object.keys(closureReferences.templates).length}</p>
        <p>ข้อมูลนี้เป็น reference และแบบรับข้อมูลที่ยังไม่ยืนยัน; ไม่เติมกำลังชุดประกอบ, ไม่ทำ exact reference ให้เป็น configuration rating และไม่เปลี่ยนสถานะ `confirmed`</p>
      </details>
      {(['section', 'material', 'ringlock'] as const).map(key => {
        const rows = key === 'section' ? references.sections : key === 'material' ? references.materials : references.ringlock;
        const idKey = key === 'section' ? 'section_id' : key === 'material' ? 'material_id' : 'component_id';
        const current = model.selections[key];
        return <div key={key} aria-label={`ข้อมูลอ้างอิง ${key}`}><label className="field"><span>{key === 'section' ? 'หน้าตัด' : key === 'material' ? 'วัสดุ' : 'อุปกรณ์ Ringlock (ขนาด/มวล)'}</span><select disabled={!!referencePending[key]} value={String(current?.reference[idKey] ?? '')} onChange={e => {
          const row = rows.find(r => r[idKey] === e.target.value);
          edit('selections', {...model.selections, [key]: row ? selectReference(row, key === 'section' ? '0.4' : key === 'material' ? '0.5.0' : '0.7.0') : null});
        }}><option value="">ยังไม่เลือก</option>{rows.map(r => <option key={String(r[idKey])} value={String(r[idKey])} disabled={r.candidate_selectable === false}>
          {String(r.designation ?? r.label_th ?? r.label ?? r[idKey])}{r.candidate_selectable === false ? ' · ห้ามเลือก/รอตรวจ' : ' · Reference'}
        </option>)}</select></label>{current && <CustomReference key={`${caseId}:${String(current.reference[idKey])}`} selection={current} slot={key} onPendingChange={onReferencePending} onChange={next => edit('selections', {...model.selections, [key]: next})}/>}</div>;
      })}
      <p>ค่าจากรายการอ้างอิงยังไม่ใช่กำลังใช้งานที่อนุมัติ การเลือกอุปกรณ์ไม่ทำให้ระบบผ่าน</p>
      {analysis.preview && <><PairDrawing topology={analysis.preview.topology}/><p>{analysis.preview.topology.faces.length} ผิวจริง / {analysis.preview.topology.pairs.length} คู่ช่วงผิว · พื้นที่ {show(analysis.preview.topology.areaM2)} m²</p>
        {analysis.preview.verticalLoads && <table><tbody>{'listedServiceKPa' in analysis.preview.verticalLoads ? <>
          <tr><td>คอนกรีต</td><td>{show(analysis.preview.verticalLoads.concreteKPa)} kPa</td></tr>
          <tr><td>DL อื่น / LL ก่อสร้าง</td><td>{show(analysis.preview.verticalLoads.additionalDeadKPa)} / {show(analysis.preview.verticalLoads.constructionLiveKPa)} kPa</td></tr>
          <tr><td>รวมเฉพาะโหลดที่ระบุ</td><td>{show(analysis.preview.verticalLoads.listedServiceKPa)} kPa</td></tr></> : <>
          <tr><td>คอนกรีต</td><td>{show(analysis.preview.verticalLoads.concreteKNPerM)} kN/m</td></tr>
          <tr><td>DL อื่น / LL ก่อสร้าง</td><td>{show(analysis.preview.verticalLoads.additionalDeadKNPerM)} / {show(analysis.preview.verticalLoads.constructionLiveKNPerM)} kN/m</td></tr>
          <tr><td>รวมเฉพาะโหลดที่ระบุ</td><td>{show(analysis.preview.verticalLoads.listedServiceKNPerM)} kN/m</td></tr></>}
          <tr><td colSpan={2}>ยังต้องกำหนด Self-weight, โหลดเฉพาะจุด และ Load Combinations</td></tr>
        </tbody></table>}
        <details><summary>ข้อมูล/วิธีคำนวณที่ยังขาด ({analysis.preview.blockers.length})</summary><ul>{analysis.preview.blockers.map(b => <li key={b}>{b}</li>)}</ul></details>
      </>}
    </div></div>
    {(model.elementType === 'BEAM' || model.elementType === 'SLAB') && <SoffitLayoutEditor key={`soffit:${caseId}:${model.elementType}:${editorEpoch}`} layout={model.soffitLayout ?? null} selections={model.selections} beam={model.elementType === 'BEAM'} onApply={applySoffit} onPendingChange={setSoffitPending} onDraftChange={d => {pendingSoffit.current = d;}}/>}
    <LayoutCandidateEditor key={`candidate:${caseId}:${model.elementType}:${editorEpoch}`} model={model} sourcePending={candidateSourcePending} onPendingChange={setCandidatePending} onApply={applyCandidate}/>
    <LayoutCandidateSummary model={model}/>
    {analysis.preview && <SideLayoutEditor key={`side:${caseId}:${model.elementType}:${editorEpoch}`} topology={analysis.preview.topology} layout={model.sideLayout ?? null} selections={model.selections} segmentedTie={model.sideTopology === 'SEGMENTED_TIE'} revisionId={model.revisionId} onApply={applySide} onPendingChange={setSidePending} onDraftChange={d => {pendingSide.current = d;}}/>}
    {(model.elementType === 'BEAM' || model.elementType === 'SLAB') && <RinglockAssemblyEditor key={`assembly:${caseId}:${model.elementType}:${editorEpoch}`} assembly={model.ringlockAssembly ?? null}
      captureEnabled={!!analysis.preview?.loadPath && !geometryPending && !soffitPending && !sidePending && !framePending && !referencesPending && !supplierPending && !supportPending}
      onCapture={() => captureRinglockAssembly(model)} onApply={applyAssembly} onPendingChange={setAssemblyPending} onDraftChange={d => {pendingAssembly.current = d;}}/>}
    {<FrameLayoutEditor key={`frame:${caseId}:${model.elementType}:${editorEpoch}`} layout={model.frameLayout ?? null}
      referenceSnapshot={model.ringlockResearch ?? null}
      headIds={model.ringlock?.legs.map(l => l.headNodeId) ?? []} captureEnabled={!!model.soffitLayout && !!analysis.preview?.loadPath && !supportPending}
      onCapture={() => frameGeometryFromSoffit(model, analysis.preview?.loadPath?.reactions.filter(r => r.kind === 'U_HEAD') ?? [])}
      captureAssemblyEnabled={!!analysis.preview?.assembly?.frameGeometryReady && !assemblyPending && !soffitPending && !sidePending && !geometryPending && !referencesPending && !supplierPending && !supportPending}
      onCaptureAssembly={() => frameGeometryFromAssembly(model)}
      sideSources={(analysis.preview?.side?.nodes ?? []).filter(n => !analysis.preview?.side?.ties.some(t => t.a.id === n.id || t.b.id === n.id))}
      captureSideEnabled={!!analysis.preview?.side && (['COLUMN_YOKE', 'GROUND_BRACED'].includes(model.sideTopology ?? '') ? !model.sideLayout?.ties.length
        : ['THROUGH_TIE', 'SEGMENTED_TIE'].includes(model.sideTopology ?? '') && analysis.preview.side.nodes.some(n => !analysis.preview!.side!.ties.some(t => t.a.id === n.id || t.b.id === n.id))) && !geometryPending && !sidePending && !soffitPending && !assemblyPending && !referencesPending && !supplierPending && !supportPending}
      onCaptureSide={() => frameGeometryFromSide(model)}
      sideTieIds={model.sideLayout?.ties.map(t => t.id) ?? []}
      sideWalers={model.sideLayout?.faces.flatMap(f => f.walers.map(w => ({faceId: f.faceId, walerId: w.id}))) ?? []}
      onApply={applyFrame} onPendingChange={setFramePending} onDraftChange={d => {pendingFrame.current = d;}}/>}
    <SupportLayoutEditor key={`support:${caseId}:${model.elementType}:${editorEpoch}`} layout={model.supportLayout ?? null}
      baseIds={model.frameLayout?.nodes.filter(n => n.role === 'BASE').map(n => n.id) ?? []}
      frameWeightOwners={model.frameLayout?.additionalActions.filter(a => a.kind === 'SELF_WEIGHT').map(a => a.ownershipId) ?? []}
      captureEnabled={!!analysis.preview?.frame?.analysis && !geometryPending && !soffitPending && !sidePending && !framePending && !assemblyPending && !referencesPending && !supplierPending && !loadCasesPending && !stagePending && !coveragePending && !candidatePending}
      onCapture={() => {if (!analysis.preview?.frame) throw Error('ต้องมีผลเฟรมปัจจุบัน'); return captureSupportLayout(model, analysis.preview.frame);}}
      onApply={applySupport} onPendingChange={setSupportPending} onDraftChange={d => {pendingSupport.current = d;}}/>
    {analysis.preview && <SoffitResults model={model} preview={analysis.preview}/>}
    {analysis.preview && <SideResults model={model} preview={analysis.preview}/>}
    {analysis.preview && <FrameResults model={model} preview={analysis.preview}/>}
    {analysis.preview && <SupportResults model={model} preview={analysis.preview}/>}
    {analysis.preview && <RinglockAssemblyResults model={model} preview={analysis.preview}/>}
    <LoadCasesEditor key={`cases:${caseId}:${editorEpoch}`} book={model.loadCases ?? null} stages={[...new Set([model.soffitLayout?.stageId, model.sideLayout?.stageId, model.frameLayout?.stageId, model.supportLayout?.stageId, model.ringlockAssembly?.stageId].filter((s): s is string => !!s))]} onPendingChange={setLoadCasesPending} onApply={definition => {
      requireAppliedReferences();
      if (soffitPending || sidePending || framePending || supportPending || assemblyPending) throw Error('มีตำแหน่ง/เฟรม/การประกอบค้าง กรุณาวิเคราะห์หรือคืนค่าก่อนเก็บชุดกรณีโหลด');
      setModel(applyLoadCases(model, definition)); setError('');
    }}/>
    {analysis.preview && <LoadCasesResults preview={analysis.preview}/>}
    <StageStudyEditor key={`stages:${caseId}`} book={model.stageStudy ?? null} onPendingChange={setStagePending}
      onCapture={row => {requireStageSourceApplied(); return captureStage(model, row);}}
      onApply={definition => {requireStageSourceApplied(); setModel(applyStageStudy(model, definition)); setError('');}}
      onLoad={row => replaceStageEditor(loadStageForEditing(model, row))}
      onCopy={stageId => replaceStageEditor(copyToDraftStage(model, stageId))}
      onRemoveLayout={kind => replaceStageEditor(removeStageLayout(model, kind))}/>
    {analysis.preview && <StageStudyResults preview={analysis.preview}/>}
    {analysis.preview && <CoverageReviewEditor key={`coverage:${caseId}:${model.elementType}:${editorEpoch}`} model={model} preview={analysis.preview} onPendingChange={setCoveragePending} onApply={definition => {
      requireAppliedReferences();
      if (soffitPending || sidePending || framePending || supportPending || assemblyPending || loadCasesPending || stagePending) throw Error('มีข้อมูลตำแหน่งหรือเฟรมค้าง กรุณาวิเคราะห์หรือคืนค่าก่อนเก็บแผนตัวแทน');
      setModel(applyCoverageReview(model, definition)); setError('');
    }}/>}
    {analysis.preview && <CoverageReviewResults model={model} preview={analysis.preview}/>}
    {analysis.preview && <RinglockResearchSummary snapshot={model.ringlockResearch ?? null} summary={analysis.preview.ringlockReference}/>}
    {(error || analysis.error) && <p className="warning" role="alert">{error || analysis.error}</p>}
    {geometryPending && <p role="status">มีพิกัดที่ยังไม่ได้นำไปใช้ กรุณาตรวจและใช้พิกัดก่อนสร้างร่าง</p>}
    {soffitPending && <p role="status">มีตำแหน่งแบบท้องที่ยังไม่วิเคราะห์ กรุณาตรวจตำแหน่งและวิเคราะห์แรงก่อนสร้างร่าง</p>}
    {sidePending && <p role="status">มีแบบข้างที่ยังไม่นำไปวิเคราะห์ กรุณาตรวจแบบข้างก่อนสร้างร่าง</p>}
    {framePending && <p role="status">มีข้อมูลเฟรมที่ยังไม่ได้นำไปใช้ กรุณาเก็บข้อมูลและวิเคราะห์ หรือคืนค่าเฟรมก่อนสร้างร่าง</p>}
    {supportPending && <p role="status">มีข้อมูลรองรับฐานที่ยังไม่ได้นำไปใช้ กรุณาเก็บ/ตรวจทางถ่ายแรง หรือคืนค่าก่อนสร้างร่าง</p>}
    {assemblyPending && <p role="status">มีการประกอบ Ringlock ที่ยังไม่ได้นำไปใช้ กรุณาเก็บ/ตรวจ Datum หรือคืนค่าก่อนสร้างร่าง</p>}
    {loadCasesPending && <p role="status">มีชุดกรณีโหลดที่ยังไม่เก็บ กรุณาเก็บหรือคืนค่าก่อนสร้างร่าง</p>}
    {stagePending && <p role="status">มีข้อมูล Stage ที่ยังไม่เก็บ กรุณาเก็บหรือคืนค่าก่อนสร้างร่าง</p>}
    {coveragePending && <p role="status">มีแผนตัวแทนที่ยังไม่เก็บ กรุณาเก็บหรือคืนค่าก่อนสร้างร่าง</p>}
    {referencesPending && <p role="status">มีค่า Custom ที่ยังไม่ได้นำไปใช้ กรุณากดใช้หรือยกเลิกค่าที่กรอกก่อนสร้างร่าง</p>}
    {supplierPending && <p role="status">กำลังแก้ไขข้อมูลผู้จำหน่าย กรุณาบันทึกหรือยกเลิกก่อนสร้างร่าง</p>}
    <p>เมื่อกดวิเคราะห์ จะนำค่าที่กรอกค้างของแบบข้าง แบบท้อง เฟรม และรองรับฐานไปตรวจพร้อมกัน และคำนวณระบบในร่างซ้ำให้ใช้ Design Revision เดียวกัน เฟรมที่ข้อมูลไม่ครบเก็บเป็นร่าง BLOCKED ได้ โดยไม่สร้างผลแรงแทนข้อมูลที่ขาด</p>
    <div className="source-actions"><button className="btn" disabled={busy || !!analysis.error || anyPending} onClick={() => void freeze()}>สร้างรายการคำนวณและรูปคู่ด้านร่าง</button>
      <button className="btn secondary" disabled={!fresh || busy} onClick={download}>ดาวน์โหลดร่าง JSON</button></div>
    {snapshot && (!view || !fresh) && <p className="warning" role="status">STALE · มีค่าค้าง ข้อมูลเปลี่ยน หรือกำลังตรวจฉบับ กรุณาตรวจค่าค้างหรือสร้างร่างใหม่ก่อนดาวน์โหลด</p>}
    {view && <WorkflowDocuments view={view}/>}
  </section>;
}
