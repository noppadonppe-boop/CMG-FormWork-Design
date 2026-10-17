import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it} from 'vitest';
import {buildWorkflowFormworkLayout} from '../src/domain/formworkLayout';
import {previewWorkflow, reviseDraft} from '../src/domain/workflowV07/model';
import {stampSideLayout} from '../src/domain/workflowV07/sideLayout';
import {WorkflowTakeoffResults} from '../src/components/WorkflowTakeoffResults';
import {builtModel, layoutFixture, slabModel} from './fixtures/workflow-v07-soffit';
import {sideDefinition, sideModel} from './fixtures/workflow-v07-side';
import {plywoodFixture} from './fixtures/workflow-v07-plywood';

it('projects current slab and beam coordinates to a geometry-only takeoff', () => {
  const slab = builtModel(slabModel(), {...layoutFixture(), plywood: plywoodFixture()}), slabTakeoff = buildWorkflowFormworkLayout(slab, previewWorkflow(slab));
  const slabRow = (item: string) => slabTakeoff.bom.find(row => row.item === item);
  expect(slabRow('SOFFIT_PLYWOOD_AREA')).toMatchObject({quantity: 3.6, unit: 'm2'});
  expect(slabRow('JOISTS')).toMatchObject({quantity: 5, unit: 'ea', modeledSpanMm: 1500});
  expect(slabRow('BEARERS')).toMatchObject({quantity: 2, unit: 'ea', modeledSpanMm: 2400});
  expect(slabRow('U_HEADS')).toMatchObject({quantity: 6, unit: 'ea'});

  const beam = {...slabModel(), elementType: 'BEAM' as const, heightMm: 600, beamWidthMm: 300,
    vertices: [{x: 0, y: 0}, {x: 2400, y: 0}, {x: 2400, y: 300}, {x: 0, y: 300}],
    slabThicknessMm: 150, concreteStripMm: 1200, deadStripMm: 1500, liveStripMm: 1800};
  const layout = layoutFixture();
  layout.joistStartYMm = -600; layout.joistEndYMm = 1200;
  layout.bearers[0].yMm = -600; layout.bearers[1].yMm = 1200;
  layout.concreteStripStartYMm = -300; layout.deadStripStartYMm = -500; layout.liveStripStartYMm = -600;
  const beamModel = builtModel(beam, layout), beamTakeoff = buildWorkflowFormworkLayout(beamModel, previewWorkflow(beamModel));
  expect(beamTakeoff.bom.find(row => row.item === 'JOISTS')).toMatchObject({quantity: 5, modeledSpanMm: 1800});
  expect(beamTakeoff.bom.find(row => row.item === 'BEARERS')).toMatchObject({quantity: 2, modeledSpanMm: 2400});
  expect(beamTakeoff.constructionRelease).toBe('NO_GO');
});

it('counts only authored wall faces and retains the permanent no-go state', () => {
  const base = sideModel(), model = {...base, elementType: 'WALL' as const};
  const wall = {...model, sideLayout: stampSideLayout(model, sideDefinition())};
  const takeoff = buildWorkflowFormworkLayout(wall, previewWorkflow(wall));
  const total = (item: string) => takeoff.bom.filter(row => row.item === item).reduce((sum, row) => sum + (row.quantity ?? 0), 0);

  expect(total('SIDE_FORM_AREA')).toBeCloseTo(4);
  expect(total('SIDE_STUDS')).toBe(20);
  expect(total('SIDE_WALER_RAILS')).toBe(16);
  expect(total('TIE_ROUTES')).toBe(8);
  expect(takeoff.status).toBe('DRAFT');
  expect(takeoff.constructionRelease).toBe('NO_GO');
  expect(takeoff.warnings).toContain('PRODUCT_CAPACITY_AND_CONSTRUCTION_RELEASE_REMAIN_UNVERIFIED');

  const partialDefinition = sideDefinition();
  partialDefinition.faces = [partialDefinition.faces[0]];
  partialDefinition.ties = [];
  const partialWall = {...model, sideLayout: stampSideLayout(model, partialDefinition)};
  const partialTakeoff = buildWorkflowFormworkLayout(partialWall, previewWorkflow(partialWall));
  expect(partialTakeoff.bom.filter(row => row.item === 'SIDE_FORM_AREA').reduce((sum, row) => sum + (row.quantity ?? 0), 0)).toBeCloseTo(1);
  expect(partialTakeoff.warnings).toContain('PHYSICAL_SIDE_FACES_MISSING_FROM_TAKEOFF');

  const html = renderToStaticMarkup(<WorkflowTakeoffResults model={wall} preview={previewWorkflow(wall)}/>);
  expect(html).toContain('รายการปริมาณแบบหล่อ');
  expect(html).toContain('NO_GO');
  expect(html).toContain('ไม่ใช่รายการสั่งซื้อ');
});

it('does not reuse stale soffit member coordinates for a takeoff', () => {
  const original = builtModel(), edited = reviseDraft(original, {constructionLiveKPa: 3});
  const takeoff = buildWorkflowFormworkLayout(edited, previewWorkflow(edited));
  expect(takeoff.bom.some(row => row.item === 'JOISTS')).toBe(false);
  expect(takeoff.warnings).toContain('CURRENT_SOFFIT_LOAD_PATH_REQUIRED_FOR_TAKEOFF');
  expect(takeoff.constructionRelease).toBe('NO_GO');
});
