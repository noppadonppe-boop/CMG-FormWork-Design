import React, {useEffect, useMemo, useState} from 'react';
import {canonical, WORKFLOW_VERSION} from '../domain/workflowV07/common';
import {documentView, freezeDesign, type FrozenDesign} from '../domain/workflowV07/snapshot';
import type {WorkflowModel} from '../domain/workflowV07/model';
import type {ReviewRecord} from '../domain/workflowV07/review';
import type {TitleBlock} from '../domain/titleBlock';
import {WorkflowDocuments} from './WorkflowV07Panel';
import {WorkflowV07Drawings} from './WorkflowV07Drawings';

type View = Awaited<ReturnType<typeof documentView>>;

/** Render calculation and drawing outputs from one persisted v0.7 draft identity. */
export function WorkflowV07Output({model, review, mode, project, code, caseName, titleBlock, canEdit, onTitleBlockChange}: {
  model: WorkflowModel;
  review?: ReviewRecord | null;
  mode: 'results' | 'drawings' | 'report';
  project: string; code: string; caseName: string; titleBlock: TitleBlock; canEdit: boolean; onTitleBlockChange: (value: TitleBlock) => void;
}) {
  const identity = useMemo(() => canonical(model), [model]);
  const [state, setState] = useState<{view: View; snapshot: FrozenDesign} | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setState(null); setError('');
    void freezeDesign(model).then(snapshot => documentView(snapshot, model).then(view => {
      if (!cancelled) setState({view, snapshot});
    })).catch(e => {if (!cancelled) setError((e as Error).message);});
    return () => {cancelled = true;};
  }, [identity]);

  if (error) return <section className="card" aria-label="ผล Workflow v0.7"><div className="warning" role="alert">สร้าง Snapshot ไม่สำเร็จ: {error}</div></section>;
  if (!state) return <section className="card" aria-label="ผล Workflow v0.7"><p>กำลังสร้างรายการคำนวณและแบบจาก Snapshot เดียวกัน…</p></section>;

  const {view, snapshot} = state;
  const reviewStale = !!review && review.state !== 'DRAFT' &&
    (review.contentHash !== view.inputHash || review.engineVersion !== WORKFLOW_VERSION);
  if (mode === 'drawings') return <WorkflowV07Drawings view={view} project={project} code={code} caseName={caseName} titleBlock={titleBlock}
    canEdit={canEdit} onTitleBlockChange={onTitleBlockChange} reviewState={reviewStale ? `STALE · ${review?.state ?? 'DRAFT'}` : review?.state ?? 'DRAFT / NO_GO'}/>;
  const label = mode === 'report' ? 'รายงานจาก Snapshot v0.7' : 'รายการคำนวณจาก Snapshot v0.7';
  return <section className="card workflow-v07-output" aria-label={label}>
    <div className="report-tools">
      <div><h2>{label}</h2><p className="muted">คำนวณและแบบใช้ Design Revision เดียวกัน · DRAFT / NO_GO · ยังไม่ใช่เอกสารเพื่อก่อสร้าง</p></div>
      <button className="btn" onClick={() => window.print()}>พิมพ์ / บันทึก PDF</button>
    </div>
    <p className="muted">Design Revision: <code>{model.revisionId}</code> · input hash: <code>{view.inputHash}</code> · snapshot hash: <code>{snapshot.snapshotHash}</code></p>
    {review && review.state !== 'DRAFT' && <p className={reviewStale ? 'warning' : 'notice'} role={reviewStale ? 'alert' : undefined}>
      Review: {review.state} · {reviewStale ? 'ร่างปัจจุบันไม่ตรงกับฉบับที่ส่งตรวจ ต้องส่งคืนเป็นร่างและส่งตรวจใหม่' : 'ตรงกับร่างที่ส่งตรวจ'}
    </p>}
    <WorkflowDocuments view={view}/>
  </section>;
}
