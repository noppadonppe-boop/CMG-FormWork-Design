import {beforeAll, describe, expect, it} from 'vitest';
import {webcrypto} from 'node:crypto';
import {projectExample} from '../src/domain/mockProject';
import {projectExampleWorkflowDraft} from '../src/domain/projectExampleWorkflow';
import {layoutCompare, rowMatches} from '../src/domain/draftCompare';
import type {ElementType} from '../src/domain/workflowV07/common';

beforeAll(() => {if (!globalThis.crypto) Object.assign(globalThis, {crypto: webcrypto});});
const project = projectExample();
const byCode = (code: string) => project.cases.find(c => c.name.includes(` ${code} `))!;
const rows = (c: ReturnType<typeof byCode>, draft = c.workflowV07!) =>
  layoutCompare(c.workflowElementType as ElementType, {input: c.input, beam: c.beam!, slab: c.slab!, wall: c.wall!}, draft.model);

describe('Project Example v0.7 drafts follow the page / 3D values', () => {
  it('every example case: plywood, sections, stud/joist counts and tie Ø match; only count limits may be simplified', () => {
    for (const c of project.cases) {
      const r = rows(c);
      expect(r.length, c.name).toBeGreaterThan(2);
      for (const row of r) if (!rowMatches(row)) expect(row.simplified, `${c.name} · ${row.label}: ${row.page} vs ${row.draft}`).toBe(true);
    }
  });
  it('a footing edit (plywood, stud section, stud spacing, tie Ø) regenerates the draft with the same values', () => {
    const c = byCode('F01'), input = {...c.input, plywood: 25, studSectionId: 'PAP-TIS107-SHS-75x75x3.2', rhsB: 75, rhsH: 75, rhsT: 3.2, studSpacing: 250, tieDiameter: 20};
    const d = projectExampleWorkflowDraft(input, 'FOOTING', c.id, c), face = d.model.sideLayout!.faces[0];
    expect(face.plywood.thicknessMm).toBe(25);
    expect(face.stud.evidenceRef.startsWith('PAP-TIS107-SHS-75x75x3.2')).toBe(true);
    expect(face.studPositionsMm.length).toBe(Math.ceil(face.studPositionsMm.at(-1)! / 250) + 1);
    expect(d.model.sideLayout!.ties.every(t => t.diameterMm === 20)).toBe(true);
    for (const row of rows({...c, input}, d)) if (!rowMatches(row)) expect(row.simplified, row.label).toBe(true);
  });
  it('a slab edit (plywood, joist spacing, sections) reaches the soffit layout', () => {
    const c = byCode('S02'), slab = {...c.slab!, plywood: 15, joistSpacing: 250, joistSectionId: 'PAP-TIS107-RHS-75x45x2.3'};
    const d = projectExampleWorkflowDraft(c.input, 'SLAB', c.id, {...c, slab});
    expect(d.model.soffitLayout!.plywood!.thicknessMm).toBe(15);
    expect(d.model.soffitLayout!.joist.evidenceRef.startsWith('PAP-TIS107-RHS-75x45x2.3')).toBe(true);
    const xs = d.model.soffitLayout!.joistXMm;
    expect(xs.length).toBe(Math.ceil((xs.at(-1)! - xs[0]) / 250) + 1);
  });
});
