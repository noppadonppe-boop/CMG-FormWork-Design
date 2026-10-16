import {useEffect, useState} from 'react';
import {AI_PROVIDERS, getAiSettings, saveAiSettings, type AiProvider, type AiSettingsPublic} from '../firebase';
import {AI_EFFORT_LABELS, AI_MODEL_GROUPS, AI_MODEL_OPTIONS, AI_MODELS_VERIFIED_ON, aiEffortSettingOptions, defaultAiEffortSetting, type AiEffortSetting} from '../aiModels';

const META: Record<AiProvider, {label: string; vendor: string; placeholder: string}> = {
  openai: {label: 'OpenAI', vendor: 'ChatGPT / GPT', placeholder: 'sk-…'},
  google: {label: 'Google', vendor: 'Gemini', placeholder: 'AIza…'},
  anthropic: {label: 'Anthropic', vendor: 'Claude', placeholder: 'sk-ant-…'},
};

type Form = Record<AiProvider, {model: string; effort: AiEffortSetting; apiKey: string; clearKey: boolean}>;

function toForm(settings: AiSettingsPublic): Form {
  return Object.fromEntries(AI_PROVIDERS.map(name => [name, {model: settings.providers[name].model, effort: settings.providers[name].effort, apiKey: '', clearKey: false}])) as Form;
}

function customModelsFor(settings: AiSettingsPublic) {
  return Object.fromEntries(AI_PROVIDERS.map(name => [name, !AI_MODEL_OPTIONS[name].includes(settings.providers[name].model)])) as Record<AiProvider, boolean>;
}

