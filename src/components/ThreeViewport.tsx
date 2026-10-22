import {useEffect, useImperativeHandle, useRef, useState, type Ref} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GROUP_COLOR, type FormworkModel3D, type PartGroup} from '../domain/model3d';

export type ViewName = 'iso' | 'front' | 'side' | 'top';
export interface ViewportApi {setView: (v: ViewName) => void; rotate: (axis: 'x' | 'y' | 'z', deg: number) => void; zoom: (factor: number) => void; fit: () => void}
interface Props {model: FormworkModel3D; selected: PartGroup | null; hidden: PartGroup[]; onPick: (group: PartGroup | null, partId: string | null) => void; ref?: Ref<ViewportApi>}

const TRANSPARENT: PartGroup[] = ['concrete', 'soil'];
const DIRS: Record<ViewName, THREE.Vector3> = {iso: new THREE.Vector3(-1, -1.35, 0.95), front: new THREE.Vector3(0, -1, 0.0001), side: new THREE.Vector3(1, 0, 0.0001), top: new THREE.Vector3(0, -0.0001, 1)};

function label(text: string, color: string) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; g.fillStyle = color; g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 32, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(c), depthTest: false})); s.renderOrder = 10; return s;
}

/**
 * WebGL view of the formwork model (Z up, model millimetres). Drag = orbit, right drag = pan, wheel = zoom;
 * a click without dragging picks a part and reports its component group. The camera is kept across model edits.
 */
