import {expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {calculate} from '../src/domain';
import {calculateBeam} from '../src/domain/beam';
import {calculateSlab} from '../src/domain/slab';
import {calculateWall} from '../src/domain/wall';
import {MOCK_CASES, PROJECT_EXAMPLE_REFERENCES, mockProject, projectExample} from '../src/domain/mockProject';
import {parseProjectBackup} from '../src/domain/projectBackup';
import {fromLegacy, previewWorkflow} from '../src/domain/workflowV07/model';

it('creates a mock-up project with exactly two cases per element type and unconfirmed geometry', () => {
  let n = 0;
  const p = mockProject('CMG-DEMO-001', () => `ID-${++n}`);
  expect(p.id).toBe('ID-1');
  expect(p.cases).toHaveLength(10);
  for (const type of ['FOOTING', 'COLUMN', 'WALL', 'BEAM', 'SLAB']) expect(p.cases.filter(c => c.workflowElementType === type)).toHaveLength(2);
  expect(new Set(p.cases.map(c => c.id)).size).toBe(10);
  expect(p.name).toContain('MOCK-UP');
  expect(p.cases.every(c => c.input.confirmed === false && c.name.includes('MOCK'))).toBe(true);
  expect(MOCK_CASES.map(c => c.code)).toEqual(['F01', 'F02', 'C01', 'C02', 'W01', 'W02', 'B01', 'B02', 'S01', 'S02']);
});

it('stores editable Beam, Slab and Wall mock inputs with unknown equipment capacities', () => {
  const p = mockProject('CMG-DEMO-001');
  const beams = p.cases.filter(c => c.workflowElementType === 'BEAM'), slabs = p.cases.filter(c => c.workflowElementType === 'SLAB'), walls = p.cases.filter(c => c.workflowElementType === 'WALL');
  expect(beams).toHaveLength(2); expect(slabs).toHaveLength(2); expect(walls).toHaveLength(2);
  for (const c of beams) {
    expect(c.beam).toMatchObject({confirmed: false, length: c.input.width, b: c.input.length, h: c.input.height, shoreSWL: 0, tieSWL: 0});
    expect(calculateBeam(c.beam).status).not.toBe('PASS');
  }
  for (const c of slabs) {
    expect(c.slab).toMatchObject({confirmed: false, lx: c.input.width, ly: c.input.length, t: c.input.height, shoreSWL: 0});
    expect(calculateSlab(c.slab).status).not.toBe('PASS');
  }
  for (const c of walls) {
    expect(c.wall).toMatchObject({confirmed: false, length: c.input.width, t: c.input.length, height: c.input.height, tieSWL: 0, braceSWL: 0, anchorSWL: 0});
    expect(calculateWall(c.wall).status).not.toBe('PASS');
  }
  expect(walls.map(c => c.wall?.system)).toEqual(['TWO_SIDED', 'SINGLE_SIDED']);
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
  expect(restored.cases.filter(c => c.workflowElementType === 'BEAM').every(c => c.beam?.confirmed === false && c.beam.shoreSWL === 0)).toBe(true);
  expect(restored.cases.filter(c => c.workflowElementType === 'SLAB').every(c => c.slab?.confirmed === false && c.slab.shoreSWL === 0)).toBe(true);
  expect(restored.cases.filter(c => c.workflowElementType === 'WALL').every(c => c.wall?.confirmed === false && c.wall.tieSWL === 0)).toBe(true);
  const bad = JSON.parse(JSON.stringify({schemaVersion: 3, app: 'x', project: p})); bad.project.cases[0].workflowElementType = 'ROOF';
  expect(() => parseProjectBackup(JSON.stringify(bad))).toThrow(/ประเภทองค์อาคาร/);
});

it('ships an importable mock project backup with all five element workflows', () => {
  const text = readFileSync(new URL('../examples/RC-FormWork-Mockup-Project-v0.7.json', import.meta.url), 'utf8');
  const restored = parseProjectBackup(text);
  expect(restored.code).toBe('CMG-DEMO-001');
  expect(restored.cases).toHaveLength(10);
  expect(new Set(restored.cases.map(c => c.workflowElementType))).toEqual(new Set(['FOOTING', 'COLUMN', 'WALL', 'BEAM', 'SLAB']));
  expect(restored.cases.every(c => !c.input.confirmed)).toBe(true);
  expect(restored.cases.every(c => c.beam?.confirmed !== true && c.slab?.confirmed !== true && c.wall?.confirmed !== true)).toBe(true);
});

it('ships an importable Project Example file with populated reference fields', () => {
  const text = readFileSync(new URL('../examples/Project-Example-v0.7.json', import.meta.url), 'utf8');
  const restored = parseProjectBackup(text);
  expect(restored.name).toBe('Project Example');
  expect(restored.code).toBe('PROJECT-EXAMPLE-001');
  expect(restored.cases).toHaveLength(10);
  expect(restored.cases.every(c => c.input.walerSectionId === 'PAP-TIS107-RHS-100x50x3.2' && c.input.studSectionId === 'PAP-TIS107-SHS-50x50x2.3')).toBe(true);
  expect(restored.cases.filter(c => c.beam).every(c => c.beam!.shoreReference.includes('ringlock-research'))).toBe(true);
  expect(restored.cases.filter(c => c.slab).every(c => c.slab!.shoreReference.includes('ringlock-research'))).toBe(true);
  expect(restored.cases.filter(c => c.wall).every(c => c.wall!.braceReference.includes('ringlock-research'))).toBe(true);
});

it('creates the complete Project Example with populated fields and traceable source labels', () => {
  let n = 0;
  const p = projectExample('PROJECT-EXAMPLE-001', () => `EX-${++n}`);
  expect(p.name).toBe('Project Example');
  expect(p.code).toBe('PROJECT-EXAMPLE-001');
  expect(p.cases).toHaveLength(10);
  expect(p.cases.every(c => c.name.startsWith('Project Example ·') && c.name.endsWith('MOCK-UP'))).toBe(true);
  expect(p.cases.every(c => c.input.confirmed === false)).toBe(true);
  expect(p.cases.every(c => Object.values(c.input).every(v => v !== '' && v !== undefined && v !== null))).toBe(true);
  expect(p.cases.filter(c => c.beam).every(c => Object.values(c.beam!).every(v => v !== '' && v !== undefined && v !== null))).toBe(true);
  expect(p.cases.filter(c => c.slab).every(c => Object.values(c.slab!).every(v => v !== '' && v !== undefined && v !== null))).toBe(true);
  expect(p.cases.filter(c => c.wall).every(c => Object.values(c.wall!).every(v => v !== '' && v !== undefined && v !== null))).toBe(true);
  expect(p.cases.filter(c => c.beam).every(c => c.beam!.shoreSWL === 0 && c.beam!.shoreReference.includes('ringlock-research'))).toBe(true);
  expect(p.cases.filter(c => c.slab).every(c => c.slab!.shoreSWL === 0 && c.slab!.shoreReference.includes('ringlock-research'))).toBe(true);
  expect(p.cases.filter(c => c.wall).every(c => c.wall!.braceSWL === 0 && c.wall!.braceReference.includes('ringlock-research'))).toBe(true);
  expect(p.cases.every(c => c.input.cornerReference.includes('form_tie_machine_bridge'))).toBe(true);
  expect(PROJECT_EXAMPLE_REFERENCES.loads).toContain('ACI PRC-347');
  expect(PROJECT_EXAMPLE_REFERENCES.plywood).toContain('APA');
  expect(PROJECT_EXAMPLE_REFERENCES.sections).toContain('PAP-TIS107');
});

it('attaches a populated v0.7 draft to every Project Example case without inventing resistance', () => {
  const p = projectExample('PROJECT-EXAMPLE-001', (() => {let n = 0; return () => `EX-${++n}`;})());
  expect(p.cases.every(c => c.workflowV07)).toBe(true);
  for (const c of p.cases) {
    const model = c.workflowV07!.model;
    expect(model.sourceRef).toContain('PROJECT-EXAMPLE');
    expect(model.designBasisRef).toContain('ACI PRC-347');
    expect(model.selections.section?.reference.section_id).toBe('PAP-2026-CLIP-100x50x20x3.2');
    expect(model.selections.material?.reference.material_id).toBe('STEEL-SSCS400');
    expect(model.selections.ringlock).toBeNull(); // CUSTOM geometry does not select a different manufacturer's component.
    expect(model.humanInputReviewed).toBe(false);
    expect(model.ringlockRating).toBeNull();
  }
  const restored = parseProjectBackup(JSON.stringify({schemaVersion: 3, project: p}));
  expect(restored.cases.every(c => c.workflowV07)).toBe(true);
});