export function ApiSettingsPanel() {
  const [settings, setSettings] = useState<AiSettingsPublic | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [customModels, setCustomModels] = useState<Record<AiProvider, boolean>>({openai: false, google: false, anthropic: false});
  const [active, setActive] = useState<AiProvider>('openai');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getAiSettings().then(next => {
      if (cancelled) return;
      setSettings(next); setForm(toForm(next)); setActive(next.activeProvider);
      setPrompt(next.prompt ?? '');
      setCustomModels(customModelsFor(next));
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'โหลดการตั้งค่า API ไม่สำเร็จ'); });
    return () => { cancelled = true; };
  }, []);

  function patch(name: AiProvider, change: Partial<Form[AiProvider]>) {
    setForm(current => current && {...current, [name]: {...current[name], ...change}});
  }

  async function save() {
    if (!form) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const next = await saveAiSettings({
        prompt,
        activeProvider: active,
        providers: Object.fromEntries(AI_PROVIDERS.map(name => [name, {
          model: form[name].model.trim(),
          effort: form[name].effort,
          ...(form[name].apiKey.trim() ? {apiKey: form[name].apiKey.trim()} : {}),
          ...(form[name].clearKey ? {clearKey: true} : {}),
        }])) as Parameters<typeof saveAiSettings>[0]['providers'],
      });
      setSettings(next); setForm(toForm(next)); setActive(next.activeProvider);
      setPrompt(next.prompt ?? '');
      setCustomModels(customModelsFor(next));
      setMessage(`บันทึกแล้ว · ปุ่ม “วิเคราะห์ด้วย AI” จะใช้ ${META[next.activeProvider].label} (${next.providers[next.activeProvider].model} · ${next.providers[next.activeProvider].effort})`);
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกการตั้งค่า API ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  if (!form || !settings) return <section className="card api-panel">{error ? <div className="warning">{error}</div> : <p className="muted">กำลังโหลดการตั้งค่า API…</p>}</section>;
  const activeHasKey = (settings.providers[active].hasKey && !form[active].clearKey) || !!form[active].apiKey.trim();

  return <section className="api-panel">
    <div className="admin-heading"><div><span className="option-tag">AI PROVIDER · MANAGE API</span><h2>Manage API</h2><p>กรอก API Key และโมเดลของแต่ละค่าย แล้วเลือกค่ายที่ให้ปุ่ม “วิเคราะห์ด้วย AI” ใช้งาน · Key เก็บใน Firebase และแสดงที่หน้านี้เฉพาะสถานะ/ตัวอักษรท้ายที่ปิดบังไว้</p></div></div>
    <p className="muted">รายชื่อโมเดลสำหรับอ่านภาพ · ตรวจสอบล่าสุด {AI_MODELS_VERIFIED_ON}</p>
    {message && <div className="notice">{message}</div>}{error && <div className="warning" role="alert">{error}</div>}
    <div className="api-grid">
      {AI_PROVIDERS.map(name => {
        const info = META[name], state = settings.providers[name], value = form[name];
        return <article key={name} className={`card api-card ${active === name ? 'selected' : ''}`}>
          <header>
            <div><h3>{info.label}</h3><small>{info.vendor}</small></div>
            <label className="check-chip"><input type="radio" name="active-provider" checked={active === name} onChange={() => setActive(name)}/>ใช้วิเคราะห์</label>
          </header>
          <span className={`pill ${state.hasKey && !value.clearKey ? 'approved' : 'amber'}`}>{value.clearKey ? 'จะลบ Key เมื่อบันทึก' : state.hasKey ? `มี Key แล้ว ${state.keyHint}` : 'ยังไม่มี Key'}</span>
          <label className="field"><span>API Key</span>
            <input type="password" autoComplete="off" spellCheck={false} placeholder={state.hasKey ? 'เว้นว่างไว้เพื่อใช้ Key เดิม' : info.placeholder} value={value.apiKey} onChange={e => patch(name, {apiKey: e.target.value, clearKey: false})}/>
          </label>
          <label className="field"><span>โมเดล ({AI_MODEL_OPTIONS[name].length} ตัวเลือก)</span>
            <select aria-label={`โมเดล ${info.label}`} disabled={busy} value={customModels[name] ? '__custom__' : value.model} onChange={e => {
              const custom = e.target.value === '__custom__';
              setCustomModels(current => ({...current, [name]: custom}));
              if (!custom) patch(name, {model: e.target.value, effort: defaultAiEffortSetting(name, e.target.value)});
            }}>
              {AI_MODEL_GROUPS[name].map(group => <optgroup key={group.label} label={group.label}>{group.models.map(model => <option key={model} value={model}>{model}{model === settings.defaultModels[name] ? ' · แนะนำ' : ''}</option>)}</optgroup>)}
              <option value="__custom__">กรอกชื่อโมเดลเอง…</option>
            </select>
            <small className="help">เลือกโมเดลสำหรับอ่านภาพ หรือเลือกกรอกชื่อโมเดลเอง</small>
            {(value.model !== settings.defaultModels[name] || customModels[name]) && <button type="button" className="link-btn" disabled={busy} onClick={() => {
              setCustomModels(current => ({...current, [name]: false}));
              patch(name, {model: settings.defaultModels[name], effort: defaultAiEffortSetting(name, settings.defaultModels[name])});
            }}>ใช้โมเดลแนะนำ {settings.defaultModels[name]}</button>}
          </label>
          {customModels[name] && <label className="field"><span>ชื่อโมเดล {info.label}</span><input disabled={busy} placeholder={settings.defaultModels[name]} value={value.model} onChange={e => patch(name, {model: e.target.value})}/></label>}
          <label className="field"><span>ระดับการคิดของโมเดล</span>
            <select aria-label={`ระดับการคิด ${info.label}`} disabled={busy} value={value.effort} onChange={e => patch(name, {effort: e.target.value as AiEffortSetting})}>
              {aiEffortSettingOptions(name, value.model).map(effort => <option key={effort} value={effort}>{AI_EFFORT_LABELS[effort]}{effort === defaultAiEffortSetting(name, value.model) ? ' · แนะนำ' : ''}</option>)}
            </select>
            <small className="help">ค่าจริงจะถูกส่งตามชื่อที่ API ของ {info.label} รองรับสำหรับโมเดลนี้</small>
          </label>
          {state.hasKey && <button type="button" className="text-btn" onClick={() => patch(name, {clearKey: !value.clearKey, apiKey: ''})}>{value.clearKey ? 'ยกเลิกการลบ Key' : 'ลบ Key นี้'}</button>}
        </article>;
      })}
    </div>
    <section className="card">
      <label className="field"><span>Prompt เพิ่มเติมสำหรับวิเคราะห์แบบ</span>
        <textarea aria-label="Prompt เพิ่มเติมสำหรับวิเคราะห์แบบ" rows={8} maxLength={10000} disabled={busy} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="เช่น ให้อ่านเฉพาะฐานราก F01 และอธิบายข้อมูลที่ยังอ่านไม่ชัดใน unknowns"/>
        <small className="help">ส่งพร้อมภาพให้ค่าย AI ที่เลือกทุกครั้ง หลังบันทึกการตั้งค่า · เว้นว่างเพื่อใช้คำสั่งพื้นฐาน · คำสั่งพื้นฐานเรื่องไม่เดามิติและรูปแบบ JSON ยังคงใช้</small>
        <small>{prompt.length.toLocaleString()} / 10,000 ตัวอักษร</small>
      </label>
    </section>
    {!activeHasKey && <div className="warning">ค่ายที่เลือกใช้วิเคราะห์ ({META[active].label}) ยังไม่มี API Key</div>}
    <div className="editor-actions"><button className="btn" disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า API'}</button></div>
  </section>;
}