export function ThreeViewport({model, selected, hidden, onPick, ref}: Props) {
  const host = useRef<HTMLDivElement>(null), [error, setError] = useState(''), [hover, setHover] = useState<{x: number; y: number; text: string} | null>(null);
  const ctx = useRef<{renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; root: THREE.Group; helpers: THREE.Group;
    meshes: THREE.Mesh[]; materials: Map<string, THREE.MeshStandardMaterial>; radius: number; fitted: boolean} | null>(null);
  const pickRef = useRef(onPick); pickRef.current = onPick;

  useEffect(() => {
    const el = host.current!; let renderer: THREE.WebGLRenderer;
    try {renderer = new THREE.WebGLRenderer({antialias: true});} catch {setError('เบราว์เซอร์นี้เปิด WebGL ไม่ได้ จึงแสดงโมเดล 3D ไม่ได้ (ยังแก้ข้อมูลจากรายการชิ้นส่วนด้านขวาได้)'); return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setClearColor('#f4f7fa');
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, 10, 1e6);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.screenSpacePanning = true;
    scene.add(new THREE.HemisphereLight('#ffffff', '#8a8f96', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.8); sun.position.set(-0.6, -1, 1.4); scene.add(sun);
    const root = new THREE.Group(), helpers = new THREE.Group(); scene.add(root, helpers);
    ctx.current = {renderer, scene, camera, controls, root, helpers, meshes: [], materials: new Map(), radius: 1000, fitted: false};
    const resize = () => {const w = el.clientWidth || 600, h = el.clientHeight || 420; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();};
    resize(); const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; ro?.observe(el);
    let frame = 0; const loop = () => {controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(loop);}; loop();
    // Click (no drag) picks the nearest formwork part; transparent concrete/soil is only picked when nothing else is behind it.
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down: {x: number; y: number} | null = null, last = 0;
    const hit = (e: PointerEvent) => {
      const b = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(ndc, camera); const hits = ray.intersectObjects(ctx.current!.meshes.filter(m => m.visible), false);
      return hits.find(h => !TRANSPARENT.includes(h.object.userData.group)) ?? hits[0];
    };
    const onDown = (e: PointerEvent) => {down = {x: e.clientX, y: e.clientY};};
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || e.button !== 0) {down = null; return;}
      down = null; const h = hit(e); pickRef.current(h ? h.object.userData.group : null, h ? h.object.userData.id : null);
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons || performance.now() - last < 60) return; last = performance.now();
      const h = hit(e), b = el.getBoundingClientRect();
      setHover(h ? {x: e.clientX - b.left, y: e.clientY - b.top, text: h.object.userData.label} : null);
    };
    const el2 = renderer.domElement; el2.addEventListener('pointerdown', onDown); el2.addEventListener('pointerup', onUp); el2.addEventListener('pointermove', onMove);
    el2.addEventListener('pointerleave', () => setHover(null));
    return () => {
      cancelAnimationFrame(frame); ro?.disconnect(); controls.dispose();
      el2.removeEventListener('pointerdown', onDown); el2.removeEventListener('pointerup', onUp); el2.removeEventListener('pointermove', onMove);
      scene.traverse(o => {const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(x => x.dispose());});
      renderer.dispose(); el2.remove(); ctx.current = null;
    };
  }, []);

  function fit(dir = DIRS.iso) {
    const c = ctx.current; if (!c) return;
    const sphere = new THREE.Box3().setFromObject(c.root).getBoundingSphere(new THREE.Sphere()), dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(c.camera.fov / 2)) * 1.05;
    c.controls.target.copy(sphere.center); c.camera.position.copy(sphere.center).addScaledVector(dir.clone().normalize(), dist);
    c.camera.near = Math.max(1, dist / 500); c.camera.far = dist * 20; c.camera.updateProjectionMatrix(); c.controls.update();
  }

  // Rebuild meshes when the model changes (edits); keep the camera unless this is the first model.
  useEffect(() => {
    const c = ctx.current; if (!c) return;
    c.root.traverse(o => {const m = o as THREE.Mesh; m.geometry?.dispose?.(); if ((o as THREE.LineSegments).isLineSegments) ((o as THREE.LineSegments).material as THREE.Material).dispose();});
    c.root.clear(); c.helpers.clear(); c.meshes = [];
    for (const p of model.parts) {
      const key = p.group; let mat = c.materials.get(key);
      if (!mat) {
        const t = TRANSPARENT.includes(p.group);
        mat = new THREE.MeshStandardMaterial({color: GROUP_COLOR[p.group], roughness: 0.75, metalness: p.group === 'concrete' || p.group === 'plywood' ? 0 : 0.15,
          transparent: t, opacity: t ? 0.28 : 1, depthWrite: !t, side: t ? THREE.DoubleSide : THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1});
        c.materials.set(key, mat);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p.vertices.flat(), 3)); g.setIndex(p.triangles.flat());
      const flat = g.toNonIndexed(); flat.computeVertexNormals(); g.dispose();
      const mesh = new THREE.Mesh(flat, mat); mesh.userData = {group: p.group, id: p.id, label: p.label};
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(flat, 20), new THREE.LineBasicMaterial({color: TRANSPARENT.includes(p.group) ? '#6b7480' : '#1d2733', transparent: true, opacity: TRANSPARENT.includes(p.group) ? 0.5 : 0.55}));
      edges.userData = {group: p.group}; mesh.add(edges);
      c.root.add(mesh); c.meshes.push(mesh);
    }
    // Ground grid (XY plane) and labelled X/Y/Z axes at the model corner.
    const {min, max} = model.bounds, span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1), step = span > 6000 ? 1000 : 500;
    const size = Math.ceil((Math.max(max[0] - min[0], max[1] - min[1]) + 2 * step) / step) * step;
    const grid = new THREE.GridHelper(size, size / step, '#b8c4d0', '#dde4ea'); grid.rotation.x = Math.PI / 2;
    grid.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, Math.min(0, min[2]) - 1); c.helpers.add(grid);
    const axisLen = span * 0.18, o = new THREE.Vector3(min[0] - step * 0.6, min[1] - step * 0.6, Math.min(0, min[2]));
    ([['X', '#c0392b', new THREE.Vector3(1, 0, 0)], ['Y', '#1e7b34', new THREE.Vector3(0, 1, 0)], ['Z', '#1d4e89', new THREE.Vector3(0, 0, 1)]] as const).forEach(([name, color, d]) => {
      c.helpers.add(new THREE.ArrowHelper(d, o, axisLen, color, axisLen * 0.14, axisLen * 0.07));
      const s = label(name, color); s.position.copy(o).addScaledVector(d, axisLen * 1.18); s.scale.setScalar(axisLen * 0.22); c.helpers.add(s);
    });
    c.radius = span;
    if (!c.fitted) {fit(); c.fitted = true;}
  }, [model]);

  // Visibility and selection highlight.
  useEffect(() => {
    const c = ctx.current; if (!c) return;
    for (const m of c.meshes) {
      const g = m.userData.group as PartGroup; m.visible = !hidden.includes(g);
      const on = selected === g, edges = m.children[0] as THREE.LineSegments | undefined;
      m.material = on ? highlight(c.materials.get(g)!) : c.materials.get(g)!;
      if (edges) {(edges.material as THREE.LineBasicMaterial).color.set(on ? '#e67e00' : TRANSPARENT.includes(g) ? '#6b7480' : '#1d2733'); (edges.material as THREE.LineBasicMaterial).opacity = on ? 1 : 0.55;}
    }
  }, [model, selected, hidden]);
  const hl = useRef(new Map<THREE.Material, THREE.MeshStandardMaterial>());
  function highlight(base: THREE.MeshStandardMaterial) {
    let m = hl.current.get(base);
    if (!m) {m = base.clone(); m.emissive.set('#ff8c00'); m.emissiveIntensity = 0.55; if (base.transparent) m.opacity = 0.45; hl.current.set(base, m);}
    return m;
  }

  useImperativeHandle(ref, () => ({
    setView: v => fit(DIRS[v]),
    fit: () => fit(ctx.current ? ctx.current.camera.position.clone().sub(ctx.current.controls.target) : DIRS.iso),
    rotate: (axis, deg) => {
      const c = ctx.current; if (!c) return;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0), THREE.MathUtils.degToRad(deg));
      const off = c.camera.position.clone().sub(c.controls.target).applyQuaternion(q);
      // Stay off the poles so the Z-up orbit keeps a defined heading.
      const len = off.length(); if (Math.abs(off.z) > len * 0.999) off.x += len * 0.002;
      c.camera.position.copy(c.controls.target).add(off); c.controls.update();
    },
    zoom: f => {const c = ctx.current; if (!c) return; const off = c.camera.position.clone().sub(c.controls.target).multiplyScalar(f); c.camera.position.copy(c.controls.target).add(off); c.controls.update();},
  }), []);

  return <div className="viewport3d" ref={host} data-testid="viewport3d">
    {error && <div className="warning viewport3d-error">{error}</div>}
    {hover && <div className="viewport3d-hover" style={{left: hover.x + 14, top: hover.y + 12}}>{hover.text}</div>}
  </div>;
}
export default ThreeViewport;
