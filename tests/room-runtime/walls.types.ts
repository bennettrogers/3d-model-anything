// Compile-only contract checks, included by tsc and excluded from production entry points.
import type * as THREE from 'three';
import { buildWall, type WallDef } from '../../packages/room-runtime/walls';

declare const frame: { name: string; origin: THREE.Vector3; u: THREE.Vector3; n: THREE.Vector3;
  length: number; thickness: number };
declare const paint: THREE.Material;
const profile = { ...frame, topProfile: [[0, 2], [3, 4], [6, 2]] as const,
  crown: false as const, ext: [0, 0] as [0, 0], panels: [] as [], openings: [] };
const valid: WallDef = profile;
buildWall(valid, { wall: paint, trim: paint });
const rectangle: WallDef = { ...frame, height: 3, panels: [], crown: true,
  openings: [{ kind: 'arch', u0: 1, u1: 2, v0: 0.5, spring: 2 }] };
buildWall(rectangle, { wall: paint, trim: paint });

// @ts-expect-error profile elevation comes from its points
const conflictingHeight: WallDef = { ...profile, height: 4 };
// @ts-expect-error roof-following crown is outside the supported profile contract
const crown: WallDef = { ...profile, crown: true };
// @ts-expect-error profile extensions must explicitly be zero
const extension: WallDef = { ...profile, ext: [0.1, 0] };
// @ts-expect-error profile walls support rectangular openings only
const arch: WallDef = { ...profile, openings: [{ kind: 'arch', u0: 1, u1: 2, v0: 0.5, spring: 2 }] };
// @ts-expect-error picture-frame panels are outside the supported profile contract
const panels: WallDef = { ...profile, panels: [[1, 1, 2, 2]] };
