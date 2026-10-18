import {useEffect, useRef, useState} from 'react';
import {Upload} from 'lucide-react';
import {AiReadingReport} from './AiReadingReport';
import {DrawingChat} from './DrawingChat';
import {AI_PROVIDER_TIMEOUT_MS, AI_STEPS, type AiStage} from '../aiProgress';
import {aiExtract, configured, deleteUpload, subscribeUploads, uploadPreviewUrl, uploadSource, type UploadRecord} from '../firebase';
import {openSource, type PreparedSource, type SourceDocument} from '../sourceFiles';
import {AI_FIELD_LABEL, AI_KINDS, AI_KIND_LABEL, elementToCase, parseAiElements, type AiCase, type AiElement, type AiKind} from '../aiElements';
import type {Input} from '../domain';
import type {ModelChange} from '../domain/scene';

/** An uploaded drawing (and its AI reading) that stays open while the user moves between the cases created from it. */
export type ResumeDrawing = {storagePath: string; name: string; url: string; draft: Record<string, unknown> | null};
type Props = {
  model?: Input;
  onApplyChanges?: (changes: ModelChange[], note: string) => string | null;
  onCreateCases?: (cases: AiCase[]) => void;
  resume?: ResumeDrawing | null;
  onDrawingChange?: (drawing: ResumeDrawing | null) => void;
  stockIds?: string[];
  projectId: string;
  caseId: string;
  userId: string;
  canEdit?: boolean;
  saveProject: () => Promise<void>;
  onSourceChange: (name: string | null) => void;
  onPreviewChange?: (source: Pick<PreparedSource, 'name' | 'url'> | null) => void;
  onApplyDraft: (draft: Record<string, unknown>) => void;
  onManual: () => void;
};
// A source is either freshly prepared locally or re-opened from Firebase Storage (no local files).
type Source = Omit<PreparedSource, 'pageFile' | 'raw'> & Partial<Pick<PreparedSource, 'pageFile' | 'raw'>> & {storagePath?: string};
type Phase = 'idle' | 'opening' | 'rendering' | 'uploading' | 'analyzing';
const labels: Record<Phase, string> = {
  idle: '', opening: 'กำลังเปิดไฟล์…', rendering: 'กำลังเตรียมภาพหน้าแบบ…',
  uploading: 'กำลังอัปโหลดไฟล์…', analyzing: 'AI กำลังอ่านแบบ…',
};

