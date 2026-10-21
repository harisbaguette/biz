import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { AlertTriangle, LockKeyhole, LoaderCircle, Clock3, Package, Factory, ScanLine, Truck, RotateCcw } from "lucide-react";
import type { Account, Command, Layer, Snapshot } from "../types";
import { severity, status, n, laneCondition, uploadCondition } from "../data";
import { siteLayout, processes, arrangeLabels, type ProcessKey, type Rect, type LabelPosition } from "./layout";
import { buildProcessFacility } from "./processFacilities";
import "./World.css";

export interface WorldHandle { zoom: (delta: number) => void; reset: () => void; rotate: () => void; focus: (id: string) => void }
interface Props {
  snapshot: Snapshot; selected: string | null; layer: Layer; reduced: boolean; stale: boolean;
  onSelect: (id: string) => void; onReady: () => void;
  onInspectProcess?: (key: ProcessKey) => void; activeProcess?: ProcessKey | null;
  commands?: Command[]; thumbnails?: string[];
}
const modelNames = Array.from({ length: 13 }, (_, i) => "building-" + String.fromCharCode(97 + i));
const styleLabels: Record<string, string> = { gouache: "구아슈", people_bold_editorial: "굵은선", people_minimal_guide: "안내인물", people_fine_educational: "가는펜", people_retro_editorial: "레트로", people_clear_line: "교재선화", people_chunky_cartoon: "잉크카툰", people_relaxed_doodle: "둥근낙서", people_graphic_cel: "면채색", people_pencil_print: "색연필", people_loose_watercolor: "펜수채", people_marker_wash: "마커수채", people_warm_storybook: "빈티지" };

