import * as THREE from "three";
import type { ProcessKey } from "./layout";

export const facilityRoles: Record<ProcessKey, string> = {
  generation: "production-line",
  review: "inspection-gate",
  stock: "reserve-rack",
  submission: "loading-dock",
};
interface Tools {
  key: ProcessKey;
  group: THREE.Group;
  model: (name: string, parent: THREE.Object3D, width: number, depth: number, height: number) => THREE.Object3D | null;
  atModel: (name: string, x: number, z: number, width: number, depth: number, height: number, parent: THREE.Object3D) => THREE.Object3D | null;
  box: (w: number, h: number, d: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D) => THREE.Object3D;
}
/** Authored buildings and kit props make a coherent place; only observed state animates. */
export function buildProcessFacility({ key, group, model, atModel, box }: Tools) {
  const building = model(key, group, 8, 6.3, 8);
  if (building) {
    building.position.z -= .7;
    building.traverse(object => { if (object instanceof THREE.Mesh) object.userData.buildingSurface = true; });
  }
  if (key === "generation") {
    atModel("tower", 3, -1.5, 2, 2, 6.5, group);
  } else if (key === "review") {
    for (const x of [-3.3, 3.3]) atModel("lamp", x, 2.3, .6, .8, 4.5, group);
    atModel("bench", 0, 2.4, 2.8, 1, 1.5, group);
  } else if (key === "stock") {
    for (const x of [-3.1, 2.8]) {
      atModel("pallet", x, 2.5, 1.7, 1.5, .4, group);
      atModel("crate", x, 2.5, 1.4, 1.3, 1.8, group);
    }
  } else {
    atModel("car", -2.5, 3.7, 1.65, 3.4, 1.6, group);
    box(7.4, .13, 1.7, "#d8c694", 0, .49, 2.8, group);
  }
  group.userData.role = facilityRoles[key];
  return key === "generation" ? 7.0 : building ? new THREE.Box3().setFromObject(building).getSize(new THREE.Vector3()).y : 6;
}
