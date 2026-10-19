import React, {useEffect, useRef, useState} from 'react';
import {canonical, clone} from '../domain/workflowV07/common';
import {validateClosureInputTemplate, type ClosureAnalysisContext, type ClosureInputFormType, type ClosureProjectInputTemplate} from '../domain/workflowV07/closurePack';
import {applyRinglockSystemPreset, RINGLOCK_SYSTEM_PRESETS, type RinglockSystemPresetId} from '../domain/workflowV07/ringlockSystemPresets';
import {closureReferences} from '../closurePackReferences';

const FORM_ORDER: ClosureInputFormType[] = ['ringlock_configuration', 'support_soil', 'support_slab', 'serviceability', 'stage_release'];
const FORM_LABEL: Record<ClosureInputFormType, string> = {
  ringlock_configuration: 'Ringlock และการค้ำยัน', support_soil: 'ดิน ฐานราก และแผ่นรอง', support_slab: 'พื้นคอนกรีตที่รองรับ',
  serviceability: 'เกณฑ์การใช้งานและการโก่งตัว', stage_release: 'ลำดับเทและอนุมัติแต่ละ Stage',
};
const FIELD_LABEL: Record<string, string> = {
  systemPresetId: 'ระบบ Ringlock ตั้งต้น',
  manufacturer: 'ผู้ผลิต', system: 'ชื่อระบบ', generation: 'รุ่น / รุ่นผลิต', componentCodes: 'รหัสอุปกรณ์', bayX_mm: 'ระยะกริด X', bayY_mm: 'ระยะกริด Y',
  liftPattern_mm: 'ระยะชั้น (JSON array)', totalInstalledHeight_mm: 'ความสูงติดตั้งรวม', headExtension_mm: 'ระยะยื่น U-head', headEngagement_mm: 'ระยะสวม U-head',
  baseExtension_mm: 'ระยะยื่น Jack Base', baseEngagement_mm: 'ระยะสวม Jack Base', braceLayoutRef: 'หลักฐานผังค้ำยันทแยง', headBaseDetailRef: 'รายละเอียดหัวและฐาน',
  connectionRulesRef: 'หลักเกณฑ์ข้อต่อ', jointInteractionRuleRef: 'หลักเกณฑ์แรงร่วมที่ข้อต่อ', jointStiffnessRef: 'ค่าความแข็งข้อต่อ', globalAnalysisRef: 'ผลวิเคราะห์ระบบรวม',
  secondOrderAndImperfectionBasisRef: 'หลักเกณฑ์ P-Delta / ความไม่สมบูรณ์', windAndLateralCasesRef: 'กรณีลมและแรงด้านข้าง', configurationRatingRef: 'พิกัดกำลัง configuration',
  ratingBasis: 'ฐานกำลังที่ใช้', loadPatternsCovered: 'รูปแบบโหลดที่ครอบคลุม (JSON array)', perNodeRating_kN: 'กำลังต่อจุด (JSON array)', actualProductEvidenceRef: 'หลักฐานสินค้าจริง',
  nationalBasisMappingRef: 'เอกสารเทียบมาตรฐาน', notes: 'หมายเหตุ', interfaceId: 'รหัสจุดรองรับ', basePlateRef: 'อ้างอิงแผ่นฐาน', soleBoardRef: 'อ้างอิงแผ่นรอง',
  actualFootprint_Bx_mm: 'ขนาดสัมผัส B', actualFootprint_Ly_mm: 'ขนาดสัมผัส L', contactConditionEvidenceRef: 'หลักฐานสภาพสัมผัส', geotechnicalReportRef: 'รายงานปฐพีกลศาสตร์',
  soilLayerAndGroundwaterRef: 'ชั้นดิน / ระดับน้ำใต้ดิน', grossOrNetBearingBasis: 'ฐาน gross / net', allowableBearingPressure_kPa: 'หน่วยแรงดินยอมให้',
  bearingDesignResistance_kN: 'กำลังรับแรงกดออกแบบ', loadResistanceBasis: 'ฐานกำลังต้านทาน', subgradeModulus_kN_m3: 'โมดูลัสชั้นดิน', subgradeCalibrationRef: 'หลักฐานสอบเทียบชั้นดิน',
  settlementPredictionRef: 'ผลคาดการณ์การทรุด', maxTotalSettlement_mm: 'การทรุดรวมสูงสุด', maxDifferentialSettlement_mm: 'การทรุดต่างระดับสูงสุด',
  differentialGaugeLength_mm: 'ระยะวัดต่างระดับ', settlementLimitEvidenceRef: 'หลักฐานเกณฑ์ทรุดตัว', drainageAndErosionPlanRef: 'แผนระบายน้ำ / ป้องกันดินพัง',
  slidingRestraintRef: 'หลักฐานต้านการเลื่อน', supportingSlabId: 'รหัสพื้นรองรับ', asBuiltDrawingRef: 'แบบ As-built', thickness_mm: 'ความหนาพื้น', effectiveDepthX_mm: 'ความลึกประสิทธิผล X',
  effectiveDepthY_mm: 'ความลึกประสิทธิผล Y', reinforcementRef: 'หลักฐานเหล็กเสริม', openingsEdgesAndSupportsRef: 'ช่องเปิด / ขอบ / จุดรองรับ', actualContactAreaRef: 'พื้นที่สัมผัสจริง',
  concreteMixId: 'รหัสส่วนผสมคอนกรีต', pourTimestamp: 'เวลาเทคอนกรีต', loadTimestamp: 'เวลารับน้ำหนัก', inSituStrength_MPa: 'กำลังอัดในที่', strengthEvidenceRef: 'หลักฐานกำลังอัด',
  maturityCalibrationRef: 'หลักฐานสอบเทียบ Maturity', temperatureHistoryRef: 'ประวัติอุณหภูมิ', youngSlabStiffnessRef: 'ค่าความแข็งพื้นอายุน้อย', crackingCreepBasisRef: 'หลักเกณฑ์ร้าว / Creep',
  punchingCriticalPerimeterRef: 'เส้นรอบรูปเจาะทะลุ', punchingRulePackRef: 'หลักเกณฑ์เจาะทะลุ', momentTransferAndGroupPunchingRef: 'โมเมนต์ถ่ายเท / เจาะทะลุกลุ่ม',
  flexureOneWayShearBearingChecksRef: 'ตรวจดัด / เฉือนทางเดียว / แรงกด', multistoreyStageAnalysisRef: 'วิเคราะห์ค้ำยันหลายชั้น', reshoringPlanRef: 'แผนค้ำยันซ้ำ',
  policyId: 'รหัสเกณฑ์', memberRole: 'ประเภทชิ้นส่วน', governingSourceRef: 'มาตรฐาน / ข้อกำหนด', loadSetRef: 'ชุดโหลด', relativeDeflectionDenominator: 'ตัวหารอัตราส่วนโก่งตัว',
  absoluteDeflectionLimit_mm: 'โก่งตัวสูงสุด', maxTieOpening_mm: 'ช่องเปิดไทร์สูงสุด', gaugeLength_mm: 'ระยะวัด', combinedDisplacementModelRef: 'แบบจำลองการเคลื่อนตัวรวม',
  creepMoistureReuseBasisRef: 'เกณฑ์ Creep / ความชื้น / ใช้ซ้ำ', stageRecordId: 'รหัส Stage', requestedAction: 'การดำเนินการที่ขอ', capturedAnalysisRef: 'ผลวิเคราะห์ที่บันทึก',
  currentAnalysisRef: 'ผลวิเคราะห์ปัจจุบัน', constructionSequenceRef: 'ลำดับก่อสร้าง', loadTransferRef: 'หลักฐานการถ่ายแรง', strengthAndSupportEvidenceRefs: 'หลักฐานกำลังและฐานรองรับ (JSON array)',
  serviceabilityEvidenceRef: 'หลักฐาน Serviceability', engineerRulePackRefs: 'ชุดกฎวิศวกรรม (JSON array)', siteInspectionRef: 'ผลตรวจหน้างาน', manualAcceptanceRef: 'ผู้รับรองด้วยตนเอง',
};
const NUMERIC_KEY = /(_mm|_kN|_MPa|_kPa|_kN_m3|_mm2|_mm3|_mm4)$/;
const UNIT: Record<string, string> = {mm: 'mm', kN: 'kN', MPa: 'MPa', kPa: 'kPa', kN_m3: 'kN/m³', mm2: 'mm²', mm3: 'mm³', mm4: 'mm⁴'};
const unit = (key: string) => {const suffix = key.match(/(kN_m3|mm2|mm3|mm4|mm|kN|MPa|kPa)$/)?.[0]; return suffix ? UNIT[suffix] : '';};

function saveJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'}), url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
function setInput(template: ClosureProjectInputTemplate, key: string, value: unknown): ClosureProjectInputTemplate {
  return {...template, inputs: {...template.inputs, [key]: value}};
}

function RinglockPresetReferences({presetId}: {presetId: unknown}) {
  if (presetId === 'DOKA_RINGLOCK_2020') {
    const records = closureReferences.ringlockSidecar.records;
    const standards = records.filter(row => row.kind === 'STANDARD');
    const braces = records.filter(row => row.kind === 'BRACE');
    return <details className="ringlock-preset-reference">
      <summary>ตารางอ้างอิง Doka · Component force · brochure p.31</summary>
      <p>แสดงตามตัวเลือกในเอกสารผู้ผลิตเท่านั้น: ระยะ Ledger แนวดิ่งไม่ใช่ความสูงหอ; ค้ำยันใช้กับ Lift 2,000 mm และ Bay ที่ระบุตรงกันเท่านั้น</p>
      <table><thead><tr><th>Standard · ระยะ Ledger แนวดิ่ง mm</th><th>Compression kN</th><th>Tension kN</th></tr></thead><tbody>{standards.map(row => <tr key={row.rating_id}><td>{String(row.selector.ledger_vertical_spacing_mm)}</td><td>{String(row.limits.compression_kN)}</td><td>{String(row.limits.tension_kN)}</td></tr>)}</tbody></table>
      <table><thead><tr><th>Diagonal brace · Lift / Bay mm</th><th>Tension kN</th><th>Compression kN</th></tr></thead><tbody>{braces.map(row => <tr key={row.rating_id}><td>{String(row.selector.lift_mm)} / {String(row.selector.bay_mm)}</td><td>{String(row.limits.tension_kN)}</td><td>{String(row.limits.compression_kN)}</td></tr>)}</tbody></table>
      <p>เอกสารระบุทั้งหัวข้อ “Maximum Design Forces” และหมายเหตุ “permissible loads, γM = 1.1, γF = 1.5”; ให้เลือกฐานโหลดกับวิศวกรและห้ามเทียบข้ามระบบ/รุ่นโดยอัตโนมัติ ตารางนี้ไม่ใช่กำลังหอค้ำยันทั้งชุด, U-head หรือ Jack Base</p>
      <a href={RINGLOCK_SYSTEM_PRESETS.DOKA_RINGLOCK_2020.sourceUrl} target="_blank" rel="noreferrer">เปิด Doka brochure</a>
      {' · '}<a href={RINGLOCK_SYSTEM_PRESETS.DOKA_RINGLOCK_2020.technicalSourceUrl} target="_blank" rel="noreferrer">เปิด technical leaflet</a>
    </details>;
  }
  if (presetId === 'TCB_RINGLOCK') {
    const data = RINGLOCK_SYSTEM_PRESETS.TCB_RINGLOCK;
    return <details className="ringlock-preset-reference">
      <summary>ข้อมูลชิ้นส่วน T.C.B. จากหน้าแคตตาล็อก</summary>
      <ul>{(data.values.componentCodes as string[]).map(row => <li key={row}>{row}</li>)}</ul>
      <p>หน้าแคตตาล็อกแสดงข้อมูลชิ้นส่วนและ Plank; ไม่พบกำลังเสา, ค้ำยัน หรือ configuration รวม จึงเว้นค่ากำลังไว้ให้กรอกจากเอกสารผลิตภัณฑ์จริง</p>
      <a href={data.sourceUrl} target="_blank" rel="noreferrer">เปิดหน้า T.C.B. Home Center</a>
    </details>;
  }
  if (presetId === 'CORONET_RINGLOCK_2024') {
    const data = RINGLOCK_SYSTEM_PRESETS.CORONET_RINGLOCK_2024;
    return <details className="ringlock-preset-reference">
      <summary>ตาราง Safe Axial Load ของ Standard · Technical Manual p.17</summary>
      <p>ตัวเลขเป็นค่าชิ้นส่วน Standard ตามความยาวในตารางผู้ผลิต ไม่ใช่กำลังหอค้ำยันหรือกำลังต่อขารับแบบรวม</p>
      <table><thead><tr><th>Standard length mm</th><th>Safe Axial Load kN</th></tr></thead><tbody>{data.standardRatings?.map(row => <tr key={row.lengthMm}><td>{row.lengthMm}</td><td>{row.safeAxialLoadKN}</td></tr>)}</tbody></table>
      <p>{String(data.values.configurationRatingRef)}</p>
      <a href={data.sourceUrl} target="_blank" rel="noreferrer">เปิด Coronet Technical Manual 08/2024</a>
    </details>;
  }
  return null;
}