function ElementPicker({draft, disabled, onCreate}: {draft: Record<string, unknown>; disabled: boolean; onCreate: (cases: AiCase[]) => void}) {
  let elements: AiElement[] = [];
  try {elements = parseAiElements(draft.elements);} catch {/* malformed legacy result: show the hint below */}
  const [selected, setSelected] = useState<number[]>([]);
  const [kinds, setKinds] = useState<Record<number, AiKind>>({});
  if (!elements.length) return <p className="muted">ผลนี้ยังไม่ได้แยกรายการองค์อาคาร กด “วิเคราะห์ด้วย AI” อีกครั้งเพื่อให้ AI สร้างรายการโมเดล</p>;
  const rows = elements.map((e, i) => {
    const kind: AiKind = kinds[i] ?? (e.kind === 'UNKNOWN' ? 'FOOTING' : e.kind);
    try {return {e, kind, ...elementToCase(e, kind), invalid: ''};} catch (reason) {return {e, kind, item: null, missing: [], invalid: reason instanceof Error ? reason.message : 'มิติไม่ถูกต้อง'};}
  });
  const ready = selected.filter(i => rows[i]?.item);
  return <section className="ai-elements" aria-label="รายการที่ AI พบสำหรับสร้างโมเดล">
    <h4>รายการที่ AI พบ → สร้างโมเดลจำลอง</h4>
    <table><thead><tr><th/><th>รายการ</th><th>ชนิด</th><th>ขนาด</th><th>สถานะ</th></tr></thead><tbody>
      {rows.map(({e, kind, item, missing, invalid}, i) => {
        const f = AI_FIELD_LABEL[kind];
        return <tr key={i}>
          <td><input type="checkbox" aria-label={`เลือก ${e.name}`} disabled={!item || disabled} checked={selected.includes(i)} onChange={ev => setSelected(s => ev.target.checked ? [...s, i] : s.filter(x => x !== i))}/></td>
          <td><b>{e.name}</b>{e.quantity ? ` ×${e.quantity}` : ''}{e.note && <small className="help">{e.note}</small>}</td>
          <td><select aria-label={`ชนิด ${e.name}`} value={kind} disabled={disabled} onChange={ev => setKinds(k => ({...k, [i]: ev.target.value as AiKind}))}>{AI_KINDS.map(k => <option key={k} value={k}>{AI_KIND_LABEL[k]}</option>)}</select>{e.kind === 'UNKNOWN' && <small className="help">AI ไม่ระบุชนิด</small>}</td>
          <td>{e.shape === 'L' ? 'L ' : ''}{f.width} {e.width ?? '?'} × {f.length} {e.length ?? '?'} × {f.height} {e.height ?? '?'}{kind === 'BEAM' ? ` · พื้น ${e.slabThickness ?? '—'}` : ''} {e.unit === 'UNKNOWN' ? '(?)' : e.unit}
            {item?.notes.map(n => <small key={n} className="help">{n}</small>)}</td>
          <td>{item ? <span className="pill approved">พร้อมสร้าง</span> : <span className="pill amber">{invalid || 'ขาด ' + missing.join(', ')}</span>}</td>
        </tr>;
      })}
    </tbody></table>
    <p className="notice">โมเดลที่สร้างใช้ค่าวัสดุอ้างอิงและระยะเริ่มต้นของแอป (แก้ไขได้ในเมนู Design Criteria / จัดวางเบื้องต้น) และยังไม่ยืนยันมิติ รายการที่ขาดมิติให้ถามใน “สนทนากับ AI” หรือป้อนเอง</p>
    <button className="btn" disabled={disabled || !ready.length} onClick={() => onCreate(ready.map(i => rows[i].item!))}>
      สร้างโมเดลจากรายการที่เลือก ({ready.length})</button>
  </section>;
}

