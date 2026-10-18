// @vitest-environment jsdom
import React from 'react';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {existsSync} from 'node:fs';
import {GlobalFonts, createCanvas, loadImage} from '@napi-rs/canvas';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {calculate, defaults} from '../src/domain';
import {defaultTitleBlock} from '../src/domain/titleBlock';
import {DrawingSet} from '../src/components/DrawingSet';
import {beamDefaults, calculateBeam} from '../src/domain/beam';
import {BeamDrawingSet} from '../src/components/BeamDocs';
import {slabDefaults, calculateSlab} from '../src/domain/slab';
import {SlabDrawingSet} from '../src/components/SlabDocs';
import {wallDefaults, calculateWall} from '../src/domain/wall';
import {WallDrawingSet} from '../src/components/WallDocs';
import {WorkflowV07Drawings} from '../src/components/WorkflowV07Drawings';
import {fromLegacy} from '../src/domain/workflowV07/model';
import {documentView, freezeDesign} from '../src/domain/workflowV07/snapshot';

const font = 'C:/Windows/Fonts/tahoma.ttf';
if (existsSync(font)) GlobalFonts.registerFromPath(font, 'Tahoma');
afterEach(() => vi.unstubAllGlobals());

async function rasterize(svg: string) {
  const normalized = svg.replace(/width="420mm"/g, 'width="420"').replace(/height="297mm"/g, 'height="297"');
  const image = await loadImage(Buffer.from(normalized));
  const canvas = createCanvas(420, 297);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, 420, 297);
  const pixels = context.getImageData(0, 0, 420, 297).data;
  const nonBlank = Array.from(pixels).some((value, index) => index % 4 === 3 && value > 0);
  expect(image.width).toBeGreaterThan(0);
  expect(image.height).toBeGreaterThan(0);
  expect(nonBlank).toBe(true);
}

function sheets(markup: string) {
  return markup.match(/<svg[^>]*class="a3-sheet"[\s\S]*?<\/svg>/g) ?? [];
}

describe('A3 raster visual smoke', () => {
  it('rasterizes legacy and v0.7 drawing sheets with Thai font registration', async () => {
    const tb = defaultTitleBlock('visual smoke');
    const markups = [
      renderToStaticMarkup(<DrawingSet result={calculate(defaults)} project="P" code="F-1" caseName="F01" titleBlock={tb} onTitleBlockChange={() => undefined}/>),
      renderToStaticMarkup(<BeamDrawingSet r={calculateBeam({...beamDefaults, tieRows: 1})} project="P" code="B-1" caseName="B01" titleBlock={tb} canEdit onTitleBlockChange={() => undefined}/>),
      renderToStaticMarkup(<SlabDrawingSet r={calculateSlab({...slabDefaults, confirmed: true})} project="P" code="S-1" caseName="S01" titleBlock={tb} canEdit onTitleBlockChange={() => undefined}/>),
      renderToStaticMarkup(<WallDrawingSet r={calculateWall({...wallDefaults, confirmed: true})} project="P" code="W-1" caseName="W01" titleBlock={tb} canEdit onTitleBlockChange={() => undefined}/>),
    ];
    const all = markups.flatMap(sheets);
    expect(all.length).toBe(13);
    for (const svg of all) await rasterize(svg);
  });

  it('rasterizes all v0.7 geometry-to-support sheets from the frozen snapshot', async () => {
    vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('TextEncoder', TextEncoder);
    const model = {...fromLegacy({...defaults, shape: 'RECTANGLE', width: 2000, length: 2000, height: 1000}, 'B-A3'), elementType: 'BEAM' as const, revisionId: 'REV-A3'};
    const snapshot = await freezeDesign(model), view = await documentView(snapshot, model);
    const markup = renderToStaticMarkup(<WorkflowV07Drawings view={view} project="P" code="B-1" caseName="B01" titleBlock={defaultTitleBlock()} canEdit={false} onTitleBlockChange={() => undefined} reviewState="DRAFT / NO_GO"/>);
    const all = sheets(markup);
    expect(all.length).toBe(8);
    for (const svg of all) await rasterize(svg);
  });
});