function pending(a: Account, commands: Command[] = []) {
  return commands.some(c => ["pending", "queued", "running"].includes(c.status) && String(c.payload.accountId ?? c.payload.account_id ?? "") === a.id);
}
function AccountState({ account, waiting, stale }: { account: Account; waiting: boolean; stale: boolean }) {
  if (stale || waiting) return <Clock3 size={12} />;
  if (account.status === "login_required" || !account.bound) return <LockKeyhole size={12} />;
  if (severity(account) === "danger") return <AlertTriangle size={12} />;
  if (account.running) return <LoaderCircle size={12} />;
  return <span className="account-state-dot" />;
}
function processState(key: ProcessKey, snapshot: Snapshot, stale: boolean) {
  if (stale) return { label: "확인 필요", tone: "unknown", active: false };
  if (key === "generation" || key === "review") {
    const lane = laneCondition(snapshot.automation.lanes[key], snapshot.automation.productionEnabled);
    if (key === "review") {
      const metadata = laneCondition(snapshot.automation.lanes.metadata, snapshot.automation.productionEnabled);
      const current = metadata.issue ? { ...metadata, label: "메타 " + metadata.label } : lane;
      return { ...current, active: current.tone === "active" || (!current.issue && metadata.tone === "active") };
    }
    return { ...lane, active: lane.tone === "active" };
  }
  if (key === "stock") {
    const ready = snapshot.accounts.reduce((v, a) => v + a.ready, 0);
    const target = snapshot.accounts.reduce((v, a) => v + a.target, 0);
    return { label: `${n(ready)} / ${n(target)}`, tone: "normal", active: false };
  }
  const waiting = snapshot.accounts.reduce((v, a) => v + (a.counts.submitted || 0), 0);
  const issues = snapshot.accounts.filter(a => severity(a) === "danger" || severity(a) === "warning").length;
  const health = uploadCondition(snapshot), active = health.active;
  return { label: health.issue ? health.label : issues ? `${issues}곳 확인` : active ? health.label : `심사 ${n(waiting)}`, tone: health.issue || issues ? "warning" : active ? "active" : "normal", active };
}
function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  object.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      materials.add(m);
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
    }
  });
  geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose());
}
const World = forwardRef<WorldHandle, Props>(function World(props, ref) {
  const host = useRef<HTMLDivElement>(null), propsRef = useRef(props), controller = useRef<WorldHandle | null>(null);
  const markers = useRef(new Map<string, HTMLButtonElement>()), leaders = useRef(new Map<string, SVGLineElement>());
  const [error, setError] = useState<string | null>(null), [loaded, setLoaded] = useState(false), [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState(0), [missingModels, setMissingModels] = useState(0), [appearance, setAppearance] = useState(0);
  propsRef.current = props;
  useImperativeHandle(ref, () => ({ zoom: d => controller.current?.zoom(d), reset: () => controller.current?.reset(), rotate: () => controller.current?.rotate(), focus: id => controller.current?.focus(id) }), []);
  useEffect(() => {
    if (!host.current) return;
    const element: HTMLDivElement = host.current;
    setError(null); setLoaded(false); setMissingModels(0);
    let disposed = false, lostContext = false, frame = 0, dirty = true, ready = false;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" }); }
    catch { setError("3D 화면을 시작하지 못했습니다."); propsRef.current.onReady(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute("aria-label", "미리캔버스 사업 단지. 시설을 선택하거나 드래그하여 이동합니다.");
    renderer.domElement.setAttribute("role", "img"); element.prepend(renderer.domElement);
    const css = getComputedStyle(element);
    const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const ui = { canvas: token("--ui-bg", "#ffffff"), paper: token("--ui-surface", "#ffffff"), surface: token("--ui-surface-2", "#f1f3f5"), ink: token("--ui-fg", "#101214"), muted: token("--ui-fg-muted", "#4b5057"), accent: token("--ui-accent", "#107049"), accentSoft: token("--ui-accent-soft", "#e4efe9") };
    // UI surfaces reverse in dark mode; physical light and material albedo must not.
    const dark = new THREE.Color(ui.canvas).getHSL({ h: 0, s: 0, l: 0 }).l < 0.3;
    const mineral = (amount: number) => "#" + new THREE.Color(ui.canvas).lerp(new THREE.Color(ui.ink), amount).getHexString();
    const theme = dark ? { ...ui, paper: mineral(0.28), surface: mineral(0.13), muted: mineral(0.045), ink: ui.canvas } : ui;
    const daylight = "#ffffff", groundBounce = "#4b5057";
    const scene = new THREE.Scene(); scene.background = new THREE.Color(ui.canvas);
    const layout = siteLayout(element.clientWidth, element.clientHeight);
    const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 300);
    const initialDirection = layout.cols === 3 ? new THREE.Vector3(0, 52, 80) : new THREE.Vector3(18, 65, 70);
    camera.position.copy(initialDirection);
    // The containing element owns both labels and canvas: a drag can begin on either.
    const controls = new OrbitControls(camera, element);
    controls.enableDamping = true; controls.dampingFactor = 0.12;
    controls.maxPolarAngle = Math.PI * 0.40; controls.minPolarAngle = Math.PI * 0.13;
    controls.minZoom = 0.65; controls.maxZoom = 3.8; controls.screenSpacePanning = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    controls.addEventListener("change", () => { dirty = true; });
    controls.addEventListener("start", () => { targetPosition = null; targetZoom = null; overview = false; });
    scene.add(new THREE.HemisphereLight(daylight, groundBounce, 1.65));
    const sun = new THREE.DirectionalLight(daylight, 2.35); sun.position.set(-26, 45, 22); sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536); Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 125 });
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3; scene.add(sun);
    const fill = new THREE.DirectionalLight(daylight, 0.5); fill.position.set(25, 18, -22); scene.add(fill);
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const mat = (color: string) => {
      if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.88 }));
      return materials.get(color)!;
    };
    const staticMeshes: THREE.Mesh[] = [];
    const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D = scene, radius = 0.06, fixed = true) => {
      const mesh = new THREE.Mesh(radius ? new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, h / 2)) : new THREE.BoxGeometry(w, h, d), mat(color));
      mesh.position.set(x, y, z); mesh.castShadow = h > 0.35; mesh.receiveShadow = true; parent.add(mesh);
      if (fixed) staticMeshes.push(mesh); return mesh;
    };
    const centerX = (layout.minX + layout.maxX) / 2, centerZ = (layout.minZ + layout.maxZ) / 2;
    const siteWidth = layout.maxX - layout.minX, siteDepth = layout.maxZ - layout.minZ;
    box(240, 0.1, 240, theme.canvas, 0, -1.05, 0, scene, 0);
    box(siteWidth + 1.2, 0.30, siteDepth + 1.2, theme.surface, centerX, -0.17, centerZ, scene, 0.15);
    box(siteWidth + 1.0, 0.12, siteDepth + 1.0, theme.surface, centerX, 0.02, centerZ, scene, 0.3);
    // A connected service spine and short streets replace the ornamental canal.
    const streetRows = [...new Set([...layout.plots, ...layout.facilities].map(p => p[1] + 3.3))];
    for (const z of streetRows) {
      box(siteWidth, 0.05, 1.75, theme.muted, centerX, 0.12, z, scene, 0);
      for (let x = layout.minX + 1; x < layout.maxX; x += 3) box(1.2, 0.015, 0.055, theme.paper, x, 0.157, z, scene, 0);
    }
    const spineX = layout.maxX - 0.8;
    box(1.6, 0.06, siteDepth, theme.muted, spineX, 0.13, centerZ, scene, 0);
    // The four actual processing stages share a directional service route, with no simulated cargo.
    function routeArrow(from: readonly [number, number], to: readonly [number, number]) {
      const dx = to[0] - from[0], dz = to[1] - from[1], length = Math.hypot(dx, dz);
      const strip = box(length, 0.02, 0.10, theme.accent, (from[0] + to[0]) / 2, 0.185, (from[1] + to[1]) / 2, scene, 0);
      strip.rotation.y = -Math.atan2(dz, dx);
      const shape = new THREE.Shape(); shape.moveTo(0.5, 0); shape.lineTo(-0.3, 0.32); shape.lineTo(-0.3, -0.32); shape.closePath();
      const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat(theme.paper));
      arrow.rotation.x = -Math.PI / 2; arrow.rotation.z = -Math.atan2(dz, dx);
      arrow.position.set((from[0] + to[0]) / 2, 0.20, (from[1] + to[1]) / 2); scene.add(arrow);
    }
    for (let i = 0; i < 3; i++) {
      const from = layout.facilities[i], to = layout.facilities[i + 1];
      if (from[1] === to[1]) routeArrow([from[0] + Math.sign(to[0] - from[0]), from[1] + 3.3], [to[0] - Math.sign(to[0] - from[0]), to[1] + 3.3]);
      else {
        routeArrow([from[0], from[1] + 3.3], [spineX, from[1] + 3.3]);
        routeArrow([spineX, from[1] + 3.3], [spineX, to[1] + 3.3]);
        routeArrow([spineX, to[1] + 3.3], [to[0], to[1] + 3.3]);
      }
    }
    const stockBatches: { mesh: THREE.InstancedMesh; sources: THREE.Mesh[]; slots: THREE.Object3D[] }[] = [];
    const accountGroups = new Map<string, THREE.Group>(), selections = new Map<string, THREE.Mesh>(), cargo = new Map<string, THREE.Object3D[]>(), lights = new Map<string, THREE.Mesh>();
    const processStock: THREE.Object3D[] = [], processScanners: THREE.Mesh[] = [];
    const processGroups = new Map<ProcessKey, THREE.Group>(), processLights = new Map<ProcessKey, THREE.Mesh>(), moving = new Map<ProcessKey, THREE.Mesh>();
    const buildingGroup = new THREE.Group(); scene.add(buildingGroup);
    const loader = new GLTFLoader(), models = new Map<string, THREE.Group>(), abort = new AbortController();
    const modelNamesToLoad = [...modelNames, "truck", "box", "tree-oak"];
    async function load(name: string) {
      const response = await fetch(`/assets/models/${name}.glb`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(18000)]) });
      if (!response.ok) throw new Error(`Model HTTP ${response.status}: ${name}`);
      const gltf = await loader.parseAsync(await response.arrayBuffer(), "/assets/models/");
      if (disposed) { disposeObject(gltf.scene); return; }
      models.set(name, gltf.scene);
    }
    function placeModel(name: string, parent: THREE.Object3D, width: number, depth: number, heightLimit = 5) {
      const source = models.get(name);
      if (!source) return null;
      const object = source.clone(true); parent.add(object); parent.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(object), size = bounds.getSize(new THREE.Vector3());
      object.scale.setScalar(Math.min(width / Math.max(size.x, 0.01), depth / Math.max(size.z, 0.01), heightLimit / Math.max(size.y, 0.01)));
      const normalized = new THREE.Box3().setFromObject(object), center = normalized.getCenter(new THREE.Vector3());
      const origin = parent.getWorldPosition(new THREE.Vector3());
      object.position.set(origin.x - center.x, origin.y + 0.32 - normalized.min.y, origin.z - center.z);
      object.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
      return object;
    }
    function signal(parent: THREE.Object3D, x = 2.3) {
      box(0.07, 1.35, 0.07, theme.ink, x, 0.98, 1.7, parent, 0, false);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6), new THREE.MeshStandardMaterial({ color: theme.muted, emissive: theme.muted, emissiveIntensity: 0.3 }));
      mesh.position.set(x, 1.72, 1.7); parent.add(mesh); return mesh;
    }
    function buildSite() {
      propsRef.current.snapshot.accounts.forEach((a) => {
        const position = layout.plots[a.number - 1]; if (!position) return;
        const [x, z] = position, group = new THREE.Group(); group.position.set(x, 0, z); group.userData.accountId = a.id; buildingGroup.add(group); accountGroups.set(a.id, group);
        box(6.86, 0.22, 6.15, theme.surface, 0, 0.20, 0, group, 0.02);
        box(6.64, 0.25, 5.93, theme.paper, 0, 0.22, 0, group, 0.02);
        const selection = box(7.1, 0.10, 6.45, theme.accent, 0, 0.13, 0, group, 0.12, false); selection.visible = false; selections.set(a.id, selection);
        const building = placeModel(modelNames[a.number - 1], group, 4.4, 3.5, 4.4);
        if (building) building.position.z -= 0.65;
        else {
          // A missing individual model retains a real, selectable facility with the same identity.
          box(3.8, 2.2, 3.1, theme.paper, 0, 1.4, -0.5, group);
          box(4.1, 0.18, 3.4, theme.accent, 0, 2.59, -0.5, group);
          box(1.7, 1.45, 0.07, theme.muted, 0, 1.12, 1.08, group, 0);
        }
        lights.set(a.id, signal(group));
        const slots: THREE.Object3D[] = [];
        for (let j = 0; j < 10; j++) {
          const xSlot = -2.43 + (j % 5) * 0.70, zSlot = 1.62 + Math.floor(j / 5) * 0.68;
          box(0.63, 0.025, 0.59, theme.surface, xSlot, 0.33, zSlot, group, 0.02);
          const itemGroup = new THREE.Group(); itemGroup.position.set(xSlot, 0.02, zSlot); group.add(itemGroup);
          if (!placeModel("box", itemGroup, 0.51, 0.51, 0.56)) box(0.50, 0.48, 0.50, theme.accent, 0, 0.57, 0, itemGroup, 0.02, false);
          slots.push(itemGroup);
        }
        cargo.set(a.id, slots);
        group.traverse(o => { o.userData.accountId = a.id; });
      });
      processes.forEach((process, i) => {
        const [x, z] = layout.facilities[i], group = new THREE.Group(); group.position.set(x, 0, z); group.userData.process = process.key; buildingGroup.add(group); processGroups.set(process.key, group);
        box(7.6, 0.25, 6.3, theme.surface, 0, 0.18, 0, group, 0.15);
        box(7.2, 0.14, 5.9, theme.paper, 0, 0.36, 0, group, 0.12);
        const facility = buildProcessFacility({ key: process.key, group,
          box: (w, h, d, color, x, y, z, fixed = true) => box(w, h, d, color, x, y, z, group, 0.035, fixed),
          model: placeModel, material: mat,
          palette: { machine: theme.accent, steel: theme.muted, roller: theme.surface, belt: theme.ink, capacity: theme.accent, concrete: theme.paper },
        });
        processStock.push(...facility.stockSlots);
        if (facility.scanner) processScanners.push(facility.scanner);
        // Static components are merged for rendering; keep the whole composite directly selectable.
        const hitVolume = new THREE.Mesh(new THREE.BoxGeometry(6.6, 4.0, 4.9), new THREE.MeshBasicMaterial({ visible: false }));
        hitVolume.position.set(0, 2.25, -0.1); group.add(hitVolume);
        processLights.set(process.key, signal(group, 3.0));
        const indicator = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.075, 6, 20), new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.6 }));
        indicator.position.set(-2.9, 0.6, 1.6); indicator.rotation.x = -Math.PI / 2; group.add(indicator); moving.set(process.key, indicator);
        group.traverse(o => { o.userData.process = process.key; });
      });
      // Only a few perimeter trees and lamps remain, with no implied business output.
      for (const [x, z] of [[layout.minX + 0.4, layout.minZ + 1], [layout.minX + 0.4, layout.maxZ - 1], [layout.maxX - 0.4, layout.maxZ - 1]]) {
        const group = new THREE.Group(); group.position.set(x, 0, z); scene.add(group); placeModel("tree-oak", group, 1.6, 1.6, 2.8);
      }
      // Stock uses the supplied box geometry in one instance batch per material, not 130 draw calls.
      scene.updateMatrixWorld(true);
      const stockMeshes = new Map<string, { sources: THREE.Mesh[]; slots: THREE.Object3D[] }>();
      for (const slots of [...cargo.values(), processStock]) for (const slot of slots) slot.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const key = object.geometry.uuid + (Array.isArray(object.material) ? object.material.map(m => m.uuid).join() : object.material.uuid);
        const batch = stockMeshes.get(key) || { sources: [], slots: [] };
        batch.sources.push(object); batch.slots.push(slot); stockMeshes.set(key, batch);
      });
      for (const batch of stockMeshes.values()) {
        const first = batch.sources[0], mesh = new THREE.InstancedMesh(first.geometry, first.material, batch.sources.length);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
        scene.add(mesh); batch.sources.forEach(object => { object.visible = false; }); stockBatches.push({ mesh, ...batch });
      }
      // Merge stationary ground geometry, retaining individual selection/stock/working objects.
      scene.updateMatrixWorld(true);
      const batches = new Map<THREE.Material, THREE.Mesh[]>();
      for (const mesh of staticMeshes) {
        const material = mesh.material as THREE.Material;
        batches.set(material, [...(batches.get(material) || []), mesh]);
      }
      for (const [material, meshes] of batches) {
        const parts = meshes.map(m => (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld));
        const merged = mergeGeometries(parts, false);
        if (merged) { const mesh = new THREE.Mesh(merged, material); mesh.receiveShadow = true; mesh.castShadow = true; scene.add(mesh); meshes.forEach(m => { m.removeFromParent(); m.geometry.dispose(); }); }
        parts.forEach(g => g.dispose());
      }
      renderer.shadowMap.needsUpdate = true; dirty = true; ready = true; setMissingModels(modelNames.filter(name => !models.has(name)).length); setLoaded(true); propsRef.current.onReady();
      if (window.innerWidth >= 1024 && propsRef.current.selected) controller.current?.focus(propsRef.current.selected);
    }
    Promise.allSettled(modelNamesToLoad.map(load)).then(() => { if (!disposed) buildSite(); });
    let targetPosition: THREE.Vector3 | null = null, targetZoom: number | null = null, overview = true;
    let safe: Rect = { left: 16, right: element.clientWidth - 16, top: 140, bottom: element.clientHeight - 110 };
    function readSafe() {
      const width = element.clientWidth, height = element.clientHeight;
      const inset = width <= 480 ? 24 : 28;
      const verticalInset = layout.cols === 3 && width <= 480 ? Math.max(4, Math.min(28, (height - 284) / 2)) : 28;
      safe = { left: inset, right: width - inset, top: verticalInset, bottom: height - verticalInset };
      if (height < 240) safe = { left: 24, right: width - 24, top: 24, bottom: height - 24 };
    }
    const corners: THREE.Vector3[] = [];
    for (const x of [layout.minX - 1, layout.maxX + 1]) for (const z of [layout.minZ - 1, layout.maxZ + 1]) for (const y of [0, 4.6]) corners.push(new THREE.Vector3(x, y, z));
    function fit(resetAngle = false) {
      readSafe();
      const direction = resetAngle ? initialDirection.clone() : camera.position.clone().sub(controls.target).normalize().multiplyScalar(initialDirection.length());
      controls.target.set(centerX, 0, centerZ); camera.position.copy(controls.target).add(direction);
      // Use the current camera basis to fit both axes, then shift the view into the HUD's safe rectangle.
      camera.lookAt(controls.target); camera.updateMatrixWorld(true);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const xs = corners.map(p => p.clone().sub(controls.target).dot(right)), ys = corners.map(p => p.clone().sub(controls.target).dot(up));
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const availableW = Math.max(80, safe.right - safe.left - 12), availableH = Math.max(80, safe.bottom - safe.top - 12);
      const units = Math.max((maxX - minX) / availableW, (maxY - minY) / availableH);
      const width = element.clientWidth, height = element.clientHeight;
      camera.left = -width * units / 2; camera.right = width * units / 2; camera.top = height * units / 2; camera.bottom = -height * units / 2;
      const safeCX = (safe.left + safe.right) / 2, safeCY = (safe.top + safe.bottom) / 2;
      const shift = right.multiplyScalar((minX + maxX) / 2 - (safeCX - width / 2) * units).add(up.multiplyScalar((minY + maxY) / 2 + (safeCY - height / 2) * units));
      controls.target.add(shift); camera.position.add(shift); camera.zoom = 1; camera.updateProjectionMatrix(); controls.update(); camera.updateMatrixWorld(true);
      targetPosition = null; targetZoom = null; dirty = true;
    }
    controller.current = {
      zoom: delta => { targetZoom = THREE.MathUtils.clamp((targetZoom ?? camera.zoom) * (delta > 0 ? 1.22 : 1 / 1.22), 0.65, 3.8); overview = false; dirty = true; },
      rotate: () => { const offset = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4); camera.position.copy(controls.target).add(offset); controls.update(); camera.updateMatrixWorld(true); if (overview) fit(); dirty = true; },
      reset: () => { overview = true; fit(true); },
      focus: id => {
        const a = propsRef.current.snapshot.accounts.find(a => a.id === id), p = a && layout.plots[a.number - 1]; if (!p) return;
        targetPosition = new THREE.Vector3(p[0], 0.8, p[1]);
        targetZoom = 1.45; overview = false; dirty = true;
      },
    };
    // A gesture is selectable only when it stayed a single, primary tap throughout its lifetime.
    const pointers = new Set<number>();
    let gesture: { id: number; x: number; y: number; target: string | null; process: ProcessKey | null; cancelled: boolean } | null = null;
    function down(e: PointerEvent) {
      if (lostContext) return;
      pointers.add(e.pointerId);
      if (pointers.size > 1) { if (gesture) gesture.cancelled = true; return; }
      const label = (e.target as Element).closest<HTMLButtonElement>("[data-account],[data-process]");
      if (!label && (e.target as Element).closest("button")) { e.stopPropagation(); pointers.delete(e.pointerId); gesture = null; return; }
      gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, target: label?.dataset.account || null, process: label?.dataset.process as ProcessKey || null, cancelled: e.button !== 0 || !e.isPrimary || (!!(e.target as Element).closest("button") && !label) };
      targetZoom = null; targetPosition = null;
    }
    function move(e: PointerEvent) { if (gesture && gesture.id === e.pointerId && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 7) gesture.cancelled = true; }
    function up(e: PointerEvent) {
      if (lostContext) return;
      const tap = gesture && gesture.id === e.pointerId && !gesture.cancelled && pointers.size === 1 && e.button === 0 && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) <= 7;
      pointers.delete(e.pointerId);
      if (!tap || !gesture) { if (!pointers.size) gesture = null; return; }
      const current = gesture; gesture = null;
      if (current.target) { propsRef.current.onSelect(current.target); return; }
      if (current.process) { propsRef.current.onInspectProcess?.(current.process); return; }
      camera.updateMatrixWorld(true); scene.updateMatrixWorld(true);
      const rect = renderer.domElement.getBoundingClientRect(), point = new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), ray = new THREE.Raycaster();
      ray.setFromCamera(point, camera);
      const hit = ray.intersectObject(buildingGroup, true).find(h => h.object.userData.accountId || h.object.userData.process);
      if (hit?.object.userData.accountId) propsRef.current.onSelect(hit.object.userData.accountId);
      else if (hit?.object.userData.process) propsRef.current.onInspectProcess?.(hit.object.userData.process);
    }
    function cancel(e: PointerEvent) { pointers.delete(e.pointerId); if (gesture) gesture.cancelled = true; if (!pointers.size) gesture = null; }
    element.addEventListener("pointerdown", down, true); element.addEventListener("pointermove", move, true); element.addEventListener("pointerup", up, true); element.addEventListener("pointercancel", cancel, true);
    function lost(e: Event) { e.preventDefault(); lostContext = true; cancelAnimationFrame(frame); controls.enabled = false; setError("3D 화면 연결이 끊겼습니다."); propsRef.current.onReady(); }
    function restored() { if (!disposed) setAttempt(a => a + 1); }
    renderer.domElement.addEventListener("webglcontextlost", lost); renderer.domElement.addEventListener("webglcontextrestored", restored);
    let lastTime = performance.now(), lastDraw = 0, totalFrames = 0, fps = 0, frameCount = 0, fpsStart = lastTime, renderMs = 0, lastState = "";
    function projectLabels() {
      const width = element.clientWidth, height = element.clientHeight, nodes: LabelPosition[] = [], anchors = new Map<string, {x: number; y: number}>();
      const add = (id: string, x: number, z: number) => {
        const marker = markers.current.get(id); if (!marker) return;
        const v = new THREE.Vector3(x, 0.3, z + 3.3).project(camera), px = (v.x * 0.5 + 0.5) * width, py = (-v.y * 0.5 + 0.5) * height;
        const inside = overview || (px > -40 && px < width + 40 && py > safe.top - 70 && py < safe.bottom + 70);
        marker.style.visibility = inside ? "visible" : "hidden";
        const leader = leaders.current.get(id); if (leader) leader.style.visibility = inside ? "visible" : "hidden";
        if (!inside) return;
        const bounds = marker.getBoundingClientRect();
        // Round fractional text widths outward, ignoring transform floating-point noise.
        anchors.set(id, {x: px, y: py}); nodes.push({ id, x: px, y: py, width: Math.ceil(bounds.width - 0.001), height: Math.ceil(bounds.height - 0.001) });
      };
      for (const a of propsRef.current.snapshot.accounts) { const p = layout.plots[a.number - 1]; if (p) add(a.id, p[0], p[1]); }
      for (let i = 0; i < processes.length; i++) add("process-" + processes[i].key, ...layout.facilities[i]);
      // Preserve spatial ordering while reserving the selected target's exact hit area first.
      nodes.sort((a, b) => a.id === propsRef.current.selected ? -1 : b.id === propsRef.current.selected ? 1 : a.y - b.y || a.x - b.x);
      const arranged = layout.cols === 7 && element.clientHeight < 300 ? (() => {
        // A low landscape viewport has three actual facility rows. Reserve those rows together
        // so a greedy collision solver cannot push the last account to the opposite side.
        const groups = [nodes.filter(node => node.id.startsWith("process-")), nodes.filter(node => { const a = propsRef.current.snapshot.accounts.find(a => a.id === node.id); return a && a.number <= 7; }), nodes.filter(node => { const a = propsRef.current.snapshot.accounts.find(a => a.id === node.id); return a && a.number > 7; })];
        return groups.flatMap((group, row) => {
          group.sort((a, b) => a.x - b.x);
          const step = Math.max(...group.map(node => node.width), 0) + 4;
          const anchorCenter = group.reduce((sum, node) => sum + node.x, 0) / Math.max(group.length, 1);
          const half = (group.length - 1) * step / 2;
          const center = THREE.MathUtils.clamp(anchorCenter, safe.left + half + step / 2, safe.right - half - step / 2);
          return group.map((node, i) => ({ ...node, x: center + (i - (group.length - 1) / 2) * step, y: safe.top + 24 + row * (safe.bottom - safe.top - 48) / 2 }));
        });
      })() : arrangeLabels(nodes, safe);
      for (const position of arranged) {
        const marker = markers.current.get(position.id), anchor = anchors.get(position.id)!, line = leaders.current.get(position.id);
        if (marker) {
          marker.style.transform = `translate(${position.x}px,${position.y}px) translate(-50%,-50%)`;
          marker.dataset.anchorX = anchor.x.toFixed(2); marker.dataset.anchorY = anchor.y.toFixed(2);
        }
        if (line) {
          const a = propsRef.current.snapshot.accounts.find(a => a.id === position.id);
          line.dataset.important = String(position.id === propsRef.current.selected || (!!a && (["danger", "warning"].includes(severity(a)) || pending(a, propsRef.current.commands))) || position.id === "process-" + propsRef.current.activeProcess || Math.hypot(position.x - anchor.x, position.y - anchor.y) > 28);
          line.setAttribute("x1", String(anchor.x)); line.setAttribute("y1", String(anchor.y)); line.setAttribute("x2", String(position.x)); line.setAttribute("y2", String(position.y)); line.style.opacity = Math.hypot(position.x - anchor.x, position.y - anchor.y) > 9 ? "0.65" : "0"; }
      }
    }
    function render(now: number) {
      if (disposed || lostContext) return;
      frame = requestAnimationFrame(render);
      if (document.hidden || now - lastDraw < 1000 / 32) return;
      const dt = Math.min((now - lastTime) / 1000, 0.1); lastTime = now;
      const current = propsRef.current;
      const state = current.selected + current.layer + current.snapshot.observedAt + String(current.stale) + current.activeProcess + (current.commands || []).map(c => c.id + c.status).join();
      if (state !== lastState) { dirty = true; lastState = state; }
      if (targetPosition) {
        const delta = targetPosition.clone().sub(controls.target), alpha = current.reduced ? 1 : 1 - Math.exp(-12 * Math.max(dt, 1 / 60));
        if (delta.length() < 0.008) { controls.target.copy(targetPosition); targetPosition = null; }
        else { delta.multiplyScalar(alpha); controls.target.add(delta); camera.position.add(delta); }
        dirty = true;
      }
      if (targetZoom !== null) {
        camera.zoom = THREE.MathUtils.lerp(camera.zoom, targetZoom, current.reduced ? 1 : 1 - Math.exp(-12 * Math.max(dt, 1 / 60)));
        if (Math.abs(camera.zoom - targetZoom) < 0.001) { camera.zoom = targetZoom; targetZoom = null; }
        camera.updateProjectionMatrix(); dirty = true;
      }
      controls.update();
      for (const [key, indicator] of moving) {
        const active = processState(key, current.snapshot, current.stale).active;
        indicator.visible = active;
        if (active && !current.reduced) { indicator.rotation.z += dt * 1.6; dirty = true; }
      }
      const reviewActive = processState("review", current.snapshot, current.stale).active;
      for (const scan of processScanners) {
        scan.visible = reviewActive;
        if (reviewActive && !current.reduced) { scan.position.y = 2.15 + Math.sin(now / 700) * 0.82; dirty = true; }
      }
      if (dirty && ready) {
        const totalReady = current.snapshot.accounts.reduce((sum, a) => sum + a.ready, 0);
        const totalTarget = current.snapshot.accounts.reduce((sum, a) => sum + a.target, 0);
        const reserveRatio = totalTarget > 0 ? Math.max(0, totalReady / totalTarget) : 0;
        processStock.forEach((slot, i) => { slot.visible = reserveRatio > i / 10; slot.scale.y = Math.max(0.12, THREE.MathUtils.clamp(reserveRatio * 10 - i, 0, 1)); });
        for (const a of current.snapshot.accounts) {
          const select = selections.get(a.id); if (select) select.visible = a.id === current.selected;
          const light = lights.get(a.id); if (light) { const material = light.material as THREE.MeshStandardMaterial; const color = current.stale ? theme.muted : severity(a) === "active" ? theme.accent : ["danger", "warning"].includes(severity(a)) ? theme.ink : theme.muted; material.color.set(color); material.emissive.set(color); }
          // Ten marked capacity slots always mean the account's actual target; no arbitrary 120-item cap.
          const ratio = a.target > 0 ? Math.max(0, a.ready / a.target) : 0;
          cargo.get(a.id)?.forEach((slot, i) => { slot.visible = ratio > i / 10; const partial = THREE.MathUtils.clamp(ratio * 10 - i, 0, 1); slot.scale.y = Math.max(0.12, partial); });
        }
        for (const [key, light] of processLights) { const material = light.material as THREE.MeshStandardMaterial; const state = processState(key, current.snapshot, current.stale); const color = state.active ? theme.accent : state.tone === "warning" ? theme.ink : theme.muted; material.color.set(color); material.emissive.set(color); }
        scene.updateMatrixWorld(true);
        const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
        for (const batch of stockBatches) {
          batch.sources.forEach((source, i) => batch.mesh.setMatrixAt(i, batch.slots[i].visible ? source.matrixWorld : hiddenMatrix));
          batch.mesh.instanceMatrix.needsUpdate = true;
        }
        // OrbitControls changes quaternion; update both camera matrices before any HTML projection.
        camera.updateMatrixWorld(true); projectLabels();
        const start = performance.now(); renderer.render(scene, camera); renderMs = performance.now() - start;
        totalFrames++; frameCount++; lastDraw = now; dirty = false;
      }
      if (now - fpsStart >= 1000) { fps = Math.round(frameCount * 1000 / (now - fpsStart)); frameCount = 0; fpsStart = now; }
      (window as unknown as { __bizWorld: unknown }).__bizWorld = { fps, totalFrames, renderMs, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, loaded: models.size, zoom: camera.zoom, safe, layoutColumns: layout.cols,
        cargo: current.snapshot.accounts.map(a => ({ id: a.id, ready: a.ready, target: a.target, visible: cargo.get(a.id)?.filter(o => o.visible).length || 0 })),
        processes: [...processGroups.entries()].map(([key, group]) => ({ key, role: group.userData.role, bounds: new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray() })),
        reserveSlots: processStock.filter(slot => slot.visible).length,
        camera: { matrixWorld: camera.matrixWorld.toArray(), projection: camera.projectionMatrix.toArray() }, ready, appearance: { dark, background: ui.canvas, ground: theme.surface, road: theme.muted, pad: theme.paper, daylight }, modelFailures: modelNamesToLoad.filter(name => !models.has(name)) };
    }
    let previousViewportHeight = element.clientHeight;
    function resize() {
      const width = element.clientWidth, height = element.clientHeight; if (!width || !height) return;
      element.dataset.detailed = String(width >= 1024 || (width >= 768 && layout.cols <= 5));
      const next = siteLayout(width, height); if (next.cols !== layout.cols) { setMode(m => m + 1); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setSize(width, height); readSafe();
      if (overview) fit(); else {
        const unitsPerPixel = (camera.top - camera.bottom) / Math.max(previousViewportHeight, 1);
        camera.left = -width * unitsPerPixel / 2; camera.right = width * unitsPerPixel / 2;
        camera.top = height * unitsPerPixel / 2; camera.bottom = -height * unitsPerPixel / 2;
        camera.updateProjectionMatrix(); dirty = true;
      }
      previousViewportHeight = height;
    }
    // Keep WebGL appearance in sync with both explicit and operating-system themes.
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const refreshAppearance = () => {
      const current = getComputedStyle(element);
      if (current.getPropertyValue("--ui-bg").trim() !== ui.canvas || current.getPropertyValue("--ui-surface").trim() !== ui.paper) setAppearance(value => value + 1);
    };
    const themeObserver = new MutationObserver(refreshAppearance);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    colorScheme.addEventListener("change", refreshAppearance);
    const observer = new ResizeObserver(resize); observer.observe(element); resize(); frame = requestAnimationFrame(render);
    return () => {
      disposed = true; abort.abort(); cancelAnimationFrame(frame); observer.disconnect(); themeObserver.disconnect(); colorScheme.removeEventListener("change", refreshAppearance); controls.dispose();
      element.removeEventListener("pointerdown", down, true); element.removeEventListener("pointermove", move, true); element.removeEventListener("pointerup", up, true); element.removeEventListener("pointercancel", cancel, true);
      renderer.domElement.removeEventListener("webglcontextlost", lost); renderer.domElement.removeEventListener("webglcontextrestored", restored);
      disposeObject(scene); models.forEach(disposeObject); renderer.dispose(); renderer.domElement.remove(); controller.current = null;
    };
  }, [attempt, mode, appearance]);
  function bindMarker(id: string, element: HTMLButtonElement | null) { if (element) markers.current.set(id, element); else markers.current.delete(id); }
  const allIds = [...props.snapshot.accounts.map(a => a.id), ...processes.map(p => "process-" + p.key)];
  const icons = { generation: Factory, review: ScanLine, stock: Package, submission: Truck };
  return <div ref={host} data-layer={props.layer} className={`world business-world ${error ? "world-failed" : ""} ${props.reduced ? "reduced" : ""}`}>
    {loaded && !error && missingModels > 0 && <button className="world-model-retry" onPointerDown={e => e.stopPropagation()} onClick={() => setAttempt(a => a + 1)}><RotateCcw size={13}/>모형 {missingModels}개 다시 받기</button>}
    {!loaded && !error && <div className="world-loading"><span className="loader"/><span>사업 단지를 불러오는 중</span></div>}
    {error ? <div className="world-fallback"><h2>시설 목록</h2><p>{error}</p><button className="world-retry" onClick={() => setAttempt(a => a + 1)}><RotateCcw size={16}/>3D 다시 연결</button><div className="fallback-plots">{props.snapshot.accounts.map(a => <button key={a.id} onClick={() => props.onSelect(a.id)}><AccountState account={a} waiting={pending(a, props.commands)} stale={props.stale}/><b>{a.number}</b><span>{a.name}</span><strong>{n(a.ready)}</strong></button>)}</div></div>
    : <><svg className="world-leaders" aria-hidden="true">{allIds.map(id => <line key={id} ref={el => { if (el) leaders.current.set(id, el); else leaders.current.delete(id); }}/>)}</svg><div className="world-markers">
      {props.snapshot.accounts.map(a => {
        const waiting = pending(a, props.commands);
        return <button key={a.id} ref={el => bindMarker(a.id, el)} className={`plot-label ${props.selected === a.id ? "selected" : ""} ${props.stale ? "unknown" : severity(a)} ${waiting ? "has-command" : ""}`}
          onClick={e => { if (e.detail === 0) props.onSelect(a.id); }} aria-label={`${a.number}번 ${a.name}, ${props.stale ? "상태 확인 필요" : waiting ? "지시 대기" : status(a)}, 제출 가능 ${a.ready}개, 목표 ${a.target}개`} data-account={a.id} title={`${a.name} · ${waiting ? "지시 대기" : status(a)}`}>
          <span className="account-marker-top"><span className="account-number">{String(a.number).padStart(2,"0")}</span><AccountState account={a} waiting={waiting} stale={props.stale}/></span>
          <span className="account-alias">{styleLabels[a.style] || a.name.slice(0, 4)}</span>
          {props.layer !== "status" && <b className="account-layer-value">{n(props.layer === "stock" ? a.ready : a.counts.submitted || 0)}</b>}
          <span className="plot-tooltip">{a.name} · {waiting ? "지시 대기" : status(a)}{props.layer === "stock" ? ` · 재고 ${n(a.ready)}` : props.layer === "review" ? ` · 심사 ${n(a.counts.submitted || 0)}` : ""}</span>
        </button>;
      })}
      {processes.map(process => { const state = processState(process.key, props.snapshot, props.stale), Icon = icons[process.key]; return <button key={process.key} ref={el => bindMarker("process-" + process.key, el)} data-process={process.key} className={`process-label ${state.tone} ${props.activeProcess === process.key ? "selected" : ""}`}
        onClick={e => { if (e.detail === 0) props.onInspectProcess?.(process.key); }} aria-label={`${process.name}, ${state.label}`} title={`${process.name} · ${state.label}`}><span><Icon size={13}/><strong>{process.name}</strong></span><small aria-hidden="true">{state.label}</small>{state.active ? <LoaderCircle className="process-live" size={14}/> : state.tone === "unknown" ? <Clock3 className="process-live" size={14}/> : null}</button>; })}
    </div></>}
  </div>;
});
export default World;
