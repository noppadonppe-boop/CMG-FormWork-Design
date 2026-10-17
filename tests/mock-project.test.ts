import {expect, it} from 'vitest';
import {calculate} from '../src/domain';
import {MOCK_CASES, mockProject} from '../src/domain/mockProject';
import {parseProjectBackup} from '../src/domain/projectBackup';
import {fromLegacy, previewWorkflow} from '../src/domain/workflowV07/model';

it('creates a mock-up project with exactly two cases per element type and unconfirmed geometry', () => {
  let n = 0;
  const p = mockProject('CMG-DEMO-001', () => `ID-${++n}`);
  expect(p.id).toBe('ID-1');
  expect(p.cases).toHaveLength(10);
  for (const type of ['FOOTING', 'COLUMN', 'WALL', 'BEAM', 'SLAB']) expect(p.cases.filter(c => c.workflowElementType === type)).toHaveLength(2);
  expect(new Set(p.cases.map(c => c.id)).size).toBe(10);
  expect(p.cases.every(c => c.input.confirmed === false && c.name.includes('ตัวอย่าง'))).toBe(true);
  expect(MOCK_CASES.map(c => c.code)).toEqual(['F01', 'F02', 'C01', 'C02', 'W01', 'W02', 'B01', 'B02', 'S01', 'S02']);
});

it('runs the legacy footing/column screening and opens every beam/slab/wall case as a blocked v0.7 draft', () => {
  const p = mockProject('CMG-DEMO-001');
  for (const c of p.cases.filter(c => c.workflowElementType === 'FOOTING' || c.workflowElementType === 'COLUMN')) {
    expect(c.input.kind).toBe(c.workflowElementType);
    expect(calculate(c.input).status).not.toBe('PASS');
  }
  for (const c of p.cases.filter(c => ['WALL', 'BEAM', 'SLAB'].includes(c.workflowElementType))) {
    const model = {...fromLegacy(c.input, c.id), elementType: c.workflowElementType};
    expect(model.heightMm).toBe(c.input.height);
    const preview = previewWorkflow(model);
    expect(preview.constructionEligible).toBe(false);
    expect(preview.constructionRelease).toBe('NO_GO');
  }
});

it('survives the project backup round trip used for import/export', () => {
  const p = mockProject('CMG-DEMO-002');
  const restored = parseProjectBackup(JSON.stringify({schemaVersion: 3, app: 'CMG Formwork cloud trial', project: p}));
  expect(restored.cases).toHaveLength(10);
  expect(restored.cases.map(c => c.name)).toEqual(p.cases.map(c => c.name));
  expect(restored.cases.map(c => c.workflowElementType)).toEqual(p.cases.map(c => c.workflowElementType));
  const bad = JSON.parse(JSON.stringify({schemaVersion: 3, app: 'x', project: p})); bad.project.cases[0].workflowElementType = 'ROOF';
  expect(() => parseProjectBackup(JSON.stringify(bad))).toThrow(/ประเภทองค์อาคาร/);
});
