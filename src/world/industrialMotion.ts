import * as THREE from 'three';
import type { Snapshot } from '../types';
import { processState } from '../game-state';

/** The press has a source clip; the articulated arm has a project-authored clip. */
export const animatedModels = {
  'piston-square': {
    url: '/assets/animated-industry/piston-square.glb', clip: 'toggle',
    process: 'generation', speed: .2, min: [-.5, 0, -.5], max: [.5, 2, .5],
  },
  'robot-arm-pick': {
    url: '/assets/animated-industry/robot-arm-pick.glb', clip: 'pick-and-place',
    process: 'review', speed: 1, min: [-.5, 0, -.997], max: [1.305, 2.429, .997],
  },
} as const;
export type AnimatedModel = keyof typeof animatedModels;

export class IndustrialMotion {
  readonly mixer: THREE.AnimationMixer;
  readonly action: THREE.AnimationAction;
  readonly process: 'generation' | 'review';
  readonly nodes: THREE.Object3D[];
  running = false;

  constructor(readonly name: AnimatedModel, readonly root: THREE.Object3D, clip: THREE.AnimationClip) {
    const spec = animatedModels[name];
    this.process = spec.process;
    // Keep the rig hierarchy intact: neither static merging nor dynamic instancing owns it.
    root.userData.dynamic = true;
    this.mixer = new THREE.AnimationMixer(root);
    this.action = this.mixer.clipAction(clip);
    this.action.setLoop(THREE.LoopRepeat, Infinity).setEffectiveTimeScale(spec.speed).play();
    this.mixer.update(0);
    this.nodes = [...new Set(clip.tracks.map(track => track.name.split('.')[0]))]
      .map(name => root.getObjectByName(name)).filter((node): node is THREE.Object3D => !!node);
  }

  update(delta: number, snapshot: Snapshot, stale: boolean, reduced: boolean) {
    const running = !stale && !reduced && processState(this.process, snapshot, stale).active;
    const changed = running !== this.running;
    this.running = running;
    // No seek/reset while paused, no elapsed-time catch-up after a hidden tab.
    if (running && delta > 0) this.mixer.update(Math.min(delta, .05));
    return changed || (running && delta > 0);
  }

  inspect() {
    return { model: this.name, process: this.process, clip: this.action.getClip().name,
      running: this.running, time: this.mixer.time, phase: this.action.time,
      pose: this.nodes.flatMap(node => [...node.position.toArray(), ...node.quaternion.toArray()]) };
  }

  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root); }
}