export function SourceUpload(props: Props) {
  const [source, setSource] = useState<Source | null>(() => props.resume ? {name: props.resume.name, url: props.resume.url, text: '', pageNumber: 1, pageCount: 1, storagePath: props.resume.storagePath} : null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [page, setPage] = useState('1');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Record<string, unknown> | null>(() => props.resume?.draft ?? null);
  const [aiStage, setAiStage] = useState<AiStage | null>(null);
  const [aiFailed, setAiFailed] = useState(false);
  const [aiSeconds, setAiSeconds] = useState(0);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const progressPanel = useRef<HTMLElement>(null);
  const documentRef = useRef<SourceDocument | null>(null);
  const operation = useRef(0);
  const locked = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const busy = phase !== 'idle';
  const canEdit = props.canEdit !== false;
  const pageNumber = Number(page);
  const validPage = !!source && Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= source.pageCount;
  useEffect(() => {
    if (phase !== 'analyzing') return;
    progressPanel.current?.scrollIntoView?.({behavior: 'smooth', block: 'start'});
    const started = Date.now();
    const timer = setInterval(() => setAiSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => {setAiStage(null); setAiFailed(false);}, [source?.storagePath, source?.url]);
  const onDrawingChange = props.onDrawingChange;
  useEffect(() => {
    onDrawingChange?.(source?.storagePath ? {storagePath: source.storagePath, name: source.name, url: source.url, draft} : null);
  }, [source?.storagePath, source?.url, draft, onDrawingChange]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current++;
      abort.current?.abort();
      void documentRef.current?.destroy();
    };
  }, []);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source?.url]);
  // The upload list comes from Firestore, so it survives menu changes, reloads and project switches.
  useEffect(() => {
    if (!configured || !props.userId) return;
    try { return subscribeUploads(props.projectId, next => { setUploads(next); setHistoryError(''); }, reason => setHistoryError(reason.message)); }
    catch (reason) { setHistoryError(reason instanceof Error ? reason.message : 'โหลดรายการไฟล์ไม่สำเร็จ'); }
  }, [props.projectId, props.userId]);

  const current = (id: number) => alive.current && id === operation.current;
  function begin(next: Phase) {
    if (locked.current) return null;
    locked.current = true;
    const id = ++operation.current;
    setError('');
    setPhase(next);
    abort.current = new AbortController();
    return id;
  }
  function finish(id: number) {
    if (!current(id)) return;
    locked.current = false;
    setPhase('idle');
  }
  function fail(id: number, reason: unknown) {
    if (current(id)) setError(reason instanceof Error ? reason.message : 'ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง');
  }

  async function transfer(prepared: PreparedSource, id: number) {
    if (!configured || !canEdit || !current(id)) return;
    setPhase('uploading');
    setProgress(0);
    // Save the project before creating a source record or calling the server.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        props.saveProject(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error('บันทึกโครงการก่อนอัปโหลดไม่สำเร็จภายใน 20 วินาที กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง')), 20_000);
        }),
      ]);
    } finally { clearTimeout(timer); }
    if (!current(id)) return;
    const result = await uploadSource(props.projectId, prepared.pageFile, props.caseId, prepared.raw, {
      signal: abort.current?.signal,
      onProgress: value => { if (current(id)) setProgress(value); },
    });
    if (current(id)) setSource({...prepared, storagePath: result.path});
  }

  async function selectFile(file: File) {
    if (!canEdit) return;
    const id = begin('opening');
    if (id === null) return;
    setDraft(null);
    try {
      const nextDocument = await openSource(file);
      if (!current(id)) { await nextDocument.destroy(); return; }
      const previousDocument = documentRef.current;
      documentRef.current = nextDocument;
      setSource(null);
      props.onSourceChange(null);
      props.onPreviewChange?.(null);
      await previousDocument?.destroy();
      if (!current(id)) return;
      setPhase('rendering');
      const prepared = await nextDocument.renderPage(1);
      if (!current(id)) { URL.revokeObjectURL(prepared.url); return; }
      setSource(prepared);
      setPage('1');
      props.onSourceChange(prepared.name);
      props.onPreviewChange?.(prepared);
      // Multi-page documents are previewed locally until the user chooses a page.
      if (prepared.pageCount === 1) await transfer(prepared, id);
    } catch (reason) { fail(id, reason); }
    finally { finish(id); }
  }

  async function showPage() {
    if (!documentRef.current || !validPage || pageNumber === source?.pageNumber) return;
    const id = begin('rendering');
    if (id === null) return;
    try {
      const prepared = await documentRef.current.renderPage(pageNumber);
      if (!current(id)) { URL.revokeObjectURL(prepared.url); return; }
      setSource(prepared);
      setDraft(null);
      props.onSourceChange(prepared.name);
      props.onPreviewChange?.(prepared);
    } catch (reason) { fail(id, reason); }
    finally { finish(id); }
  }

  async function retryUpload() {
    if (!canEdit || !source || source.storagePath || !source.pageFile || !source.raw) return;
    const local = source as PreparedSource;
    const id = begin('uploading');
    if (id === null) return;
    try { await transfer(local, id); }
    catch (reason) { fail(id, reason); }
    finally { finish(id); }
  }

  async function removeUpload(record: UploadRecord) {
    if (!canEdit) return;
    if (!window.confirm(`ลบไฟล์ “${record.originalFilename}” ออกจากโครงการและ Firebase Storage อย่างถาวร?`)) return;
    setDeletingId(record.id);
    setError('');
    try {
      await deleteUpload(props.projectId, record.id);
      if (alive.current && source?.storagePath === record.path) {
        setSource(null);
        setDraft(null);
        props.onSourceChange(null);
        props.onPreviewChange?.(null);
      }
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'ลบไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง'); }
    finally { if (alive.current) setDeletingId(null); }
  }

  async function openUpload(record: UploadRecord) {
    const id = begin('opening');
    if (id === null) return;
    try {
      const url = await uploadPreviewUrl(record.path);
      if (!current(id)) return;
      const previousDocument = documentRef.current;
      documentRef.current = null;
      await previousDocument?.destroy();
      if (!current(id)) return;
      setSource({name: record.originalFilename, url, text: '', pageNumber: 1, pageCount: 1, storagePath: record.path});
      setPage('1');
      setDraft(record.analysis?.draft ?? null);
      props.onSourceChange(record.originalFilename);
      props.onPreviewChange?.({name: record.originalFilename, url});
    } catch (reason) { fail(id, reason); }
    finally { finish(id); }
  }

  async function analyze() {
    if (!canEdit || !source?.storagePath) return;
    const id = begin('analyzing');
    if (id === null) return;
    setDraft(null);
    setAiStage('connecting'); setAiFailed(false); setAiSeconds(0);
    try {
      const output = await aiExtract(props.projectId, source.storagePath, stage => {if (current(id)) setAiStage(stage);}) as {draft?: Record<string, unknown>};
      if (!output.draft || typeof output.draft !== 'object' || Array.isArray(output.draft)) throw Error('AI ส่งผลลัพธ์ไม่สมบูรณ์ กรุณาลองอีกครั้ง');
      if (current(id)) {setDraft(output.draft); setAiStage('complete');}
    } catch (reason) { if (current(id)) setAiFailed(true); fail(id, reason); }
    finally { finish(id); }
  }

  function cancelUpload() {
    operation.current++;
    abort.current?.abort();
    locked.current = false;
    setPhase('idle');
    setError('ยกเลิกการอัปโหลดแล้ว ภาพตัวอย่างยังอยู่ในหน้านี้ สามารถลองอัปโหลดอีกครั้งได้');
  }

  return <div className="source-workspace">
    <input ref={picker} aria-label="เลือกไฟล์แบบ PDF หรือรูปภาพ" type="file" accept=".pdf,.png,.jpg,.jpeg" hidden disabled={busy || !canEdit}
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void selectFile(file); }}/>
    <section className="upload-zone" aria-busy={busy}
      onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); if (canEdit && !busy && event.dataTransfer.files[0]) void selectFile(event.dataTransfer.files[0]); }}>
      <Upload size={32}/><h2>เพิ่มแบบ PDF หรือภาพสเก็ตช์</h2>
      <p>ลากไฟล์มาวาง หรือเลือก PDF · PNG · JPEG ขนาดไม่เกิน 20 MB</p>
      <button className="btn" disabled={busy || !canEdit} onClick={() => picker.current?.click()}>{source ? 'เลือกไฟล์ใหม่' : 'เลือกไฟล์'}</button>
    </section>
    {busy && <div className="source-progress" role="status" aria-live="polite">
      <span>{labels[phase]}{phase === 'uploading' ? ` ${Math.round(progress)}%` : ''}</span>
      {phase === 'uploading' && <><progress aria-label="ความคืบหน้าการอัปโหลด" max={100} value={progress}/><button className="btn secondary" onClick={cancelUpload}>ยกเลิกอัปโหลด</button></>}
    </div>}
    {error && <div className="warning" role="alert">{error}</div>}
    {aiStage && <section ref={progressPanel} className="card ai-progress" aria-label="ขั้นตอนวิเคราะห์ AI" aria-busy={phase === 'analyzing'}>
      <h3>ขั้นตอนวิเคราะห์ AI</h3>
      <p role="status" aria-live="polite">{aiFailed ? 'ไม่สำเร็จที่ขั้นตอน: ' : phase === 'analyzing' ? 'กำลังดำเนินการ: ' : ''}{AI_STEPS.find(step => step.id === aiStage)?.label} · {aiSeconds} วินาที</p>
      {phase === 'analyzing' && aiStage === 'analyzing' && <p className="muted">ระดับการคิดสูงหรือ Prompt ยาวอาจใช้เวลาหลายนาที ระบบรอคำตอบ AI ได้สูงสุด {AI_PROVIDER_TIMEOUT_MS / 60000} นาที</p>}
      <ol>{AI_STEPS.map((step, index) => {
        const position = AI_STEPS.findIndex(item => item.id === aiStage);
        const done = index < position || aiStage === 'complete';
        const active = step.id === aiStage && !done;
        return <li key={step.id} className={done ? 'done' : active ? aiFailed ? 'failed' : 'active' : ''} aria-current={active ? 'step' : undefined}>
          <span aria-hidden="true">{done ? '✓' : active && aiFailed ? '!' : index + 1}</span><div>{step.label}<small>{done ? 'เสร็จแล้ว' : active ? aiFailed ? 'ไม่สำเร็จ' : 'กำลังทำงาน' : 'รอดำเนินการ'}</small></div>
        </li>;
      })}</ol>
    </section>}
    {configured && <section className="card upload-history" aria-label="ไฟล์ที่อัปโหลดแล้ว">
      <h3>ไฟล์ที่อัปโหลดแล้วของโครงการนี้ <small>({uploads.length})</small></h3>
      {historyError && <p className="muted">โหลดรายการไฟล์ไม่สำเร็จ: {historyError}</p>}
      {!historyError && !uploads.length && <p className="muted">ยังไม่มีไฟล์ที่อัปโหลดในโครงการนี้</p>}
      {!!uploads.length && <ul className="upload-history-list">{uploads.map(item => <li key={item.id} className={item.path === source?.storagePath ? 'current' : ''}>
        <div>
          <b>{item.originalFilename}</b>
          <small>{item.createdAt ? new Date(item.createdAt).toLocaleString('th-TH') : 'กำลังบันทึก…'} · {Math.max(1, Math.round(item.size / 1024))} KB{item.caseId === props.caseId ? ' · แบบนี้' : ''}</small>
          {item.analysis ? <span className="pill approved">AI วิเคราะห์แล้ว · {item.analysis.provider} {item.analysis.model}</span> : <span className="pill amber">ยังไม่ได้วิเคราะห์</span>}
        </div>
        <div className="upload-history-actions">
          <button className="btn secondary" disabled={busy || !!deletingId || item.path === source?.storagePath} onClick={() => void openUpload(item)}>{item.path === source?.storagePath ? 'กำลังแสดง' : 'เปิดดู'}</button>
          {canEdit && <button className="btn secondary danger" disabled={busy || !!deletingId} onClick={() => void removeUpload(item)}>{deletingId === item.id ? 'กำลังลบ…' : 'ลบ'}</button>}
        </div>
      </li>)}</ul>}
    </section>}
    {source && <div className="grid two">
      <section className="card source-preview">
        <h3>{source.name}</h3>
        {source.pageCount > 1 && <div className="source-page-controls">
          <label className="field"><span>เลือกหน้า PDF (1–{source.pageCount})</span><input type="number" min={1} max={source.pageCount} step={1} value={page} disabled={busy} onChange={event => setPage(event.target.value)}/></label>
          <button className="btn secondary" disabled={busy || !validPage || pageNumber === source.pageNumber} onClick={() => void showPage()}>แสดงหน้านี้</button>
          {!validPage && <p role="alert">ระบุเลขหน้าตั้งแต่ 1 ถึง {source.pageCount}</p>}
        </div>}
        <p className="muted">ภาพที่เลือก: หน้า {source.pageNumber} / {source.pageCount}</p>
        <img className="source-image" src={source.url} alt={`แบบ ${source.name} หน้า ${source.pageNumber}`}/>
        {source.text && <details><summary>ข้อความจาก PDF</summary><p>{source.text}</p></details>}
      </section>
      <section className="card">
        <h3>AI อ่านแบบ → สร้างโมเดล → คุยปรับแก้</h3>
        <ol className="ai-flow"><li>อัปโหลดหน้าแบบ</li><li>AI แยกรายการฐานราก/เสาและมิติ</li><li>เลือกรายการเพื่อสร้างโมเดลจำลอง 3D</li><li>สั่งปรับโมเดลผ่าน “สนทนากับ AI” แล้วกดยืนยัน</li></ol>
        <p className="source-status" role="status">{source.storagePath ? 'บันทึกไฟล์เข้า Firebase Storage แล้ว' : 'ภาพตัวอย่างพร้อมแล้ว · ยังไม่ได้บันทึกขึ้นคลาวด์'}</p>
        <p>ส่งภาพหน้าที่เลือกให้ AI อ่านรายการ รูปทรงและมิติ ผลลัพธ์เป็นร่างที่ต้องตรวจเทียบกับต้นฉบับก่อนใช้</p>
        {!configured && <p className="notice">โหมดออฟไลน์: ดูแบบและป้อนมิติได้ ตั้งค่า Firebase เพื่ออัปโหลดและใช้ AI</p>}
        <div className="source-actions">
          {!source.storagePath && configured && <button className="btn" disabled={busy || !canEdit || !props.userId} onClick={() => void retryUpload()}>อัปโหลดหน้าที่แสดง{error ? 'อีกครั้ง' : ''}</button>}
          <button className="btn" disabled={busy || !canEdit || !props.userId || !source.storagePath || !configured} onClick={() => void analyze()}>วิเคราะห์ด้วย AI</button>
          <button className="btn secondary" onClick={props.onManual}>ป้อน / ตรวจมิติด้วยตนเอง</button>
        </div>
        <p className="muted">การวิเคราะห์ทำงานผ่าน Cloud Function และส่งภาพที่เลือกไปยังค่าย AI ที่ MasterAdmin ตั้งไว้ใน จัดการ User → Manage API</p>
        {draft && <>
          <h3>ผลการอ่านแบบ (ร่าง)</h3>
          <AiReadingReport draft={draft}/>
          <p>รูปทรง: {draft.shape === 'RECTANGLE' ? 'สี่เหลี่ยม' : draft.shape === 'L' ? 'ตัว L' : 'ยังระบุไม่ได้'} · หน่วย: {['mm', 'cm', 'm'].includes(String(draft.unit)) ? String(draft.unit) : 'ยังระบุไม่ได้'}</p>
          <table aria-label="มิติที่ AI อ่านได้"><thead><tr><th>มิติ</th><th>ค่าที่อ่านได้</th></tr></thead><tbody>
            {Object.entries({width: 'ความกว้าง', length: 'ความยาว', height: 'ความสูง / ความลึก', armX: 'แขน X', armY: 'แขน Y'}).map(([key, label]) => <tr key={key}><td>{label}</td><td>{typeof draft[key] === 'number' ? String(draft[key]) : 'ไม่ทราบ — ตรวจจากต้นฉบับ'}</td></tr>)}
          </tbody></table>
          <p className="notice">ตรวจหน่วยและมิติเทียบกับภาพก่อนยืนยัน ช่องที่อ่านไม่ได้จะคงค่าเดิมในฟอร์ม ต้องตรวจแก้เอง</p>
          <button className="btn" disabled={busy || !canEdit} onClick={() => props.onApplyDraft(draft)}>ใช้เป็นมิติร่างเพื่อแก้ไข</button>
          {props.onCreateCases && <ElementPicker key={JSON.stringify(draft.elements ?? null)} draft={draft} disabled={busy || !canEdit} onCreate={props.onCreateCases}/>}
        </>}
      </section>
    </div>}
    <DrawingChat key={`${props.userId}:${props.projectId}:${props.caseId}:${source?.storagePath ?? ''}`} projectId={props.projectId} path={source?.storagePath} sourceName={source?.name} disabled={!canEdit || !props.userId || busy} model={props.model} onApplyChanges={props.onApplyChanges} stockIds={props.stockIds}/>
  </div>;
}
