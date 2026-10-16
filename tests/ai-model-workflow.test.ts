import {describe, expect, it} from 'vitest';
import {calculate, defaults} from '../src/domain';
import {applyChanges, buildScene, changesToInput, parseModelChanges, toGltf} from '../src/domain/scene';
import {validateChatReply} from '../src/drawingChat';
import {elementToInput, parseAiElements, type AiElement} from '../src/aiElements';

const element = (patch: Partial<AiElement> = {}): AiElement => ({name: 'F1', kind: 'FOOTING', shape: 'RECTANGLE', width: 1.5, length: 2, height: 0.6,
  armX: null, armY: null, unit: 'm', quantity: 4, note: 'แปลนฐานราก', ...patch});

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
    expect(elementToInput(element({height: null, unit: 'UNKNOWN'}))).toEqual({input: null, missing: ['หน่วย', 'สูง/ลึก']});
    expect(elementToInput(element({shape: 'L'})).missing).toEqual(['แขน X', 'แขน Y']);
  });
  it('validates provider element payloads', () => {
    expect(parseAiElements(undefined)).toEqual([]);
    expect(parseAiElements([element()])).toHaveLength(1);
    expect(() => parseAiElements([{...element(), width: -1}])).toThrow();
    expect(() => parseAiElements([{...element(), kind: 'SLAB'}])).toThrow();
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
