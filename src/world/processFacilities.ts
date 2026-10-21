import * as THREE from "three";
import type { ProcessKey } from "./layout";

export interface FacilityPalette { machine: string; steel: string; roller: string; belt: string; capacity: string; concrete: string }

interface FacilityTools {
  key: ProcessKey;
  group: THREE.Group;
  box: (w: number, h: number, d: number, color: string, x: number, y: number, z: number, fixed?: boolean) => THREE.Mesh;
  model: (name: string, parent: THREE.Object3D, width: number, depth: number, height?: number) => THREE.Object3D | null;
  material: (color: string) => THREE.Material;
  palette: FacilityPalette;
}
export interface ProcessFacility {
  role: "production-line" | "inspection-gate" | "reserve-rack" | "loading-dock";
  stockSlots: THREE.Object3D[];
  scanner: THREE.Mesh | null;
}
/** Functional silhouettes remain readable when every HTML label is hidden. */
export function buildProcessFacility({ key, group, box, model, material, palette: facilityPalette }: FacilityTools): ProcessFacility {
  const result: ProcessFacility = { role: "production-line", stockSlots: [], scanner: null };
  const modelAt = (name: string, x: number, z: number, w: number, d: number, h: number) => {
    const anchor = new THREE.Group(); anchor.position.set(x, 0, z); group.add(anchor);
    return model(name, anchor, w, d, h);
  };
  if (key === "generation") {
    // A compact press line and extraction pipes change the factory's silhouette, not its output.
    modelAt("building-k", 1.1, -0.9, 3.3, 3.0, 3.4);
    for (const x of [-2.9, -2.1]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.34, 3.1, 10), material(facilityPalette.steel));
      pipe.position.set(x, 1.93, -1.4); pipe.castShadow = true; group.add(pipe);
      box(0.79, 0.16, 0.79, facilityPalette.machine, x, 3.53, -1.4);
    }
    box(5.7, 0.35, 1.24, facilityPalette.steel, 0, 0.81, 1.2);
    box(5.4, 0.10, 0.96, facilityPalette.belt, 0, 1.04, 1.2);
    for (const x of [-2.15, -1.1, 0, 1.1, 2.15]) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.96, 8), material(facilityPalette.roller));
      roller.rotation.x = Math.PI / 2; roller.position.set(x, 1.11, 1.2); roller.castShadow = true; group.add(roller);
    }
    // The fixed press straddles the belt. No fictional item advances through it.
    for (const x of [-0.85, 0.85]) box(0.27, 1.75, 1.3, facilityPalette.steel, x, 1.46, 1.2);
    box(2.25, 0.44, 1.45, facilityPalette.machine, 0, 2.48, 1.2);
    box(0.8, 0.78, 0.75, facilityPalette.capacity, 0, 1.91, 1.2);
  } else if (key === "review") {
    result.role = "inspection-gate";
    modelAt("building-h", 0, -1.55, 3.3, 2.0, 2.4);
    // A full-size open inspection frame and table, unlike any account building.
    for (const x of [-2.45, 2.45]) box(0.36, 3.0, 0.90, facilityPalette.machine, x, 1.94, 1.08);
    box(5.25, 0.48, 0.96, facilityPalette.machine, 0, 3.58, 1.08);
    box(4.4, 0.15, 1.7, facilityPalette.steel, 0, 1.02, 1.12);
    for (const x of [-1.8, 1.8]) box(0.22, 0.65, 1.45, facilityPalette.steel, x, 0.69, 1.12);
    for (const x of [-1.75, 0, 1.75]) box(0.26, 0.20, 0.12, facilityPalette.concrete, x, 3.45, 1.64);
    const scan = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.065, 0.07), new THREE.MeshStandardMaterial({ color: facilityPalette.machine, emissive: facilityPalette.machine, emissiveIntensity: 0.5 }));
    scan.position.set(0, 2.15, 1.54); scan.visible = false; group.add(scan); result.scanner = scan;
  } else if (key === "stock") {
    result.role = "reserve-rack";
    // The empty frame is capacity. Only original ready/target data fills the ten bays.
    for (const x of [-3.05, 3.05]) for (const z of [-0.8, 0.8]) box(0.18, 3.5, 0.18, facilityPalette.machine, x, 2.16, z);
    for (const y of [0.73, 2.15, 3.64]) {
      box(6.25, 0.15, 1.9, facilityPalette.steel, 0, y, 0);
      box(6.3, 0.20, 0.16, facilityPalette.capacity, 0, y + 0.02, 0.9);
    }
    for (const x of [-1.82, -0.60, 0.60, 1.82]) box(0.06, 3.35, 0.06, facilityPalette.steel, x, 2.15, -0.8);
    box(6.3, 0.10, 2.6, facilityPalette.concrete, 0, 0.48, 0.2);
    for (let i = 0; i < 10; i++) {
      const slot = new THREE.Group(); slot.position.set(-2.42 + (i % 5) * 1.21, 0.49 + Math.floor(i / 5) * 1.42, 0.08); group.add(slot);
      if (!model("box", slot, 0.93, 0.93, 0.95)) {
        const fallback = new THREE.Mesh(new THREE.BoxGeometry(0.93, 0.86, 0.93), material(facilityPalette.capacity)); fallback.position.y = 0.75; slot.add(fallback);
      }
      result.stockSlots.push(slot);
    }
  } else {
    result.role = "loading-dock";
    // A long loading apron, two bays and a real Kenney vehicle are a dock, not another account office.
    box(6.45, 0.52, 4.5, facilityPalette.steel, 0, 0.70, -0.25);
    box(6.30, 2.3, 0.85, facilityPalette.concrete, 0, 1.94, -1.98);
    for (const x of [-1.62, 1.62]) {
      box(2.20, 1.85, 0.10, facilityPalette.machine, x, 1.80, -1.48);
      box(2.22, 0.14, 0.23, facilityPalette.capacity, x, 2.75, -1.34);
      box(2.30, 0.24, 0.65, facilityPalette.steel, x, 0.98, 1.90);
    }
    for (const x of [-3.02, 0, 3.02]) box(0.16, 2.6, 0.16, facilityPalette.machine, x, 2.02, 0.70);
    box(6.65, 0.26, 3.55, facilityPalette.machine, 0, 3.42, -0.75);
    for (const x of [-2.94, 2.94]) box(0.16, 0.66, 0.16, facilityPalette.capacity, x, 0.87, 2.27);
    const vehicle = new THREE.Group(); vehicle.position.set(-1.58, 0.52, 1.02); group.add(vehicle);
    model("truck", vehicle, 1.72, 3.0, 1.67);
    // The uploader's run lock can also cover account checks, so the truck remains parked.
  }
  group.userData.role = result.role;
  return result;
}
