import {describe, expect, it} from 'vitest';
import {calculate, defaults} from '../src/domain';
import {applyChanges, buildScene, changesToInput, parseModelChanges, toGltf} from '../src/domain/scene';
import {validateChatReply} from '../src/drawingChat';
import {elementToCase, elementToInput, parseAiElements, type AiElement} from '../src/aiElements';

const element = (patch: Partial<AiElement> = {}): AiElement => ({name: 'F1', kind: 'FOOTING', shape: 'RECTANGLE', width: 1.5, length: 2, height: 0.6,
  armX: null, armY: null, slabThickness: null, unit: 'm', quantity: 4, note: 'แปลนฐานราก', ...patch});

describe('AI model changes', () => {
  it('accepts typed edits and applies them through domain validation', () => {
    const changes = parseModelChanges([{field: 'height', value: 1200}, {field: 'walerType', value: 'C'}]);
    expect(applyChanges({...defaults, confirmed: true}, changesToInput(changes))).toMatchObject({height: 1200, walerType: 'C', confirmed: false});
    expect(validateChatReply({text: '', attachments: [], changes: [{field: 'plywood', value: 18}]}).changes).toEqual([{field: 'plywood', value: 18}]);
  });
  it.each([
    [[{field: 'unknown', value: 1}]],
    [[{field: 'height', value: '1200'}]],
    [[{field: 'kind', value: 'SLAB'}]],
    [[{field: 'height', value: 1}, {field: 'height', value: 2}]],
    [{field: 'height', value: 1}],
  ])('rejects malformed edits %j', raw => {
    expect(() => parseModelChanges(raw)).toThrow();
  });
  it('rejects out-of-range edits at apply time', () => {
    expect(() => applyChanges(defaults, changesToInput(parseModelChanges([{field: 'rhsT', value: 40}])))).toThrow();
  });
});

describe('AI elements to draft cases', () => {
  it('converts units, keeps the case unconfirmed and clamps spacings to the element size', () => {
    const {input, missing} = elementToInput(element({width: 40, length: 40, height: 30, unit: 'cm'}), 'COLUMN');
    expect(missing).toEqual([]);
    expect(input).toMatchObject({kind: 'COLUMN', width: 400, length: 400, height: 300, confirmed: false, studSpacing: 300, walerSpacing: 300, tieSpacing: 400});
    expect(elementToInput(element()).input).toMatchObject({kind: 'FOOTING', width: 1500, length: 2000, height: 600});
  });
  it('reports missing values instead of guessing them', () => {
    expect(elementToInput(element({height: null, unit: 'UNKNOWN'}))).toEqual({input: null, missing: ['หน่วย', 'ลึก']});
    expect(elementToInput(element({shape: 'L'})).missing).toEqual(['แขน X', 'แขน Y']);
  });
  it('validates provider element payloads', () => {
    expect(parseAiElements(undefined)).toEqual([]);
    expect(parseAiElements([element()])).toHaveLength(1);
    expect(() => parseAiElements([{...element(), width: -1}])).toThrow();
    expect(() => parseAiElements([{...element(), kind: 'ROOF'}])).toThrow();
    expect(parseAiElements([{...element(), kind: 'SLAB'}])[0].kind).toBe('SLAB');
    const {slabThickness: _s, ...legacy} = element();
    expect(parseAiElements([legacy])[0].slabThickness).toBeNull();
  });
  it('drafts beam, slab and wall cases from the per-kind field meanings', () => {
    const beam = elementToCase(element({name: 'B1', kind: 'BEAM', width: 30, length: 600, height: 60, slabThickness: 12, unit: 'cm', quantity: 2}), 'BEAM').item!;
    expect(beam).toMatchObject({name: 'B1 (×2) · คาน', workflowElementType: 'BEAM', beam: {b: 300, length: 6000, h: 600, slabSides: 2, slabT: 120, shoreWidth: 900, confirmed: false}});
    const noSlab = elementToCase(element({kind: 'BEAM', width: 0.4, length: 8, height: 0.8}), 'BEAM').item!;
    expect(noSlab.beam).toMatchObject({slabSides: 0, slabT: 0, shoreWidth: 1000});
    expect(noSlab.notes[0]).toContain('ไม่ระบุความหนาพื้น');
    expect(elementToCase(element({kind: 'SLAB', width: 6, length: 4, height: 0.15}), 'SLAB').item!.slab).toMatchObject({lx: 6000, ly: 4000, t: 150, confirmed: false});
    expect(elementToCase(element({kind: 'WALL', width: 8, length: 0.3, height: 4}), 'WALL').item!.wall).toMatchObject({length: 8000, t: 300, height: 4000, braceHeight: 2000});
    expect(elementToCase(element({kind: 'SLAB', height: null}), 'SLAB')).toEqual({item: null, missing: ['หนา']});
    expect(elementToCase(element({kind: 'WALL', length: null, unit: 'UNKNOWN'}), 'WALL').missing).toEqual(['หน่วย', 'หนา']);
    expect(() => elementToCase(element({kind: 'BEAM', width: 5, length: 6, height: 0.6}), 'BEAM')).toThrow();
  });
});

describe('3D export', () => {
  it('writes a self-contained glTF with one coloured mesh per layer', () => {
    const scene = buildScene(calculate(defaults)), gltf = JSON.parse(toGltf(scene.solids, 'F01'));
    expect(gltf.asset.version).toBe('2.0');
    expect(gltf.meshes.map((m: {name: string}) => m.name)).toEqual(['CONCRETE', 'PLYWOOD', 'STUD', 'WALER', 'TIE']);
    const bytes = atob(gltf.buffers[0].uri.split(',')[1]).length;
    expect(bytes).toBe(gltf.buffers[0].byteLength);
    expect(gltf.bufferViews.reduce((s: number, v: {byteLength: number}) => s + v.byteLength, 0)).toBe(bytes);
    const tris = scene.solids.reduce((s, x) => s + x.triangles.length, 0);
    expect(gltf.accessors.filter((a: {type: string}) => a.type === 'SCALAR').reduce((s: number, a: {count: number}) => s + a.count, 0)).toBe(tris * 3);
  });
});
