import {useEffect, useRef, useState} from 'react';
import {Check, MessageSquare, Minus, Send} from 'lucide-react';
import {aiDrawingChat, configured} from '../firebase';
import {validateChatReply, type DrawingChatMessage} from '../drawingChat';
import type {Input} from '../domain';
import {FIELD_DOC, type ModelChange} from '../domain/scene';

type Props = {projectId: string; path?: string; sourceName?: string; disabled: boolean;
  model?: Input; onApplyChanges?: (changes: ModelChange[], note: string) => string | null; stockIds?: string[]};
/** Quick prompts that make the AI use the app's recalculated optimizer results (Part 2) inside the conversation. */
export const QUICK_PROMPTS = ['ช่วยเสนอทางเลือกที่ทำให้ทุกรายการไม่เกินเกณฑ์ และบอกเหตุผลที่แนะนำ', 'อธิบายรายการที่เกินเกณฑ์และวิธีแก้แต่ละรายการ', 'ขอทางเลือกที่ใช้เหล็กน้อยที่สุดโดยไม่เปลี่ยนความหนาไม้อัด'];

export function DrawingChat({projectId, path, sourceName, disabled, model, onApplyChanges, stockIds}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<DrawingChatMessage[]>([]);
  const [applied, setApplied] = useState<number[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  function minimize() {
    setExpanded(false);
    launcher.current?.focus();
  }
  useEffect(() => {
    if (expanded) panel.current?.focus();
  }, [expanded]);
  async function send(text = input) {
    if (locked.current || disabled || !path || !text.trim() || !configured) return;
    locked.current = true; setBusy(true); setError('');
    const next: DrawingChatMessage[] = [...messages, {role: 'user', text: text.trim()}];
    try {
      const reply = validateChatReply(await aiDrawingChat(projectId, path, next.slice(-20), model, stockIds));
      setMessages([...next, {role: 'assistant', ...reply}]); setInput('');
    } catch (reason) {setError(reason instanceof Error ? reason.message : 'ส่งข้อความไม่สำเร็จ กรุณาลองอีกครั้ง');}
    finally {locked.current = false; setBusy(false);}
  }
  function apply(index: number, changes: ModelChange[]) {
    if (!onApplyChanges) return;
    const request = messages.slice(0, index).reverse().find(m => m.role === 'user')?.text ?? 'แก้ไขจาก AI';
    const failure = onApplyChanges(changes, request.slice(0, 120));
    if (failure) setError('ใช้การแก้ไขไม่ได้: ' + failure);
    else {setError(''); setApplied(list => [...list, index]);}
  }
  return <>
    <button ref={launcher} className="btn chat-launcher" onClick={() => expanded ? minimize() : setExpanded(true)} aria-expanded={expanded} aria-controls="drawing-chat-popup" aria-haspopup="dialog">
      <MessageSquare size={20}/>{busy ? 'AI กำลังตอบ…' : 'สนทนากับ AI'}
    </button>
    <section ref={panel} id="drawing-chat-popup" className="card drawing-chat" role="dialog" aria-labelledby="drawing-chat-title" hidden={!expanded} tabIndex={-1} onKeyDown={event => {if (event.key === 'Escape') {event.stopPropagation(); minimize();}}}>
      <header className="chat-popup-header">
        <h3 id="drawing-chat-title"><MessageSquare size={20}/> สนทนากับ AI</h3>
        <button type="button" className="chat-minimize" onClick={minimize} aria-label="ย่อช่องสนทนา"><Minus size={18}/> ย่อ</button>
      </header>
    <div id="drawing-chat-body">
      <p className="muted">ถามเรื่องแบบ หรือสั่งปรับโมเดลจำลอง · {sourceName || 'ยังไม่ได้เลือกแบบ'}{model ? ` · โมเดลปัจจุบัน ${model.width}×${model.length}×${model.height} mm` : ''}</p>
      <div className="chat-messages" role="log" aria-label="ประวัติสนทนา" aria-live="polite">
        {!messages.length && <p className="chat-empty">เช่น “ช่วยอธิบายมิติที่อ่านไม่ชัด” หรือ “เปลี่ยนความลึกเป็น 1200 มม. และระยะคร่าว 250”</p>}
        {messages.map((message, index) => <article key={index} className={`chat-message ${message.role}`}>
          <b>{message.role === 'user' ? 'คุณ' : 'AI'}</b>{message.text && <p>{message.text}</p>}
          {message.attachments?.map((file, i) => <div className="chat-attachment" key={i}>
            {file.mimeType.startsWith('image/') && <img src={file.url} alt={file.name} loading="lazy" referrerPolicy="no-referrer"/>}
            {file.mimeType.startsWith('video/') && <video controls preload="none" src={file.url} aria-label={file.name}/>}
            <a href={file.url} target="_blank" rel="noopener noreferrer">เปิด / ดาวน์โหลด {file.name}</a><small>{file.mimeType}</small>
          </div>)}
          {!!message.changes?.length && <div className="chat-changes" aria-label="ข้อเสนอแก้ไขโมเดล">
            <table><thead><tr><th>ค่า</th><th>ปัจจุบัน</th><th>เสนอ</th></tr></thead><tbody>
              {message.changes.map(c => <tr key={c.field}><td title={FIELD_DOC[c.field]}>{c.field}<small>{FIELD_DOC[c.field]}</small></td><td>{model ? String(model[c.field]) : '—'}</td><td><b>{String(c.value)}</b></td></tr>)}
            </tbody></table>
            {applied.includes(index) ? <p className="source-status"><Check size={14}/> ใช้กับโมเดลแล้ว</p>
              : <button className="btn" disabled={disabled || !onApplyChanges} onClick={() => apply(index, message.changes!)}>ใช้การแก้ไขนี้กับโมเดล</button>}
          </div>}
        </article>)}
        {busy && <p role="status">AI กำลังตอบ… อาจใช้เวลาสูงสุด 5 นาที</p>}
      </div>
      <p className="muted">AI เสนอค่าแก้เป็นตาราง ต้องกดยืนยันก่อนเปลี่ยนโมเดล · แก้มิติแล้วต้องยืนยันรูปทรงใหม่ · คำตอบเป็นร่างสำหรับตรวจสอบ</p>
      {model && <div className="chat-quick" aria-label="คำสั่งด่วนให้ AI ใช้ระบบแนะนำปรับแก้">{QUICK_PROMPTS.map(q => <button key={q} type="button" className="btn secondary" disabled={busy || disabled || !path || !configured} onClick={() => void send(q)}>{q}</button>)}</div>}
      {!path && <p className="notice">เลือกและอัปโหลดหน้าแบบก่อนเริ่มสนทนา</p>}
      {!configured && <p className="notice">ตั้งค่า Firebase และ API ใน Admin เพื่อเริ่มสนทนา</p>}
      {error && <p className="warning" role="alert">{error}</p>}
      <form onSubmit={event => {event.preventDefault(); void send();}} className="chat-composer">
        <textarea aria-label="ข้อความถึง AI" placeholder="สอบถามหรือสั่งปรับโมเดล…" maxLength={6000} rows={3} value={input} onChange={event => setInput(event.target.value)} disabled={busy || disabled || !path || !configured}/>
        <button className="btn" type="submit" disabled={busy || disabled || !path || !configured || !input.trim()}><Send size={16}/>{busy ? 'กำลังส่ง…' : 'ส่งข้อความ'}</button>
      </form>
    </div>
    </section>
  </>;
}