export function ClosureInputEditor({templates, baselines, context, currentRevisionId, onSave, onRebind}: {
  templates: ClosureProjectInputTemplate[];
  baselines: Record<ClosureInputFormType, ClosureProjectInputTemplate>;
  context: ClosureAnalysisContext;
  currentRevisionId: string;
  onSave: (template: ClosureProjectInputTemplate) => void;
  onRebind: (template: ClosureProjectInputTemplate) => void;
}) {
  const savedKey = canonical(templates), fileRef = useRef<HTMLInputElement>(null), importTarget = useRef<ClosureInputFormType | null>(null);
  const makeDrafts = () => Object.fromEntries(FORM_ORDER.map(type => {
    const saved = templates.find(template => template.form_type === type);
    const base = clone(baselines[type]);
    return [type, saved ? {...clone(saved), inputs: {...base.inputs, ...clone(saved.inputs)}} : base];
  })) as Record<ClosureInputFormType, ClosureProjectInputTemplate>;
  const [drafts, setDrafts] = useState<Record<ClosureInputFormType, ClosureProjectInputTemplate>>(makeDrafts);
  const [message, setMessage] = useState('');
  useEffect(() => {setDrafts(makeDrafts());}, [savedKey]);

  function update(type: ClosureInputFormType, next: ClosureProjectInputTemplate) {setDrafts(previous => ({...previous, [type]: next})); setMessage('');}
  function currentContext(type: ClosureInputFormType) {
    return {...clone(baselines[type].context), ...context};
  }
  async function importFile(file: File, type: ClosureInputFormType) {
    try {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      const compatible = type === 'ringlock_configuration' && raw.inputs && typeof raw.inputs === 'object' && !Array.isArray(raw.inputs)
        ? {...raw, inputs: {systemPresetId: null, ...raw.inputs as Record<string, unknown>}} : raw;
      const parsed = validateClosureInputTemplate(compatible, baselines[type]);
      update(type, parsed); setMessage(`นำเข้าแบบ ${FORM_LABEL[type]} แล้ว · กดบันทึกข้อมูลเพื่อแนบกับ Case`);
    } catch (error) {setMessage(`นำเข้าไม่สำเร็จ: ${(error as Error).message}`);}
  }

  return <section className="card closure-input-editor" aria-label="ชุดข้อมูลวิศวกรรมที่เจ้าของแก้ไขได้">
    <h3>ข้อมูลวิศวกรรมโครงการ · กรอกและแก้ไขได้</h3>
    <p>กรอกค่าจากแบบ รายงานผู้ผลิต และหลักฐานโครงการ แล้วบันทึกไว้กับ Case นี้ได้ทันที ระบบยังตรวจว่าเป็นข้อมูลที่กรอกครบและผูก Revision หรือไม่ แต่จะไม่ใช้ค่าจากแบบฟอร์มนี้เป็นกำลังออกแบบเอง และไม่เปลี่ยน `NOT_VERIFIED / NO_GO`</p>
    {message && <p role="status" className="muted">{message}</p>}
    <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={event => {
      const file = event.target.files?.[0], type = importTarget.current; if (file && type) void importFile(file, type); event.target.value = '';
    }}/>
    {FORM_ORDER.map(type => {
      const template = drafts[type], baseline = baselines[type], saved = templates.some(row => row.form_type === type);
      const bound = template.context.revisionId === currentRevisionId && (context.projectId === null || template.context.projectId === context.projectId);
      const validated = (() => {try {validateClosureInputTemplate(template, baseline); return true;} catch {return false;}})();
      const inputValues = template.inputs as Record<string, unknown>;
      const updateField = (key: string, value: unknown) => {
        let next = setInput(template, key, value);
        if (type === 'ringlock_configuration' && key !== 'systemPresetId' && inputValues.systemPresetId !== null && inputValues.systemPresetId !== 'CUSTOM') {
          next = setInput(next, 'systemPresetId', 'CUSTOM');
        }
        update(type, next);
      };
      return <details key={type} className="closure-input-form">
        <summary>{FORM_LABEL[type]} · {saved ? bound ? 'ผูก Revision ปัจจุบัน' : 'Revision เก่า' : 'ยังไม่บันทึก'}</summary>
        <p className={bound ? 'muted' : 'warning'}>Revision: {template.context.revisionId || 'ยังไม่ผูก'} · {template.review.trustedVerificationStatus} · confirmed=false · NO_GO</p>
        {type === 'ringlock_configuration' && <>
          <label className="field"><span>เลือกข้อมูลระบบ Ringlock ตั้งต้น</span><select aria-label="เลือกระบบ Ringlock ตั้งต้น" value={String(inputValues.systemPresetId ?? '')} onChange={event => {
            const selected = (event.target.value || null) as RinglockSystemPresetId | null;
            update(type, {...template, inputs: applyRinglockSystemPreset(inputValues, selected)});
          }}>
            <option value="">เลือก preset หรือกรอก Custom</option>
            <option value="DOKA_RINGLOCK_2020">{RINGLOCK_SYSTEM_PRESETS.DOKA_RINGLOCK_2020.label}</option>
            <option value="CORONET_RINGLOCK_2024">{RINGLOCK_SYSTEM_PRESETS.CORONET_RINGLOCK_2024.label}</option>
            <option value="TCB_RINGLOCK">{RINGLOCK_SYSTEM_PRESETS.TCB_RINGLOCK.label}</option>
            <option value="CUSTOM">Custom · ใช้ระบบของโครงการและแก้ข้อมูลด้านล่าง</option>
          </select></label>
          <p>เลือก preset เพื่อเติมข้อมูลที่ผู้ผลิต/ผู้จำหน่ายเผยแพร่ แล้วแก้ไขให้ตรงรุ่นและของจริงได้ทุกช่อง หรือเลือก Custom เพื่อกรอกระบบอื่น ค่ากำลังที่ยังไม่มีหลักฐานจะคงว่าง</p>
          <RinglockPresetReferences presetId={inputValues.systemPresetId}/>
        </>}
        <div className="closure-input-grid">
          {Object.keys(baseline.inputs).map(key => {
            if (type === 'ringlock_configuration' && key === 'systemPresetId') return null;
            const original = (baseline.inputs as Record<string, unknown>)[key], value = inputValues[key];
            const isNumber = typeof value === 'number' || typeof original === 'number' || (original === null && NUMERIC_KEY.test(key));
            const label = FIELD_LABEL[key] ?? key;
            if (Array.isArray(original) || Array.isArray(value) || typeof value === 'string' && Array.isArray(original)) return <label className="field closure-input-wide" key={key}>
              <span>{label} <small>JSON</small></span><textarea aria-label={label} value={typeof value === 'string' ? value : JSON.stringify(value ?? [], null, 2)} onChange={event => updateField(key, event.target.value)} onBlur={event => {
                try {updateField(key, JSON.parse(event.target.value));} catch {setMessage(`${label}: JSON array ยังไม่ถูกต้อง`);}
              }}/>
            </label>;
            if (isNumber) return <label className="field" key={key}><span>{label} {unit(key) && <small>{unit(key)}</small>}</span><input aria-label={label} type="number" min="0" step="any" value={typeof value === 'number' ? value : ''}
              onChange={event => updateField(key, event.target.value.trim() ? Number(event.target.value) : null)}/></label>;
            if (key === 'notes') return <label className="field closure-input-wide" key={key}><span>{label}</span><textarea aria-label={label} value={typeof value === 'string' ? value : ''} onChange={event => updateField(key, event.target.value)}/></label>;
            return <label className="field" key={key}><span>{label}</span><input aria-label={label} value={typeof value === 'string' ? value : ''} onChange={event => updateField(key, event.target.value || null)}/></label>;
          })}
        </div>
        <h4>ผู้ตรวจและหลักฐานประกอบ</h4>
        <div className="closure-input-grid">
          <label className="field"><span>วิศวกรผู้ตรวจ</span><input aria-label={`วิศวกรผู้ตรวจ ${type}`} value={template.review.engineerId ?? ''} onChange={event => update(type, {...template, review: {...template.review, engineerId: event.target.value || null}})}/></label>
          <label className="field"><span>เอกสารหลักฐาน</span><input aria-label={`เอกสารหลักฐาน ${type}`} value={template.review.evidenceRef ?? ''} onChange={event => update(type, {...template, review: {...template.review, evidenceRef: event.target.value || null}})}/></label>
          <label className="field closure-input-wide"><span>Snapshot hash ที่วิศวกรตรวจรับ</span><input aria-label={`Snapshot hash ${type}`} value={template.review.acceptedSnapshotHash ?? ''} onChange={event => update(type, {...template, review: {...template.review, acceptedSnapshotHash: event.target.value || null}})}/></label>
        </div>
        <div className="source-actions">
          <button className="btn" disabled={!validated} onClick={() => onSave({...template, context: currentContext(type), review: {...template.review, acceptedSnapshotHash: null, trustedVerificationStatus: 'NOT_VERIFIED'}})}>บันทึกร่างกับ Case นี้</button>
          {saved && <button className="btn secondary" disabled={bound} onClick={() => onRebind({...template, context: currentContext(type), review: {...template.review, acceptedSnapshotHash: null, acceptedStageId: null, acceptedLoadCaseId: null, trustedVerificationStatus: 'NOT_VERIFIED'}})}>ผูกกับ Revision ปัจจุบัน</button>}
          <button className="btn secondary" disabled={!validated} onClick={() => {try {saveJson(`${type}-input-template.json`, validateClosureInputTemplate(template, baseline));} catch (error) {setMessage((error as Error).message);}}}>ดาวน์โหลด JSON</button>
          <button className="btn secondary" onClick={() => {importTarget.current = type; fileRef.current?.click();}}>นำเข้า JSON</button>
        </div>
      </details>;
    })}
    <p className="muted">ข้อมูลบันทึกใน Design Draft และจะร่วมอยู่ใน input hash ของเอกสารร่าง ผลคำนวณต้องวิเคราะห์และ Review ใหม่เมื่อแก้ไข Revision</p>
  </section>;
}
