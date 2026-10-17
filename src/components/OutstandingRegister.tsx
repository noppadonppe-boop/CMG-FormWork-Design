import React from 'react';
import {REGISTER_GROUP_LABEL, REGISTER_GROUPS, outstandingRegister, type RegisterGroup} from '../domain/workflowV07/register';

/** One list of everything the draft still lacks, grouped by component. Blockers are shown verbatim. */
export function OutstandingRegister({blockers, groups = REGISTER_GROUPS, title = 'ทะเบียนข้อมูลที่ยังขาด (Outstanding-information register)'}: {blockers: string[]; groups?: readonly RegisterGroup[]; title?: string}) {
  const register = outstandingRegister(blockers);
  const shown = groups.filter(g => register.counts[g] > 0);
  return <section className="card outstanding-register" aria-label={title}>
    <h3>{title} · {groups.reduce((n, g) => n + register.counts[g], 0)} รายการ</h3>
    <p className="muted">ทุกรายการมาจากเครื่องคำนวณโดยตรง ไม่ถูกตัดหรือรวม การมีรายการค้างอยู่ทำให้ผลเป็น INCOMPLETE/BLOCKED และทุกกรณียังเป็น NO_GO</p>
    {!shown.length && <p>ไม่มีรายการค้างในกลุ่มนี้ (ผลยังเป็น screening เท่านั้น)</p>}
    {shown.map(g => <details key={g} open={shown.length <= 2}><summary>{REGISTER_GROUP_LABEL[g]} ({register.counts[g]})</summary>
      <ul>{register.rows.filter(r => r.group === g).map(r => <li key={r.blocker}><code>{r.blocker}</code></li>)}</ul></details>)}
  </section>;
}
